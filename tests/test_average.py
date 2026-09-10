from average import calculate_average


def test_average_of_scores():
    # Arrange
    scores = [80, 90, 70, 100]

    # Act
    result = calculate_average(scores)

    # Assert
    assert result == 85.0
