// WebSocket and Real-time Data Handling
package data

import (
	"encoding/json"
	"log"
	"time"

	"github.com/dellmology/streamer/internal/validator"
	"github.com/gorilla/websocket"
)

// StreamHandler manages WebSocket connections
type StreamHandler struct {
	conn *websocket.Conn
}

// NewStreamHandler creates a new stream handler
func NewStreamHandler(conn *websocket.Conn) *StreamHandler {
	return &StreamHandler{conn: conn}
}

// ReadMessage reads and parses incoming WebSocket messages
func (sh *StreamHandler) ReadMessage(v interface{}) error {
	return sh.conn.ReadJSON(v)
}

// Close closes the WebSocket connection
func (sh *StreamHandler) Close() error {
	return sh.conn.Close()
}

// ProcessTradeMessage processes incoming trade messages
func ProcessTradeMessage(data json.RawMessage) (map[string]interface{}, error) {
	var trade map[string]interface{}
	if err := json.Unmarshal(data, &trade); err != nil {
		log.Printf("Error parsing trade message: %v", err)
		return nil, err
	}

	// attempt to extract common fields
	price := 0.0
	volume := int64(0)
	if v, ok := trade["price"]; ok {
		switch x := v.(type) {
		case float64:
			price = x
		case int:
			price = float64(x)
		}
	}
	if v, ok := trade["volume"]; ok {
		switch x := v.(type) {
		case float64:
			volume = int64(x)
		case int:
			volume = int64(x)
		case int64:
			volume = x
		}
	}

	// extract bid/ask if provided for better aggression detection
	bid := price - 1.0
	ask := price + 1.0
	if v, ok := trade["bid"]; ok {
		if f, ok2 := v.(float64); ok2 {
			bid = f
		}
	}
	if v, ok := trade["ask"]; ok {
		if f, ok2 := v.(float64); ok2 {
			ask = f
		}
	}

	tr := validator.TradeRecord{
		Symbol:    "",
		Price:     price,
		Volume:    volume,
		Timestamp: time.Now(),
	}
	if v, ok := trade["symbol"]; ok {
		if s, ok2 := v.(string); ok2 {
			tr.Symbol = s
		}
	}

	agg := validator.DetectAggressive(tr, bid, ask)
	if agg == validator.HAKA {
		trade["aggression"] = "HAKA"
	} else if agg == validator.HAKI {
		trade["aggression"] = "HAKI"
	}

	// persist to database (best-effort, non-blocking)
	go func(sym string, p float64, v int64, tt string) {
		if err := StoreRawTrade(sym, p, v, tt); err != nil {
			log.Printf("Warning: failed to persist trade %s @ %v: %v", sym, p, err)
		}
	}(tr.Symbol, tr.Price, tr.Volume, func() string {
		if agg == validator.HAKA {
			return "HAKA"
		}
		if agg == validator.HAKI {
			return "HAKI"
		}
		return "NORMAL"
	}())

	return trade, nil
}

// ProcessQuoteMessage processes incoming quote messages
func ProcessQuoteMessage(data json.RawMessage) (map[string]interface{}, error) {
	var quote map[string]interface{}
	if err := json.Unmarshal(data, &quote); err != nil {
		log.Printf("Error parsing quote message: %v", err)
		return nil, err
	}
	return quote, nil
}
