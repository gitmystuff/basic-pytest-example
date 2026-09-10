/*
 * pyodide-worker.js
 *
 * Runs in a Web Worker so that Python execution never blocks the main
 * thread / UI. Handles three jobs, triggered by postMessage from the
 * main page:
 *   - init: load Pyodide + pytest (one-time). No ML packages needed —
 *     this repo is plain Python, unlike iris-classifier which also
 *     loads scikit-learn/numpy/pandas here.
 *   - fetchRepo: pull a repo's files from GitHub and write them into
 *     Pyodide's virtual filesystem, preserving folder structure
 *   - runMain / runTests: execute code, streaming stdout back
 */

importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");

let pyodide = null;
let pyodideReadyPromise = null;

// Files required for main.py/pytest to actually run. If any of these are
// missing, loading the repo should fail loudly.
const REQUIRED_FILES = [
  "average.py",
  "conftest.py",
  "main.py",
  "tests/test_average.py",
];

// Files that are nice to browse in the editor (to mimic a real VS Code
// file explorer) but aren't needed to execute anything. If a fork is
// missing one of these (e.g. someone removes the LICENSE), that should
// NOT break loading the repo — these are fetched best-effort.
const DISPLAY_ONLY_FILES = [
  "README.md",
  "requirements.txt",
  "LICENSE",
  "docs/index.html",
  "docs/pyodide-worker.js",
];

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

// Extract a readable string from any thrown value, including non-standard
// error shapes (e.g. Emscripten's FS.ErrnoError, or Pyodide's PythonError)
// that don't always stringify cleanly via String(err) or err.message.
function describeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message && typeof err.message === "string" && err.message.length > 0) {
    return err.message;
  }
  if (typeof err.toString === "function") {
    const s = err.toString();
    if (s && s !== "[object Object]") return s;
  }
  try {
    return JSON.stringify(err);
  } catch (e) {
    return "An error occurred that could not be described (" + Object.prototype.toString.call(err) + ")";
  }
}

async function initPyodide() {
  if (pyodideReadyPromise) return pyodideReadyPromise;

  pyodideReadyPromise = (async () => {
    post("status", { message: "Downloading Python runtime…" });
    pyodide = await loadPyodide();

    // Unlike a project that needs scikit-learn/numpy/pandas, this repo is
    // plain Python — only pytest is needed, so there's no extra ML package
    // download step here.
    post("status", { message: "Installing pytest…" });
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install("pytest");

    post("ready", {});
  })();

  return pyodideReadyPromise;
}

// Fetch a single file's raw text from a public GitHub repo.
async function fetchRawFile(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch ${path} (HTTP ${res.status}). Check the repo, branch, and that it's public.`);
  }
  return await res.text();
}

async function fetchRepoAndPopulate(owner, repo, branch) {
  await initPyodide();

  const files = {};
  const allPaths = [...REQUIRED_FILES, ...DISPLAY_ONLY_FILES];
  let completed = 0;

  for (const relPath of REQUIRED_FILES) {
    post("fetchProgress", { path: relPath, completed, total: allPaths.length });
    // Required files must succeed — let a failure here throw and abort
    // the whole load, since main.py/pytest can't run without them.
    files[relPath] = await fetchRawFile(owner, repo, branch, relPath);
    completed += 1;
  }

  for (const relPath of DISPLAY_ONLY_FILES) {
    post("fetchProgress", { path: relPath, completed, total: allPaths.length });
    try {
      files[relPath] = await fetchRawFile(owner, repo, branch, relPath);
    } catch (e) {
      // Missing display-only file on a fork (e.g. no LICENSE) — skip it
      // quietly rather than failing the whole load.
    }
    completed += 1;
  }

  // Use a dedicated, absolute project root rather than relative paths.
  // Relative paths depend on the FS's current working directory, which
  // is not guaranteed to be consistent across Pyodide versions/workers.
  const root = "/project";
  if (!pyodide.FS.analyzePath(root).exists) {
    pyodide.FS.mkdir(root);
  }

  // Create every needed subdirectory first (sorted so parents are made
  // before children), then write all successfully-fetched files.
  const dirsNeeded = new Set();
  for (const relPath of Object.keys(files)) {
    if (relPath.includes("/")) {
      const parts = relPath.split("/").slice(0, -1);
      let acc = root;
      for (const part of parts) {
        acc += "/" + part;
        dirsNeeded.add(acc);
      }
    }
  }
  for (const dirPath of Array.from(dirsNeeded).sort()) {
    if (!pyodide.FS.analyzePath(dirPath).exists) {
      pyodide.FS.mkdir(dirPath);
    }
  }

  for (const relPath of Object.keys(files)) {
    const fullPath = `${root}/${relPath}`;
    try {
      pyodide.FS.writeFile(fullPath, files[relPath]);
    } catch (e) {
      throw new Error(`Failed writing ${fullPath} into the Python filesystem: ${describeError(e)}`);
    }
  }

  post("repoLoaded", { files });
}

async function runMain() {
  await initPyodide();

  let output = "";
  pyodide.setStdout({ batched: (msg) => { output += msg + "\n"; } });
  pyodide.setStderr({ batched: (msg) => { output += msg + "\n"; } });

  try {
    // Modules from a previous run may still be cached in sys.modules. If
    // the student re-loads an updated repo, stale cached code would
    // otherwise silently run instead of the freshly-fetched files.
    await pyodide.runPythonAsync(`
import sys
if "/project" not in sys.path:
    sys.path.insert(0, "/project")
for mod_name in list(sys.modules):
    if mod_name == "average":
        del sys.modules[mod_name]
`);
    const code = pyodide.FS.readFile("/project/main.py", { encoding: "utf8" });
    // main.py is written with `if __name__ == "__main__": run()`. When run
    // via runPythonAsync, the module-level __name__ is not "__main__", so
    // that guard never fires. Set __name__ explicitly before exec'ing so
    // the script behaves exactly as it would from a real command line.
    pyodide.globals.set("__name__", "__main__");
    await pyodide.runPythonAsync(code);
    post("runComplete", { kind: "main", output, success: true });
  } catch (err) {
    post("runComplete", { kind: "main", output: output + "\n" + describeError(err), success: false });
  } finally {
    pyodide.setStdout({});
    pyodide.setStderr({});
  }
}

async function runTests() {
  await initPyodide();

  let output = "";
  pyodide.setStdout({ batched: (msg) => { output += msg + "\n"; } });
  pyodide.setStderr({ batched: (msg) => { output += msg + "\n"; } });

  try {
    await pyodide.runPythonAsync(`
import sys
if "/project" not in sys.path:
    sys.path.insert(0, "/project")
for mod_name in list(sys.modules):
    if mod_name == "average":
        del sys.modules[mod_name]
import pytest
exit_code = int(pytest.main(["/project/tests", "-v", "--no-header", "-p", "no:cacheprovider"]))
`);
    const exitCode = pyodide.globals.get("exit_code");
    post("runComplete", { kind: "tests", output, success: exitCode === 0 });
  } catch (err) {
    post("runComplete", { kind: "tests", output: output + "\n" + describeError(err), success: false });
  } finally {
    pyodide.setStdout({});
    pyodide.setStderr({});
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  try {
    if (type === "init") {
      await initPyodide();
    } else if (type === "fetchRepo") {
      await fetchRepoAndPopulate(payload.owner, payload.repo, payload.branch);
    } else if (type === "runMain") {
      await runMain();
    } else if (type === "runTests") {
      await runTests();
    }
  } catch (err) {
    post("error", { message: describeError(err) });
  }
};
