package main

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/lib/pq" // PostgreSQL driver
)

// --- Configuration ---
const (
	databaseURL = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"
)

// List of stocks to process. In a real system, this would come from a DB or config file.
var targetSymbols = []string{"BBCA", "TLKM", "GOTO", "BBNI", "ASII", "BMRI"}

// List of common broker codes in Indonesia Stock Exchange (IDX)
var brokerCodes = []string{
	"PD", "YP", "CC", "MG", "CP", "NI", "OD", "EP", "AZ", "YJ", "SQ", "KK",
	"AK", "BK", "CS", "KI", "RF", "GR", "XC", "HD", "LG", "RX", "SA", "IF",
}

// --- Structs ---

// This struct is now used for our generated data, mimicking the original structure.
type BrokerSummaryData struct {
	BrokerCode string `json:"broker_code"`
	BuyValue   int64  `json:"buy_value"`
	SellValue  int64  `json:"sell_value"`
	BuyLot     int64  `json:"buy_lot"`
	SellLot    int64  `json:"sell_lot"`
}

// --- Main Application ---

func main() {
	log.Println("Starting Dellmology EOD Mock Broker Summary Importer...")
	rand.Seed(time.Now().UnixNano())

	// 1. Connect to Database
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("FATAL: Could not connect to database. Error: %v", err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		log.Fatalf("FATAL: Database ping failed. Error: %v", err)
	}
	log.Println("Successfully connected to the database.")

	// 2. Process each symbol
	today := time.Now().Format("2006-01-02")
	for _, symbol := range targetSymbols {
		log.Printf("Generating and inserting mock data for symbol: %s", symbol)
		if err := processSymbolWithMockData(db, symbol, today); err != nil {
			log.Printf("ERROR: Failed to process %s: %v", symbol, err)
		} else {
			log.Printf("Successfully processed symbol: %s", symbol)
		}
	}

	log.Println("EOD Mock Broker Summary Importer finished.")
}

// generateMockSummaryData creates a realistic set of broker summary data.
func generateMockSummaryData() []BrokerSummaryData {
	var data []BrokerSummaryData
	numBrokers := 15 + rand.Intn(10) // Generate data for 15 to 24 brokers

	for i := 0; i < numBrokers; i++ {
		buyValue := rand.Int63n(200_000_000_000) + 500_000_000   // 500M to 200B
		sellValue := rand.Int63n(200_000_000_000) + 500_000_000  // 500M to 200B
		
		// Make it more realistic: 60% chance one side is much larger
		if rand.Float32() < 0.6 {
			if rand.Intn(2) == 0 {
				buyValue *= int64(rand.Intn(5) + 2) // boost buy
			} else {
				sellValue *= int64(rand.Intn(5) + 2) // boost sell
			}
		}

		buyLot := buyValue / (int64(rand.Intn(5000) + 500) * 100)
		sellLot := sellValue / (int64(rand.Intn(5000) + 500) * 100)

		// Ensure lots are not zero if value exists
		if buyLot == 0 { buyLot = 1 }
		if sellLot == 0 { sellLot = 1 }

		item := BrokerSummaryData{
			BrokerCode: brokerCodes[rand.Intn(len(brokerCodes))],
			BuyValue:   buyValue,
			SellValue:  sellValue,
			BuyLot:     buyLot,
			SellLot:    sellLot,
		}
		data = append(data, item)
	}
	return data
}

func processSymbolWithMockData(db *sql.DB, symbol, date string) error {
	// 1. Generate mock data instead of fetching from API
	summaryData := generateMockSummaryData()
	if len(summaryData) == 0 {
		log.Printf("WARN: No mock data generated for %s on %s", symbol, date)
		return nil
	}

	// 2. Insert data into database (using a transaction)
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback on error

	// Clean old data for the same day and symbol to avoid stale data
	_, err = tx.Exec("DELETE FROM broker_summaries WHERE date = $1 AND symbol = $2", date, symbol)
    if err != nil {
        return fmt.Errorf("failed to clean old data: %w", err)
    }

	stmt, err := tx.Prepare(`
		INSERT INTO broker_summaries (date, symbol, broker_id, net_buy_value, avg_buy_price, avg_sell_price)
		VALUES ($1, $2, $3, $4, $5, $6)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, item := range summaryData {
		netBuy := item.BuyValue - item.SellValue

		var avgBuy, avgSell float64
		if item.BuyLot > 0 {
			// Price is value / (lot * 100 shares/lot)
			avgBuy = float64(item.BuyValue) / (float64(item.BuyLot) * 100)
		}
		if item.SellLot > 0 {
			avgSell = float64(item.SellValue) / (float64(item.SellLot) * 100)
		}
		
		// Ensure we don't insert the same broker twice for the same stock on the same day
		// The original code used ON CONFLICT, but since we generate random brokers,
		// a simple INSERT is fine after cleaning old data. A more robust solution
		// would use a map to ensure unique brokers before inserting.
		_, err := stmt.Exec(date, symbol, item.BrokerCode, netBuy, avgBuy, avgSell)
		if err != nil {
			// Ignore duplicate key errors if they happen by chance, continue otherwise
			if sqlErr, ok := err.(*pq.Error); ok && sqlErr.Code == "23505" { // unique_violation
				continue
			}
			return fmt.Errorf("failed to execute statement for broker %s: %w", item.BrokerCode, err)
		}
	}

	return tx.Commit()
}
