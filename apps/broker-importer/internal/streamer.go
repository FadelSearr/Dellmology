// Broker Importer - Real-time Streamer
package importer

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// TradeFrame represents a trade frame from Stockbit WebSocket
// Only relevant fields for HAKA/HAKI detection
// Example: {"symbol":"BBCA","price":1000,"side":"buy","ask":1000,"bid":995,"volume":500}
type TradeFrame struct {
	Symbol string `json:"symbol"`
	Price  int64  `json:"price"`
	Side   string `json:"side"`
	Ask    int64  `json:"ask"`
	Bid    int64  `json:"bid"`
	Volume int64  `json:"volume"`
}

// Streamer handles real-time trade streaming
func StreamStockbitTrades(db *sql.DB, token string, wsURL string) {
	log.Println("Connecting to Stockbit WebSocket for real-time trades...")
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)

	c, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		log.Fatalf("WebSocket connection failed: %v", err)
	}
	defer c.Close()

	for {
		_, message, err := c.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		var frame TradeFrame
		if err := json.Unmarshal(message, &frame); err != nil {
			log.Printf("Failed to parse trade frame: %v", err)
			continue
		}

		// HAKA/HAKI detection logic
		var action string
		if frame.Price == frame.Ask {
			action = "HAKA" // Aggressive Buy
		} else if frame.Price == frame.Bid {
			action = "HAKI" // Aggressive Sell
		} else {
			continue // Not HAKA/HAKI
		}

		// Store to DB
		query := `INSERT INTO haka_haki_trades (symbol, price, action, volume, timestamp) VALUES ($1, $2, $3, $4, NOW())`
		_, err = db.Exec(query, frame.Symbol, frame.Price, action, frame.Volume)
		if err != nil {
			log.Printf("DB insert error: %v", err)
		}
	}
}
