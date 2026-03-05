// Broker Importer - Database Operations
package importer

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

// StoreDatabase handles database storage operations
type StorageDB struct {
	db *sql.DB
}

// NewStorageDB creates new database storage
func NewStorageDB(databaseURL string) (*StorageDB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, err
	}

	if err = db.Ping(); err != nil {
		return nil, err
	}

	log.Println("Connected to database successfully")
	return &StorageDB{db: db}, nil
}

// StoreBrokerSummary stores broker summary data
func (s *StorageDB) StoreBrokerSummary(symbol, brokerCode string, buyValue, sellValue, buyLot, sellLot int64) error {
	query := `
		INSERT INTO broker_summaries (symbol, broker_code, buy_value, sell_value, buy_lot, sell_lot, date)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`
	_, err := s.db.Exec(query, symbol, brokerCode, buyValue, sellValue, buyLot, sellLot)
	return err
}

// Close closes database connection
func (s *StorageDB) Close() error {
	return s.db.Close()
}

// RawDB exposes the underlying *sql.DB for callers that need direct access.
// Prefer using StorageDB methods when possible to encapsulate DB operations.
func (s *StorageDB) RawDB() *sql.DB {
	return s.db
}
