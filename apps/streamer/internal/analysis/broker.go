// Broker Flow Analysis and HAKA/HAKI Detection
package analysis

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"os"
	"sort"

	"github.com/lib/pq"
)

const defaultDatabaseURL = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"

type brokerRow struct {
	BrokerID      string
	NetBuyValue   float64
	ActiveDays    int
	Consistency   float64
	WhaleCluster  string
	Correlation   float64
	IsWhale       bool
	IsAnomalous   bool
}

// AnalyzeBrokerFlow analyzes broker trading patterns
func AnalyzeBrokerFlow(symbol string, days int) map[string]interface{} {
	log.Printf("Analyzing broker flow for %s (last %d days)", symbol, days)
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = defaultDatabaseURL
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return map[string]interface{}{
			"symbol": symbol,
			"status": "degraded",
			"reason": err.Error(),
		}
	}
	defer db.Close()

	query := `
		WITH date_range AS (
			SELECT generate_series(
				date_trunc('day', NOW()) - ($2::interval) + interval '1 day',
				date_trunc('day', NOW()),
				'1 day'
			)::date AS day
		),
		daily_sums AS (
			SELECT
				broker_code,
				date_trunc('day', time)::date AS day,
				SUM(net_value) AS daily_net
			FROM broker_flow
			WHERE symbol = $1
			  AND time >= NOW()::date - $2::interval
			GROUP BY broker_code, date_trunc('day', time)
		),
		broker_list AS (
			SELECT DISTINCT broker_code FROM daily_sums
		)
		SELECT
			b.broker_code AS broker_id,
			COALESCE(SUM(ds.daily_net),0) AS total_net_buy,
			COUNT(ds.day) AS active_days,
			ARRAY_AGG(COALESCE(ds.daily_net,0) ORDER BY dr.day) AS daily_data
		FROM broker_list b
		CROSS JOIN date_range dr
		LEFT JOIN daily_sums ds
		  ON ds.broker_code = b.broker_code AND ds.day = dr.day
		GROUP BY b.broker_code
		ORDER BY ABS(COALESCE(SUM(ds.daily_net),0)) DESC
		LIMIT 20
	`

	rows, err := db.Query(query, symbol, fmt.Sprintf("%d days", days))
	if err != nil {
		return map[string]interface{}{
			"symbol": symbol,
			"status": "degraded",
			"reason": err.Error(),
		}
	}
	defer rows.Close()

	brokers := make([]brokerRow, 0)
	netVals := make([]float64, 0)
	for rows.Next() {
		var brokerID string
		var totalNet float64
		var activeDays int
		var dailyData []float64
		if err := rows.Scan(&brokerID, &totalNet, &activeDays, pq.Array(&dailyData)); err != nil {
			continue
		}
		cluster := classifyWhaleCluster(dailyData)
		corr := calculateBehaviorCorrelation(dailyData)
		consistency := 0.0
		if days > 0 {
			consistency = (float64(activeDays) / float64(days)) * 100
		}
		brokers = append(brokers, brokerRow{
			BrokerID: brokerID,
			NetBuyValue: totalNet,
			ActiveDays: activeDays,
			Consistency: consistency,
			WhaleCluster: cluster,
			Correlation: corr,
			IsWhale: math.Abs(totalNet) > 5_000_000_000,
		})
		netVals = append(netVals, totalNet)
	}

	if len(brokers) == 0 {
		return map[string]interface{}{
			"symbol": symbol,
			"status": "empty",
			"brokers": []brokerRow{},
		}
	}

	mean := 0.0
	for _, val := range netVals {
		mean += val
	}
	mean /= float64(len(netVals))

	variance := 0.0
	for _, val := range netVals {
		diff := val - mean
		variance += diff * diff
	}
	stdDev := math.Sqrt(variance / float64(len(netVals)))
	for i := range brokers {
		if stdDev > 0 {
			z := (brokers[i].NetBuyValue - mean) / stdDev
			brokers[i].IsAnomalous = math.Abs(z) > 2
		}
	}

	sort.Slice(brokers, func(i, j int) bool {
		return math.Abs(brokers[i].NetBuyValue) > math.Abs(brokers[j].NetBuyValue)
	})

	return map[string]interface{}{
		"symbol": symbol,
		"status": "ok",
		"brokers": brokers,
		"stats": map[string]interface{}{
			"total_brokers": len(brokers),
			"whales": countWhales(brokers),
			"anomalous": countAnomalous(brokers),
		},
	}
}

func classifyWhaleCluster(dailyData []float64) string {
	if len(dailyData) == 0 {
		return "NEUTRAL_FLOW"
	}
	last := dailyData[len(dailyData)-1]
	prev := dailyData[:len(dailyData)-1]
	prevAvg := 0.0
	if len(prev) > 0 {
		for _, val := range prev {
			prevAvg += val
		}
		prevAvg /= float64(len(prev))
	}
	positive := 0
	negative := 0
	for _, val := range dailyData {
		if val > 0 {
			positive++
		}
		if val < 0 {
			negative++
		}
	}
	if last > 0 && prevAvg > 0 && last > math.Abs(prevAvg)*1.8 {
		return "CLOSING_MARKUP"
	}
	if positive >= int(math.Ceil(float64(len(dailyData))*0.7)) {
		return "MOMENTUM_ACCUMULATOR"
	}
	if negative >= int(math.Ceil(float64(len(dailyData))*0.6)) {
		return "DISTRIBUTION_PRESSURE"
	}
	return "NEUTRAL_FLOW"
}

func calculateBehaviorCorrelation(dailyData []float64) float64 {
	if len(dailyData) < 3 {
		return 0
	}
	absValues := make([]float64, 0, len(dailyData))
	for _, val := range dailyData {
		absValues = append(absValues, math.Abs(val))
	}
	xMean := float64(len(dailyData)-1) / 2
	yMean := 0.0
	for _, val := range absValues {
		yMean += val
	}
	yMean /= float64(len(absValues))

	numerator := 0.0
	denomX := 0.0
	denomY := 0.0
	for i := 0; i < len(absValues); i++ {
		x := float64(i) - xMean
		y := absValues[i] - yMean
		numerator += x * y
		denomX += x * x
		denomY += y * y
	}
	denom := math.Sqrt(denomX * denomY)
	if denom == 0 || math.IsNaN(denom) {
		return 0
	}
	return math.Round((numerator/denom)*1000) / 1000
}

func countWhales(rows []brokerRow) int {
	count := 0
	for _, row := range rows {
		if row.IsWhale {
			count++
		}
	}
	return count
}

func countAnomalous(rows []brokerRow) int {
	count := 0
	for _, row := range rows {
		if row.IsAnomalous {
			count++
		}
	}
	return count
}

// DetectHAKAHAKI detects aggressive buy (HAKA) and sell (HAKI) trades
func DetectHAKAHAKI(price float64, bid float64, offer float64) string {
	if price == offer {
		return "HAKA" // Aggressive Buy at Ask
	} else if price == bid {
		return "HAKI" // Aggressive Sell at Bid
	}
	return "NEUTRAL"
}

// CalculateZScore calculates Z-Score for anomaly detection
func CalculateZScore(value float64, mean float64, stdDev float64) float64 {
	if stdDev == 0 {
		return 0
	}
	return (value - mean) / stdDev
}

// AnalyzeWalePattern identifies whale (institutional) activity
func AnalyzeWalePattern(volume int64, avgVolume int64, threshold float64) bool {
	if avgVolume == 0 {
		return false
	}
	ratio := float64(volume) / float64(avgVolume)
	return ratio > threshold
}
