# basic-pytest-example

The simplest possible example of the same project structure used in
`iris-classifier` — source code and tests kept separate, tests run with
pytest — stripped down to one function and one test so the *structure*
is what stands out, not the logic.

## Structure

```
average-demo/          # (or whatever you named your repo)
├── average.py          # the source code being tested
├── tests/
│   └── test_average.py # the test, in its own folder
├── conftest.py          # marks this folder as the project root for pytest
└── requirements.txt
```

Notice: `average.py` and `test_average.py` are two separate files. The
test imports the function it's checking — it does not redefine it.

## Opening this in a browser-based VS Code

Same as `iris-classifier`: open this repo on GitHub, then change the URL
from `github.com/...` to `github.dev/...` (or press `.` on the keyboard
while viewing the repo). This opens a full VS Code editor in your browser,
no install required.

## Running it in-browser with no install at all (Pyodide + Monaco)

This repo also includes a `docs/` folder — `index.html` and
`pyodide-worker.js` — that runs Python and pytest entirely inside your
browser. Two technologies make this possible:

- **Pyodide** — a Python interpreter compiled to WebAssembly, running in a
  background Web Worker so the page never freezes while code executes
- **Monaco Editor** — the actual code-editing component that powers VS
  Code (syntax highlighting, the VS Code dark theme), loaded from a CDN

This is a direct adaptation of the same tool used in `iris-classifier`,
scoped down to the much smaller set of files this repo needs. The one
meaningful difference: `iris-classifier`'s worker loads NumPy and
scikit-learn before it can run anything, since its ML code depends on
them. This repo is plain Python, so the worker skips that step entirely
and only installs `pytest` — noticeably faster to load.

**To turn it on for your own fork:**

1. On your forked repo's GitHub page, click **Settings**
2. In the left sidebar, click **Pages**
3. Under **Build and deployment → Source**, choose **Deploy from a branch**
4. Set **Branch** to `main` and the folder to **`/docs`**
5. Click **Save** — GitHub will show your page's address after about a
   minute, something like:
   `https://<your-username>.github.io/<your-fork-name>/`

**Using the page:**

1. Open your page's address. Wait for the status dot to turn green:
   "Python runtime ready."
2. Enter your GitHub username and repo name, click **Load repo**
3. Click a file in the left sidebar to view it in the editor
4. Click **Run main.py** to see the example output, or **Run pytest** to
   run the test suite — both execute live, right in your browser

## Running the test

Open a terminal inside VS Code (Terminal → New Terminal), then:

```bash
pip install -r requirements.txt
pytest
```

Just `pytest` — no filename needed. Pytest automatically discovers any
file matching `test_*.py` inside the project, which is why the test file
lives in `tests/test_average.py` and is named that way.

## What's in `average.py`

```python
def calculate_average(scores):
    """Return the average of a list of scores, rounded to one decimal place."""
    return round(sum(scores) / len(scores), 1)
```

## What's in `tests/test_average.py`

```python
from average import calculate_average


def test_average_of_scores():
    # Arrange
    scores = [80, 90, 70, 100]

    # Act
    result = calculate_average(scores)

    # Assert
    assert result == 85.0
```

## Try it yourself

1. Delete the body of `calculate_average` and run `pytest` again — watch
   it fail, and read the error message pytest gives you.
2. Rewrite `calculate_average` yourself from scratch, with no other
   changes, and run `pytest` again — when it passes, you've satisfied
   the spec the test defined.
