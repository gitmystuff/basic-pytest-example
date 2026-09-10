"""
main.py

Entry point that ties average.py together into a small, runnable example.
Run this file directly (`python main.py`) to see calculate_average() used
on a sample list of scores.
"""

from average import calculate_average

if __name__ == "__main__":
    scores = [80, 90, 70, 100]
    print(f"Scores: {scores}")
    print(f"Average: {calculate_average(scores)}")
