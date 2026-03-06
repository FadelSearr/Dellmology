"""Simple CNN scaffold for Fase 5 (placeholder).
This is a lightweight, dependency-free scaffold exposing a `SimpleCNN` class
with a `predict` method so downstream code and tests can import and run.
"""

from typing import List

class SimpleCNN:
    def __init__(self, input_shape=(64,64,1), num_classes=2):
        self.input_shape = input_shape
        self.num_classes = num_classes

    def predict(self, inputs: List[List[List[float]]]):
        # inputs: batch of 2D arrays; this placeholder returns zeros
        batch_size = len(inputs)
        return [[0.0]*self.num_classes for _ in range(batch_size)]

    def summary(self) -> str:
        return f"SimpleCNN(input_shape={self.input_shape}, num_classes={self.num_classes})"
