"""
average.py

Calculates the average of a list of numeric scores. This is the one
piece of logic under test in this demo repo.
"""


def calculate_average(scores):
    """Return the average of a list of scores, rounded to one decimal place."""
    return round(sum(scores) / len(scores), 1)
