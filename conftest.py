"""
conftest.py

This file is intentionally empty of real logic.

Its presence tells pytest "this is the project root" and causes pytest to
add this directory to sys.path automatically. That's what lets
tests/test_average.py do `from average import calculate_average` without
any extra configuration.
"""
