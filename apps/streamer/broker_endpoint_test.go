package main

import (
	"testing"

	analysispkg "github.com/dellmology/streamer/internal/analysis"
)

// Basic smoke test for AnalyzeBrokerFlow: it should always return a map with
// at least "symbol" and "status" keys even if the DB is unreachable.
func TestAnalyzeBrokerFlowSmoke(t *testing.T) {
    res := analysispkg.AnalyzeBrokerFlow("BBCA", 3)
    if res == nil {
        t.Fatalf("expected non-nil result from AnalyzeBrokerFlow")
    }
    if _, ok := res["symbol"]; !ok {
        t.Fatalf("missing symbol key in AnalyzeBrokerFlow result")
    }
    if _, ok := res["status"]; !ok {
        t.Fatalf("missing status key in AnalyzeBrokerFlow result")
    }
}
