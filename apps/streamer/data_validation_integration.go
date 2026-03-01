package main

import (
	"encoding/json"
	"log"
	"time"
)

// --- Data Validation Integration Helper ---
// These utility functions show how to integrate data validation into existing message processing

// ValidateAndStoreTradeData validates a trade before storing
func ValidateAndStoreTradeData(symbol string, price float64, volume int64) {
	dp := DataPoint{
		Symbol:    symbol,
		Price:     price,
		Volume:    volume,
		Timestamp: time.Now().Unix() * 1000,
		Source:    "TRADE",
	}

	result := dataValidator.ValidateDataPoint(dp)

	// Only process if valid OR log if warning
	if !result.IsValid {
		log.Printf("VALIDATION FAILED for %s: %v (Score: %.1f)", symbol, result.Issues, result.Score)
		dataValidator.StoreValidationResult(result, symbol)
		// Decide: skip storage, flag for review, or process anyway
		return
	}

	if result.Severity == "WARNING" {
		log.Printf("VALIDATION WARNING for %s: %v (Score: %.1f)", symbol, result.Issues, result.Score)
	}

	// Store result for monitoring
	dataValidator.StoreValidationResult(result, symbol)

	// Proceed with normal storage logic
	// insertTrade(symbol, price, volume)
}

// ValidateDepthData validates order book depth data before processing
func ValidateDepthDataWithValidation(data DepthData) {
	symbol := data.Symbol

	// Validate top bid/ask levels
	if len(data.Bids) > 0 && len(data.Asks) > 0 {
		topBid := data.Bids[0]
		topAsk := data.Asks[0]

		dp := DataPoint{
			Symbol:    symbol,
			Price:     (topBid.Price + topAsk.Price) / 2,
			Volume:    topBid.Volume + topAsk.Volume,
			Timestamp: data.Timestamp,
			Source:    "DEPTH",
		}

		result := dataValidator.ValidateDataPoint(dp)

		if result.Score < 50 {
			log.Printf("CRITICAL: %s depth data failed validation: %v", symbol, result.Issues)
			// Consider skipping this depth update
			return
		}

		if result.Severity != "INFO" {
			log.Printf("Depth data validation: %s (Score: %.1f)", result.Severity, result.Score)
		}

		// Every 100 data points, store statistics
		stats := dataValidator.GetStatistics(symbol)
		if stats != nil && stats.DataPointCount%100 == 0 {
			dataValidator.StoreStatistics(symbol)
		}
	}

	// Proceed with normal depth processing
	processDepthData(data)
}

// ValidateBrokerFlowData validates broker trade data
func ValidateBrokerFlowData(symbol string, hakaVolume int64, hakiVolume int64, price float64) {
	totalVolume := hakaVolume + hakiVolume

	dp := DataPoint{
		Symbol:    symbol,
		Price:     price,
		Volume:    totalVolume,
		Timestamp: time.Now().Unix() * 1000,
		Source:    "HAKA",
	}

	result := dataValidator.ValidateDataPoint(dp)

	if !result.IsValid {
		log.Printf("BROKER DATA VALIDATION FAILED %s: %v", symbol, result.Issues)
		dataValidator.StoreValidationResult(result, symbol)
		return
	}

	if len(result.Recommendations) > 0 {
		log.Printf("Validation recommendations for %s: %v", symbol, result.Recommendations)
	}

	// Proceed with broker flow processing
	// processBrokerFlow(symbol, hakaVolume, hakiVolume, price)
}

// GetDataQualityReport returns current data quality status for all symbols
func GetDataQualityReport() map[string]interface{} {
	stats := dataValidator.GetAllStatistics()

	report := make(map[string]interface{})
	report["timestamp"] = time.Now().Format(time.RFC3339)
	report["total_symbols"] = len(stats)

	healthySymbols := 0
	warningSymbols := 0
	criticalSymbols := 0

	symbolsData := make([]map[string]interface{}, 0)

	for symbol, stat := range stats {
		symbolData := map[string]interface{}{
			"symbol":                symbol,
			"validation_score":      stat.ValidationScore,
			"data_point_count":      stat.DataPointCount,
			"outlier_count":         stat.OutlierCount,
			"gap_violation_count":   stat.GapViolationCount,
			"poisoning_indicators":  stat.PoisoningIndicators,
		}

		symbolsData = append(symbolsData, symbolData)

		if stat.ValidationScore >= 95 {
			healthySymbols++
		} else if stat.ValidationScore >= 80 {
			warningSymbols++
		} else {
			criticalSymbols++
		}
	}

	report["healthy"] = healthySymbols
	report["warnings"] = warningSymbols
	report["critical"] = criticalSymbols
	report["symbols"] = symbolsData

	return report
}

// BroadcastDataQualityUpdate sends data quality status to connected clients via SSE
func BroadcastDataQualityUpdate() {
	report := GetDataQualityReport()
	data, _ := json.Marshal(report)

	updateMessage := map[string]interface{}{
		"type":      "data_quality",
		"data":      report,
		"timestamp": time.Now().Unix() * 1000,
	}

	updateJSON, _ := json.Marshal(updateMessage)

	// Broadcast to all connected SSE clients
	// This would be integrated into the SSE broadcaster
	_ = updateJSON
}

// --- Integration Points in main.go ---
/*
In the main processMessage() function, you can integrate validation like this:

	case "haka":
		var haka HakaData
		json.Unmarshal(body, &haka)
		// Validate broker data
		ValidateBrokerFlowData(haka.Symbol, haka.Volume, 0, haka.Price)
		processHakaData(haka)

	case "haki":
		var haki HakiData
		json.Unmarshal(body, &haki)
		// Validate broker data
		ValidateBrokerFlowData(haki.Symbol, 0, haki.Volume, haki.Price)
		processHakiData(haki)

	case "depth":
		var depth DepthData
		json.Unmarshal(body, &depth)
		// Validate depth data before processing
		ValidateDepthDataWithValidation(depth)

	case "trade":
		var trade TradeData
		json.Unmarshal(body, &trade)
		// Validate each trade
		ValidateAndStoreTradeData(trade.Symbol, trade.Price, trade.Volume)
		processTradeData(trade)
*/
