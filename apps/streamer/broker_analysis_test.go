package main

import (
    "math"
    "testing"
)

func TestCalculateZScore(t *testing.T) {
    ba := NewBrokerAnalyzer(10)
    brokerID := "BRK1"

    // historical net buy values
    history := []int64{100, 120, 110, 130, 90}
    for _, v := range history {
        ba.AddBrokerData(brokerID, v)
    }

    // current value significantly higher
    current := int64(200)
    z := ba.CalculateZScore(brokerID, current)

    // manual mean and stddev
    var sum float64
    for _, v := range history {
        sum += float64(v)
    }
    mean := sum / float64(len(history))
    var sumSq float64
    for _, v := range history {
        d := float64(v) - mean
        sumSq += d * d
    }
    stddev := math.Sqrt(sumSq / float64(len(history)-1))

    if stddev == 0 {
        t.Fatalf("stddev is zero, unexpected")
    }

    expected := (float64(current) - mean) / stddev

    if math.Abs(z-expected) > 1e-9 {
        t.Fatalf("Z-Score mismatch: got %.6f expected %.6f", z, expected)
    }
}
