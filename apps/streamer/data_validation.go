package main

import (
	"fmt"
	"log"
	"math"
	"sync"
	"time"
)

// --- Data Validation Types ---

type ValidationResult struct {
	IsValid          bool
	Severity         string // CRITICAL, WARNING, INFO
	Issues           []string
	Recommendations  []string
	Score            float64 // 0-100, higher is better
	ValidatedAt      time.Time
}

type DataPoint struct {
	Symbol    string
	Price     float64
	Volume    int64
	Timestamp int64
	Source    string // "HAKA", "HAKI", "DEPTH", "TRADE"
}

type GoldenRecord struct {
	Symbol             string
	TypicalPrice       float64
	TypicalVolume      int64
	TypicalSpread      float64
	LastUpdated        time.Time
	ObservationCount   int64
	AbnormalityRatio   float64 // Percentage of data points flagged as abnormal
}

type ValidationStatistics struct {
	Symbol              string
	MinPrice            float64
	MaxPrice            float64
	AvgPrice            float64
	StdDev              float64
	AvgVolume           int64
	MinGap              int64 // milliseconds
	MaxGap              int64
	AvgGap              int64
	DataPointCount      int64
	OutlierCount        int64
	GapViolationCount   int64
	PoisoningIndicators int64
	ValidationScore     float64
	LastValidatedAt     time.Time
}

// --- Validation State Tracking ---

type DataValidator struct {
	mu                  sync.RWMutex
	statistics          map[string]*ValidationStatistics // key: symbol
	goldenRecords       map[string]*GoldenRecord         // key: symbol
	lastDataPoint       map[string]*DataPoint            // key: symbol
	gaianPriceHistory   map[string][]float64             // key: symbol, rolling window of prices
	gapHistory          map[string][]int64               // key: symbol, rolling window of gaps
	maxHistorySize      int
	outlierThreshold    float64 // Number of standard deviations
	gapThreshold        int64   // milliseconds
	poisoningThreshold  float64 // Percentage threshold
}

var dataValidator = &DataValidator{
	statistics:       make(map[string]*ValidationStatistics),
	goldenRecords:    make(map[string]*GoldenRecord),
	lastDataPoint:    make(map[string]*DataPoint),
	gaianPriceHistory: make(map[string][]float64),
	gapHistory:       make(map[string][]int64),
	maxHistorySize:   500,
	outlierThreshold: 2.5, // 2.5 standard deviations
	gapThreshold:     5000, // 5 seconds in milliseconds
	poisoningThreshold: 10.0, // 10% abnormality ratio triggers warning
}

// --- Core Validation Functions ---

// ValidateDataPoint performs comprehensive validation on incoming data
func (dv *DataValidator) ValidateDataPoint(dp DataPoint) ValidationResult {
	dv.mu.Lock()
	defer dv.mu.Unlock()

	result := ValidationResult{
		IsValid:     true,
		Severity:    "INFO",
		Score:       100.0,
		ValidatedAt: time.Now(),
	}

	symbol := dp.Symbol

	// Initialize symbol if first time
	if _, exists := dv.statistics[symbol]; !exists {
		dv.statistics[symbol] = &ValidationStatistics{
			Symbol:          symbol,
			MinPrice:        dp.Price,
			MaxPrice:        dp.Price,
			AvgPrice:        dp.Price,
			ValidatedAt:     time.Now(),
			ValidationScore: 100.0,
		}
		dv.goldenRecords[symbol] = &GoldenRecord{
			Symbol:           symbol,
			TypicalPrice:     dp.Price,
			TypicalVolume:    dp.Volume,
			TypicalSpread:    0.1,
			LastUpdated:      time.Now(),
			ObservationCount: 1,
		}
		dv.lastDataPoint[symbol] = &dp
		return result
	}

	stats := dv.statistics[symbol]
	golden := dv.goldenRecords[symbol]
	lastDP := dv.lastDataPoint[symbol]

	// --- 1. PRICE RANGE VALIDATION ---
	priceDeviation := calculateZScore(dp.Price, stats.AvgPrice, stats.StdDev)
	if priceDeviation > dv.outlierThreshold {
		result.Issues = append(result.Issues, fmt.Sprintf("Price %.2f is %.2f σ away from average", dp.Price, priceDeviation))
		result.Score -= 15
		stats.OutlierCount++
	}

	// --- 2. GAP DETECTION ---
	if lastDP != nil && lastDP.Timestamp > 0 {
		gap := dp.Timestamp - lastDP.Timestamp
		if gap > dv.gapThreshold {
			result.Issues = append(result.Issues, fmt.Sprintf("Data gap detected: %dms (>%dms)", gap, dv.gapThreshold))
			result.Score -= 10
			result.Severity = "WARNING"
			stats.GapViolationCount++
			result.Recommendations = append(result.Recommendations, "Check data feed connectivity")
		}

		// Update gap statistics
		dv.gapHistory[symbol] = append(dv.gapHistory[symbol], gap)
		if len(dv.gapHistory[symbol]) > dv.maxHistorySize {
			dv.gapHistory[symbol] = dv.gapHistory[symbol][1:]
		}
		stats.MinGap = gap
		stats.MaxGap = gap
		if len(dv.gapHistory[symbol]) > 1 {
			stats.MinGap = dv.gapHistory[symbol][0]
			stats.MaxGap = dv.gapHistory[symbol][0]
			for _, g := range dv.gapHistory[symbol] {
				if g < stats.MinGap {
					stats.MinGap = g
				}
				if g > stats.MaxGap {
					stats.MaxGap = g
				}
			}
			total := int64(0)
			for _, g := range dv.gapHistory[symbol] {
				total += g
			}
			stats.AvgGap = total / int64(len(dv.gapHistory[symbol]))
		}
	}

	// --- 3. GOLDEN RECORD VALIDATION ---
	priceDevFromGolden := math.Abs(dp.Price-golden.TypicalPrice) / golden.TypicalPrice
	if priceDevFromGolden > 0.15 { // 15% deviation from golden record
		result.Issues = append(result.Issues, fmt.Sprintf("Price %.2f deviates %.1f%% from typical %.2f", dp.Price, priceDevFromGolden*100, golden.TypicalPrice))
		result.Score -= 8
	}

	volumeRatio := float64(dp.Volume) / float64(golden.TypicalVolume)
	if volumeRatio > 5.0 || (volumeRatio < 0.1 && dp.Volume > 0) {
		result.Issues = append(result.Issues, fmt.Sprintf("Volume %d is %.1fx typical; possible data anomaly", dp.Volume, volumeRatio))
		result.Score -= 5
		result.Severity = "WARNING"
	}

	// --- 4. POISONING DETECTION ---
	poisoningScore := assessDataPoisoning(dp, stats, golden)
	if poisoningScore > dv.poisoningThreshold {
		result.Issues = append(result.Issues, fmt.Sprintf("Potential data poisoning detected (score: %.1f%%)", poisoningScore))
		result.Score -= 20
		result.Severity = "CRITICAL"
		result.IsValid = false
		stats.PoisoningIndicators++
		result.Recommendations = append(result.Recommendations, "Investigate data source and broker connectivity")
		result.Recommendations = append(result.Recommendations, "Consider disabling this symbol temporarily")
	}

	// --- 5. DEAD SYMBOL DETECTION ---
	if dp.Price == lastDP.Price && dp.Volume == lastDP.Volume {
		// Check if symbol has been stuck for multiple ticks
		stuckCount := 0
		for _, p := range dv.gaianPriceHistory[symbol] {
			if p == dp.Price {
				stuckCount++
			}
		}
		if stuckCount > 5 {
			result.Issues = append(result.Issues, "Symbol price stuck at same level for 5+ ticks - possibly dead/suspended")
			result.Score -= 25
			result.Severity = "WARNING"
			result.Recommendations = append(result.Recommendations, "Check if symbol is trading")
		}
	}

	// --- 6. VOLUME SPIKE DETECTION ---
	if stats.DataPointCount > 10 {
		avgVol := int64(0)
		for _, h := range dv.gaianPriceHistory[symbol] {
			// Crude approximation - in production would track volume separately
			_ = h
		}
		if avgVol > 0 && float64(dp.Volume) > float64(avgVol)*3.0 {
			result.Issues = append(result.Issues, fmt.Sprintf("Volume spike detected: %d (3x average)", dp.Volume))
			result.Recommendations = append(result.Recommendations, "Verify volume is legitimate, not misreported")
		}
	}

	// --- Update statistics ---
	dv.gaianPriceHistory[symbol] = append(dv.gaianPriceHistory[symbol], dp.Price)
	if len(dv.gaianPriceHistory[symbol]) > dv.maxHistorySize {
		dv.gaianPriceHistory[symbol] = dv.gaianPriceHistory[symbol][1:]
	}

	// Recalculate statistics
	stats.MinPrice = dp.Price
	stats.MaxPrice = dp.Price
	stats.AvgPrice = dp.Price
	stats.StdDev = 0

	if len(dv.gaianPriceHistory[symbol]) > 1 {
		stats.MinPrice = dv.gaianPriceHistory[symbol][0]
		stats.MaxPrice = dv.gaianPriceHistory[symbol][0]
		sum := 0.0
		for _, p := range dv.gaianPriceHistory[symbol] {
			if p < stats.MinPrice {
				stats.MinPrice = p
			}
			if p > stats.MaxPrice {
				stats.MaxPrice = p
			}
			sum += p
		}
		stats.AvgPrice = sum / float64(len(dv.gaianPriceHistory[symbol]))

		// Calculate standard deviation
		variance := 0.0
		for _, p := range dv.gaianPriceHistory[symbol] {
			variance += (p - stats.AvgPrice) * (p - stats.AvgPrice)
		}
		variance /= float64(len(dv.gaianPriceHistory[symbol]))
		stats.StdDev = math.Sqrt(variance)
	}

	stats.DataPointCount++
	stats.ValidatedAt = time.Now()
	stats.ValidationScore = math.Max(0, result.Score)

	if result.Score < 80 {
		result.Severity = "WARNING"
	}
	if result.Score < 50 {
		result.Severity = "CRITICAL"
		result.IsValid = false
	}

	dv.lastDataPoint[symbol] = &dp
	dv.statistics[symbol] = stats

	return result
}

// assessDataPoisoning detects signs of data quality issues or manipulation
func assessDataPoisoning(dp DataPoint, stats *ValidationStatistics, golden *GoldenRecord) float64 {
	score := 0.0

	// Unrealistic prices
	if dp.Price > golden.TypicalPrice*2 || (dp.Price < golden.TypicalPrice*0.5 && dp.Price > 0) {
		score += 5.0
	}

	// Negative volume (highly suspicious)
	if dp.Volume < 0 {
		score += 30.0
	}

	// Zero volume with price movement
	if dp.Volume == 0 && stats.AvgPrice > 0 && dp.Price != stats.AvgPrice {
		score += 8.0
	}

	// Extreme multipliers
	if stats.AvgVolume > 0 && float64(dp.Volume) > float64(stats.AvgVolume)*10 {
		score += 3.0
	}

	// Timestamp issues (future or way in past)
	now := time.Now().Unix() * 1000
	if dp.Timestamp > now+60000 { // Future timestamp (>60s)
		score += 20.0
	}
	if dp.Timestamp < now-86400000 { // Way in past (>24h)
		score += 10.0
	}

	return score
}

// calculateZScore calculates how many standard deviations a value is from mean
func calculateZScore(value, mean, stddev float64) float64 {
	if stddev == 0 {
		return 0
	}
	return math.Abs((value - mean) / stddev)
}

// --- Statistics Retrieval ---

func (dv *DataValidator) GetStatistics(symbol string) *ValidationStatistics {
	dv.mu.RLock()
	defer dv.mu.RUnlock()

	if stats, exists := dv.statistics[symbol]; exists {
		// Make a copy to avoid race conditions
		copy := *stats
		return &copy
	}
	return nil
}

func (dv *DataValidator) GetAllStatistics() map[string]*ValidationStatistics {
	dv.mu.RLock()
	defer dv.mu.RUnlock()

	result := make(map[string]*ValidationStatistics)
	for symbol, stats := range dv.statistics {
		copy := *stats
		result[symbol] = &copy
	}
	return result
}

func (dv *DataValidator) GetGoldenRecord(symbol string) *GoldenRecord {
	dv.mu.RLock()
	defer dv.mu.RUnlock()

	if golden, exists := dv.goldenRecords[symbol]; exists {
		copy := *golden
		return &copy
	}
	return nil
}

// --- Database Operations ---

func (dv *DataValidator) StoreValidationResult(result ValidationResult, symbol string) {
	if db == nil {
		return
	}

	issuesStr := ""
	for i, issue := range result.Issues {
		if i > 0 {
			issuesStr += "; "
		}
		issuesStr += issue
	}

	recsStr := ""
	for i, rec := range result.Recommendations {
		if i > 0 {
			recsStr += "; "
		}
		recsStr += rec
	}

	_, err := db.Exec(`
		INSERT INTO data_validation_results 
		(timestamp, symbol, is_valid, severity, issues, recommendations, validation_score)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, result.ValidatedAt, symbol, result.IsValid, result.Severity, issuesStr, recsStr, result.Score)

	if err != nil {
		log.Printf("ERROR: Failed to store validation result: %v", err)
	}
}

func (dv *DataValidator) StoreStatistics(symbol string) {
	if db == nil {
		return
	}

	stats := dv.GetStatistics(symbol)
	if stats == nil {
		return
	}

	_, err := db.Exec(`
		INSERT INTO data_validation_statistics 
		(timestamp, symbol, min_price, max_price, avg_price, std_dev, avg_volume, min_gap_ms, max_gap_ms, avg_gap_ms, 
		 data_point_count, outlier_count, gap_violation_count, poisoning_indicators, validation_score)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`, stats.LastValidatedAt, stats.Symbol, stats.MinPrice, stats.MaxPrice, stats.AvgPrice, stats.StdDev,
		stats.AvgVolume, stats.MinGap, stats.MaxGap, stats.AvgGap,
		stats.DataPointCount, stats.OutlierCount, stats.GapViolationCount, stats.PoisoningIndicators, stats.ValidationScore)

	if err != nil {
		log.Printf("ERROR: Failed to store validation statistics: %v", err)
	}
}

func GetRecentValidationResults(symbol string, limit int) ([]map[string]interface{}, error) {
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`
		SELECT timestamp, symbol, is_valid, severity, issues, recommendations, validation_score
		FROM data_validation_results
		WHERE symbol = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`, symbol, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var timestamp time.Time
		var symbol, severity, issues, recommendations string
		var isValid bool
		var score float64

		err := rows.Scan(&timestamp, &symbol, &isValid, &severity, &issues, &recommendations, &score)
		if err != nil {
			log.Printf("ERROR: Failed to scan validation result: %v", err)
			continue
		}

		results = append(results, map[string]interface{}{
			"timestamp":       timestamp,
			"symbol":          symbol,
			"is_valid":        isValid,
			"severity":        severity,
			"issues":          issues,
			"recommendations": recommendations,
			"score":           score,
		})
	}

	return results, rows.Err()
}

func GetValidationStatistics(symbol string) (map[string]interface{}, error) {
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	row := db.QueryRow(`
		SELECT timestamp, symbol, min_price, max_price, avg_price, std_dev, avg_volume, 
		       min_gap_ms, max_gap_ms, avg_gap_ms, data_point_count, outlier_count, 
		       gap_violation_count, poisoning_indicators, validation_score
		FROM data_validation_statistics
		WHERE symbol = $1
		ORDER BY timestamp DESC
		LIMIT 1
	`, symbol)

	var timestamp time.Time
	var minPrice, maxPrice, avgPrice, stdDev, validationScore float64
	var avgVolume, minGap, maxGap, avgGap, dataPoints, outliers, gapViolations, poisoning int64

	err := row.Scan(&timestamp, &symbol, &minPrice, &maxPrice, &avgPrice, &stdDev, &avgVolume,
		&minGap, &maxGap, &avgGap, &dataPoints, &outliers, &gapViolations, &poisoning, &validationScore)

	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"timestamp":            timestamp,
		"symbol":               symbol,
		"min_price":            minPrice,
		"max_price":            maxPrice,
		"avg_price":            avgPrice,
		"std_dev":              stdDev,
		"avg_volume":           avgVolume,
		"min_gap_ms":           minGap,
		"max_gap_ms":           maxGap,
		"avg_gap_ms":           avgGap,
		"data_point_count":     dataPoints,
		"outlier_count":        outliers,
		"gap_violation_count":  gapViolations,
		"poisoning_indicators": poisoning,
		"validation_score":     validationScore,
	}, nil
}
