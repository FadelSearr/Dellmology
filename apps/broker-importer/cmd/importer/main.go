// Entry point for Broker Importer
package main

import (
	"log"
	"os"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"
	}

	log.Println("🚀 Starting Broker Importer...")

	// Connect to DB
	db, err := importer.NewStorageDB(databaseURL)
	if err != nil {
		log.Fatalf("DB connection error: %v", err)
	}
	defer db.Close()

	// Fetch latest token
	token, err := importer.FetchLatestToken(db.db)
	if err != nil || token == "" {
		log.Fatalf("No valid Stockbit token found. Please sync token from extension.")
	}

	// Start real-time streamer
	wsURL := "wss://stream.stockbit.com" // Replace with actual Stockbit WebSocket URL
	importer.StreamStockbitTrades(db.db, token, wsURL)

	log.Println("✅ Broker Importer initialized successfully")
	log.Println("Ready to import broker data...")
}
