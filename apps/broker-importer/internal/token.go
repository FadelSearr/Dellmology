// Broker Importer - Token Fetcher
package importer

import (
	"database/sql"
	"log"
)

// FetchLatestToken fetches the latest Stockbit token from Supabase/Neon
func FetchLatestToken(db *sql.DB) (string, error) {
	var token string
	query := `SELECT token FROM stockbit_tokens ORDER BY updated_at DESC LIMIT 1`
	if err := db.QueryRow(query).Scan(&token); err != nil {
		log.Printf("Token fetch error: %v", err)
		return "", err
	}
	return token, nil
}
