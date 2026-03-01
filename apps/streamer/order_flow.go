package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"sync"
	"time"
)

// --- Order Flow Types ---
type OrderBookLevel struct {
	Price    float64 `json:"p"`
	Volume   int64   `json:"v"`
	Level    int     `json:"l"` // Position in book (0=top)
}

type DepthData struct {
	Symbol    string            `json:"s"`
	Bids      []OrderBookLevel  `json:"b"`
	Asks      []OrderBookLevel  `json:"a"`
	Timestamp int64             `json:"dt"`
}

type OrderFlowHeatmapRow struct {
	Timestamp       time.Time
	Symbol          string
	Price           float64
	BidVolume       int64
	AskVolume       int64
	NetVolume       int64
	BidAskRatio     float64
	Intensity       float64
}

type OrderFlowAnomaly struct {
	Timestamp  time.Time
	Symbol     string
	Type       string // LAYERING, SPOOFING, PHANTOM_LIQUIDITY, SPLIT_ORDER
	Price      float64
	Volume     int64
	Severity   string // LOW, MEDIUM, HIGH
	Description string
}

type MarketDepthSnapshot struct {
	Timestamp         time.Time
	Symbol            string
	BidLevels         []map[string]interface{}
	AskLevels         []map[string]interface{}
	TotalBidVolume    int64
	TotalAskVolume    int64
	MidPrice          float64
	BidAskSpread      float64
	SpreadBps         int // Basis points
}

// --- Order Flow State Tracking ---
type OrderFlowTracker struct {
	mu              sync.RWMutex
	orderHistory    map[string]*OrderBookSnapshot // key: symbol
	anomalies       map[string][]OrderFlowAnomaly
	heatmapCache    map[string][]OrderFlowHeatmapRow
}

type OrderBookSnapshot struct {
	Timestamp time.Time
	Bids      map[float64]int64 // price -> volume
	Asks      map[float64]int64
	LastPrice float64
	Bid       float64
	Ask       float64
}

var orderFlowTracker = &OrderFlowTracker{
	orderHistory: make(map[string]*OrderBookSnapshot),
	anomalies:    make(map[string][]OrderFlowAnomaly),
	heatmapCache: make(map[string][]OrderFlowHeatmapRow),
}

// --- Order Flow Analysis ---

func processDepthData(data DepthData) {
	symbol := data.Symbol
	timestamp := time.Unix(data.Timestamp, 0)

	// Parse bid/ask levels into map
	bidMap := make(map[float64]int64)
	askMap := make(map[float64]int64)

	for _, bid := range data.Bids {
		bidMap[bid.Price] = bid.Volume
	}
	for _, ask := range data.Asks {
		askMap[ask.Price] = ask.Volume
	}

	// Calculate mid price and spread
	topBid := data.Bids[0].Price
	topAsk := data.Asks[0].Price
	midPrice := (topBid + topAsk) / 2
	spread := topAsk - topBid
	spreadBps := int((spread / midPrice) * 10000)

	// Store snapshot
	snapshot := &OrderBookSnapshot{
		Timestamp: timestamp,
		Bids:      bidMap,
		Asks:      askMap,
		LastPrice: midPrice,
		Bid:       topBid,
		Ask:       topAsk,
	}

	// Check for anomalies
	anomalies := detectAnomalies(symbol, snapshot)

	// Store order book
	orderFlowTracker.mu.Lock()
	oldSnapshot := orderFlowTracker.orderHistory[symbol]
	orderFlowTracker.orderHistory[symbol] = snapshot
	if len(orderFlowTracker.anomalies[symbol]) > 1000 {
		orderFlowTracker.anomalies[symbol] = orderFlowTracker.anomalies[symbol][100:] // Keep last 900
	}
	orderFlowTracker.anomalies[symbol] = append(orderFlowTracker.anomalies[symbol], anomalies...)
	orderFlowTracker.mu.Unlock()

	// Generate heatmap data
	heatmapData := generateHeatmapData(symbol, snapshot, oldSnapshot)

	// Store in database
	if len(heatmapData) > 0 {
		insertHeatmapData(heatmapData)
	}

	if len(anomalies) > 0 {
		for _, anom := range anomalies {
			insertAnomaly(anom)
		}
	}

	// Store market depth snapshot
	depthSnapshot := createDepthSnapshot(snapshot, symbol, timestamp, spreadBps)
	insertDepthSnapshot(depthSnapshot)
}

func detectAnomalies(symbol string, current *OrderBookSnapshot) []OrderFlowAnomaly {
	var anomalies []OrderFlowAnomaly

	orderFlowTracker.mu.RLock()
	previous := orderFlowTracker.orderHistory[symbol]
	orderFlowTracker.mu.RUnlock()

	if previous == nil {
		return anomalies
	}

	// --- SPOOFING: Order appears and disappears without trade ---
	for price, currentVol := range current.Bids {
		prevVol, existed := previous.Bids[price]
		if existed && prevVol > currentVol*2 && currentVol == 0 {
			// Large order disappeared without execution
			anomalies = append(anomalies, OrderFlowAnomaly{
				Timestamp:   time.Now(),
				Symbol:      symbol,
				Type:        "SPOOFING",
				Price:       price,
				Volume:      prevVol,
				Severity:    "HIGH",
				Description: "Large bid order disappeared suddenly without trade execution",
			})
		}
	}

	for price, currentVol := range current.Asks {
		prevVol, existed := previous.Asks[price]
		if existed && prevVol > currentVol*2 && currentVol == 0 {
			anomalies = append(anomalies, OrderFlowAnomaly{
				Timestamp:   time.Now(),
				Symbol:      symbol,
				Type:        "SPOOFING",
				Price:       price,
				Volume:      prevVol,
				Severity:    "HIGH",
				Description: "Large ask order disappeared suddenly without trade execution",
			})
		}
	}

	// --- LAYERING: Multiple orders at different prices by same actor (approximate) ---
	bidCount := 0
	askCount := 0
	for _, vol := range current.Bids {
		if vol > 0 {
			bidCount++
		}
	}
	for _, vol := range current.Asks {
		if vol > 0 {
			askCount++
		}
	}

	if bidCount > 15 || askCount > 15 {
		anomalies = append(anomalies, OrderFlowAnomaly{
			Timestamp:   time.Now(),
			Symbol:      symbol,
			Type:        "LAYERING",
			Price:       current.Bid,
			Volume:      int64(bidCount),
			Severity:    "MEDIUM",
			Description: "Excessive number of orders at different price levels (potential layering)",
		})
	}

	// --- PHANTOM LIQUIDITY: Orders with very short lifetime ---
	totalBidVol := int64(0)
	totalAskVol := int64(0)
	for _, vol := range current.Bids {
		totalBidVol += vol
	}
	for _, vol := range current.Asks {
		totalAskVol += vol
	}

	prevTotalBidVol := int64(0)
	prevTotalAskVol := int64(0)
	for _, vol := range previous.Bids {
		prevTotalBidVol += vol
	}
	for _, vol := range previous.Asks {
		prevTotalAskVol += vol
	}

	// If volume increased significantly but no trades (checked via HAKA/HAKI), it's phantom
	if totalBidVol > prevTotalBidVol*3 && current.Bid == previous.Bid {
		anomalies = append(anomalies, OrderFlowAnomaly{
			Timestamp:   time.Now(),
			Symbol:      symbol,
			Type:        "PHANTOM_LIQUIDITY",
			Price:       current.Bid,
			Volume:      totalBidVol,
			Severity:    "MEDIUM",
			Description: "Large volume increase with no price movement (potential phantom liquidity)",
		})
	}

	return anomalies
}

func generateHeatmapData(symbol string, current *OrderBookSnapshot, previous *OrderBookSnapshot) []OrderFlowHeatmapRow {
	var heatmapRows []OrderFlowHeatmapRow

	// Combine all price levels from both bid and ask sides
	allPrices := make(map[float64]bool)
	for price := range current.Bids {
		allPrices[price] = true
	}
	for price := range current.Asks {
		allPrices[price] = true
	}

	// Sort prices
	var prices []float64
	for price := range allPrices {
		prices = append(prices, price)
	}
	sort.Float64s(prices)

	// Get max volume for intensity scaling
	maxVolume := int64(1)
	for _, vol := range current.Bids {
		if vol > maxVolume {
			maxVolume = vol
		}
	}
	for _, vol := range current.Asks {
		if vol > maxVolume {
			maxVolume = vol
		}
	}

	// Generate heatmap rows
	for _, price := range prices {
		bidVol := current.Bids[price]
		askVol := current.Asks[price]
		netVol := bidVol - askVol

		var bidAskRatio float64
		if askVol == 0 && bidVol > 0 {
			bidAskRatio = 999.0 // Max ratio
		} else if askVol > 0 {
			bidAskRatio = float64(bidVol) / float64(askVol)
		} else {
			bidAskRatio = 1.0
		}

		// Calculate intensity (0-1)
		maxVol := bidVol
		if askVol > bidVol {
			maxVol = askVol
		}
		intensity := math.Min(1.0, float64(maxVol)/float64(maxVolume))

		row := OrderFlowHeatmapRow{
			Timestamp:   time.Now(),
			Symbol:      symbol,
			Price:       price,
			BidVolume:   bidVol,
			AskVolume:   askVol,
			NetVolume:   netVol,
			BidAskRatio: bidAskRatio,
			Intensity:   intensity,
		}
		heatmapRows = append(heatmapRows, row)
	}

	return heatmapRows
}

func createDepthSnapshot(snapshot *OrderBookSnapshot, symbol string, timestamp time.Time, spreadBps int) MarketDepthSnapshot {
	bidLevels := make([]map[string]interface{}, 0)
	askLevels := make([]map[string]interface{}, 0)

	// Convert bid map to sorted slice
	bidPrices := make([]float64, 0)
	for price := range snapshot.Bids {
		bidPrices = append(bidPrices, price)
	}
	sort.Sort(sort.Reverse(sort.Float64Slice(bidPrices)))

	for i, price := range bidPrices {
		if i > 10 {
			break // Only store top 10
		}
		bidLevels = append(bidLevels, map[string]interface{}{
			"price":  price,
			"volume": snapshot.Bids[price],
		})
	}

	// Convert ask map to sorted slice
	askPrices := make([]float64, 0)
	for price := range snapshot.Asks {
		askPrices = append(askPrices, price)
	}
	sort.Float64s(askPrices)

	for i, price := range askPrices {
		if i > 10 {
			break // Only store top 10
		}
		askLevels = append(askLevels, map[string]interface{}{
			"price":  price,
			"volume": snapshot.Asks[price],
		})
	}

	totalBidVol := int64(0)
	totalAskVol := int64(0)
	for _, vol := range snapshot.Bids {
		totalBidVol += vol
	}
	for _, vol := range snapshot.Asks {
		totalAskVol += vol
	}

	return MarketDepthSnapshot{
		Timestamp:      timestamp,
		Symbol:         symbol,
		BidLevels:      bidLevels,
		AskLevels:      askLevels,
		TotalBidVolume: totalBidVol,
		TotalAskVolume: totalAskVol,
		MidPrice:       snapshot.LastPrice,
		BidAskSpread:   snapshot.Ask - snapshot.Bid,
		SpreadBps:      spreadBps,
	}
}

// --- Database Operations ---

func insertHeatmapData(rows []OrderFlowHeatmapRow) {
	for _, row := range rows {
		_, err := db.Exec(`
			INSERT INTO order_flow_heatmap 
			(timestamp, symbol, price, bid_volume, ask_volume, net_volume, bid_ask_ratio, intensity)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (symbol, price, timestamp) DO NOTHING
		`, row.Timestamp, row.Symbol, row.Price, row.BidVolume, row.AskVolume, row.NetVolume, row.BidAskRatio, row.Intensity)

		if err != nil {
			log.Printf("ERROR: Failed to insert heatmap data: %v", err)
		}
	}
}

func insertAnomaly(anom OrderFlowAnomaly) {
	_, err := db.Exec(`
		INSERT INTO order_flow_anomalies 
		(timestamp, symbol, anomaly_type, price, volume, severity, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, anom.Timestamp, anom.Symbol, anom.Type, anom.Price, anom.Volume, anom.Severity, anom.Description)

	if err != nil {
		log.Printf("ERROR: Failed to insert anomaly: %v", err)
	}
}

func insertDepthSnapshot(depth MarketDepthSnapshot) {
	bidJSON, _ := json.Marshal(depth.BidLevels)
	askJSON, _ := json.Marshal(depth.AskLevels)

	_, err := db.Exec(`
		INSERT INTO market_depth 
		(timestamp, symbol, bid_levels, ask_levels, total_bid_volume, total_ask_volume, mid_price, bid_ask_spread, spread_bps)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, depth.Timestamp, depth.Symbol, string(bidJSON), string(askJSON), depth.TotalBidVolume, depth.TotalAskVolume, depth.MidPrice, depth.BidAskSpread, depth.SpreadBps)

	if err != nil {
		log.Printf("ERROR: Failed to insert depth snapshot: %v", err)
	}
}

// --- Exported Functions ---

func GetOrderFlowHeatmap(symbol string, limit int) ([]OrderFlowHeatmapRow, error) {
	// attempt redis cache first
	if redisClient != nil {
		cacheKey := fmt.Sprintf("heatmap:%s:%d", symbol, limit)
		var cached []OrderFlowHeatmapRow
		if cacheGet(cacheKey, &cached) {
			return cached, nil
		}
	}
	rows, err := db.Query(`
		SELECT timestamp, symbol, price, bid_volume, ask_volume, net_volume, bid_ask_ratio, intensity
		FROM order_flow_heatmap
		WHERE symbol = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`, symbol, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []OrderFlowHeatmapRow
	for rows.Next() {
		var row OrderFlowHeatmapRow
		err := rows.Scan(&row.Timestamp, &row.Symbol, &row.Price, &row.BidVolume, &row.AskVolume, &row.NetVolume, &row.BidAskRatio, &row.Intensity)
		if err != nil {
			return nil, err
		}
		results = append(results, row)
	}

	if redisClient != nil {
		cacheKey := fmt.Sprintf("heatmap:%s:%d", symbol, limit)
		cacheSet(cacheKey, results, 15*time.Second)
	}

	return results, rows.Err()
}

func GetLatestMarketDepth(symbol string) (*MarketDepthSnapshot, error) {
	row := db.QueryRow(`
		SELECT timestamp, symbol, bid_levels, ask_levels, total_bid_volume, total_ask_volume, mid_price, bid_ask_spread, spread_bps
		FROM market_depth
		WHERE symbol = $1
		ORDER BY timestamp DESC
		LIMIT 1
	`, symbol)

	var depth MarketDepthSnapshot
	var bidJSON, askJSON string

	err := row.Scan(&depth.Timestamp, &depth.Symbol, &bidJSON, &askJSON, &depth.TotalBidVolume, &depth.TotalAskVolume, &depth.MidPrice, &depth.BidAskSpread, &depth.SpreadBps)
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(bidJSON), &depth.BidLevels)
	_ = json.Unmarshal([]byte(askJSON), &depth.AskLevels)

	return &depth, nil
}

func GetAnomalies(symbol string, severity string, limit int) ([]OrderFlowAnomaly, error) {
	query := `
		SELECT timestamp, symbol, anomaly_type, price, volume, severity, description
		FROM order_flow_anomalies
		WHERE symbol = $1
	`
	args := []interface{}{symbol}

	if severity != "" {
		query += ` AND severity = $2`
		args = append(args, severity)
	}

	query += ` ORDER BY timestamp DESC LIMIT $` + fmt.Sprint(len(args)+1)
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var anomalies []OrderFlowAnomaly
	for rows.Next() {
		var anom OrderFlowAnomaly
		err := rows.Scan(&anom.Timestamp, &anom.Symbol, &anom.Type, &anom.Price, &anom.Volume, &anom.Severity, &anom.Description)
		if err != nil {
			return nil, err
		}
		anomalies = append(anomalies, anom)
	}

	return anomalies, rows.Err()
}
