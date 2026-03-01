package main

import (
	"reflect"
	"testing"
	"time"
)

func TestDetectAnomalies_Spoofing(t *testing.T) {
    // Prepare previous snapshot with a large bid that disappears
    prev := &OrderBookSnapshot{
        Timestamp: time.Now().Add(-1 * time.Second),
        Bids: map[float64]int64{
            1000.0: 5000,
        },
        Asks: map[float64]int64{},
        LastPrice: 1000.0,
        Bid: 1000.0,
        Ask: 1000.5,
    }
    current := &OrderBookSnapshot{
        Timestamp: time.Now(),
        Bids: map[float64]int64{
            1000.0: 0,
        },
        Asks: map[float64]int64{},
        LastPrice: 1000.0,
        Bid: 1000.0,
        Ask: 1000.5,
    }

    orderFlowTracker.orderHistory["TEST"] = prev
    res := detectAnomalies("TEST", current)
    if len(res) == 0 {
        t.Fatal("Expected at least one anomaly for spoofing")
    }
    if res[0].Type != "SPOOFING" {
        t.Errorf("Expected SPOOFING anomaly but got %s", res[0].Type)
    }
}

func TestGenerateHeatmapData_Intensity(t *testing.T) {
    current := &OrderBookSnapshot{
        Timestamp: time.Now(),
        Bids: map[float64]int64{1000.0: 100, 1001.0: 200},
        Asks: map[float64]int64{1002.0: 50},
        LastPrice: 1000.5,
        Bid: 1000.0,
        Ask: 1000.5,
    }
    prev := &OrderBookSnapshot{}
    rows := generateHeatmapData("TEST", current, prev)
    if len(rows) == 0 {
        t.Fatal("Expected non-empty heatmap rows")
    }
    for _, r := range rows {
        if r.Intensity < 0 || r.Intensity > 1 {
            t.Errorf("Intensity out of range: %f", r.Intensity)
        }
    }
}

func TestCacheHelpers(t *testing.T) {
    if redisClient == nil {
        t.Skip("Redis not configured, skipping cache tests")
    }

    key := "test:key"
    val := map[string]string{"foo": "bar"}
    cacheSet(key, val, 1*time.Second)
    var out map[string]string
    ok := cacheGet(key, &out)
    if !ok || !reflect.DeepEqual(out, val) {
        t.Errorf("CacheGet returned wrong value: %v", out)
    }
}
