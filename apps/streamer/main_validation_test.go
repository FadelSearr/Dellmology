package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestProcessMessage_ValidTrade_WritesToMessages(t *testing.T) {
    // prepare broker
    sseBroker = newBroker()

    // ensure channel empty
    if len(sseBroker.messages) != 0 {
        t.Fatalf("expected empty messages channel at start")
    }

    // build trade message
    trade := map[string]interface{}{
        "s": "BBCA",
        "p": 100.0,
        "v": 10,
        "dt": time.Now().Unix(),
        "market": "REGULER",
    }
    dataBytes, _ := json.Marshal(trade)
    ws := map[string]json.RawMessage{}
    wsType := []byte(`"trade"`)
    ws["t"] = wsType
    ws["d"] = dataBytes
    msgBytes, _ := json.Marshal(ws)

    processMessage(msgBytes)

    if len(sseBroker.messages) == 0 {
        t.Fatalf("expected messages channel to have data after processing valid trade")
    }
    // consume to keep state clean
    select {
    case <-sseBroker.messages:
    default:
    }
}

func TestProcessMessage_InvalidTrade_Dropped(t *testing.T) {
    sseBroker = newBroker()

    if len(sseBroker.messages) != 0 {
        t.Fatalf("expected empty messages channel at start")
    }

    // invalid trade (zero price)
    trade := map[string]interface{}{
        "s": "BBCA",
        "p": 0.0,
        "v": -1,
        "dt": time.Now().Unix(),
        "market": "REGULER",
    }
    dataBytes, _ := json.Marshal(trade)
    ws := map[string]json.RawMessage{}
    wsType := []byte(`"trade"`)
    ws["t"] = wsType
    ws["d"] = dataBytes
    msgBytes, _ := json.Marshal(ws)

    processMessage(msgBytes)

    if len(sseBroker.messages) != 0 {
        t.Fatalf("expected messages channel to remain empty for invalid trade")
    }
}
