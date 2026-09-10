"""
test_average.py

Pytest test(s) for average.py. Written test-first: this defines what
"correct" means for calculate_average() before the implementation exists.
"""

from average import calculate_average


def test_average_of_scores():
    # Arrange
    scores = [80, 90, 70, 100]

    # Act
    result = calculate_average(scores)

    # Assert
    assert result == 85.0
