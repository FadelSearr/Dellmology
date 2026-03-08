package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"sync"
	"time"
)

// --- Order Flow Types ---
type OrderFlowEvent struct {
	Timestamp  time.Time
	Symbol     string
	Price      float64
	Volume     int64
	Side       string // "BID" or "ASK"
	EventType  string // "PLACED", "MODIFIED", "CANCELLED", "EXECUTED"
	OrderID    string
	BrokerCode string
	DurationMs int
}

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
	Type       string // LAYERING, SPOOFING, PHANTOM_LIQUIDITY, WASH_SALE
	Price      float64
	Volume     int64
	Severity   string // LOW, MEDIUM, HIGH
	Description string
}

type MarketDepthSnapshot struct {
	Timestamp         time.Time
	Symbol            string
	// top levels represented as slice of maps for JSON serialization
	BidLevels         []map[string]interface{}
	AskLevels         []map[string]interface{}
	TotalBidVolume    int64
	TotalAskVolume    int64
	MidPrice          float64
	BidAskSpread      float64
	SpreadBps         int // Basis points
}

type HAKAHAKISummary struct {
	Time        time.Time
	Symbol      string
	HAKAVolume  int64  // Aggressive Buy (at ask)
	HAKIVolume  int64  // Aggressive Sell (at bid)
	HAKARatio   float64
	Dominance   string // "HAKA", "HAKI", "BALANCED"
	NetPressure int
}

// --- Order Flow State Tracking ---
type AnomalyDetector struct {
	db                       *sql.DB
	recentOrders             map[string][]OrderFlowEvent
	recentAnomalies          map[string][]OrderFlowAnomaly
	marketDepthCache         map[string]*MarketDepthSnapshot
	mu                       sync.RWMutex
	spoosingThresholdMs      int
	phantomRatioThreshold    float64
	washTradeThreshold       int64
}

type OrderFlowTracker struct {
	mu           sync.RWMutex
	orderHistory map[string]*OrderBookSnapshot
	anomalies    map[string][]OrderFlowAnomaly
	refillCounts map[string]map[float64]int
}

var orderFlowTracker = &OrderFlowTracker{
	orderHistory: make(map[string]*OrderBookSnapshot),
	anomalies:    make(map[string][]OrderFlowAnomaly),
	refillCounts: make(map[string]map[float64]int),
}

type OrderBookSnapshot struct {
	Timestamp time.Time
	Bids      map[float64]int64 // price -> volume
	Asks      map[float64]int64
	LastPrice float64
	Bid       float64
	Ask       float64
}

var anomalyDetector *AnomalyDetector

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
	orderFlowTracker.orderHistory[symbol] = snapshot
	if len(orderFlowTracker.anomalies[symbol]) > 1000 {
		orderFlowTracker.anomalies[symbol] = orderFlowTracker.anomalies[symbol][100:] // Keep last 900
	}
	orderFlowTracker.anomalies[symbol] = append(orderFlowTracker.anomalies[symbol], anomalies...)
	orderFlowTracker.mu.Unlock()

	// Generate heatmap data
	heatmapData := generateHeatmapData(symbol, snapshot)

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

	orderFlowTracker.mu.Lock()
	if _, ok := orderFlowTracker.refillCounts[symbol]; !ok {
		orderFlowTracker.refillCounts[symbol] = make(map[float64]int)
	}
	orderFlowTracker.mu.Unlock()

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

	// --- ICEBERG: repeated volume refill at same level after partial consumption ---
	const minIcebergVolume int64 = 50000
	const refillBandLow = 0.7
	const refillBandHigh = 1.3
	const minRefillCycles = 3

	trackRefill := func(price float64, prevVol, currVol int64, side string) {
		orderFlowTracker.mu.Lock()
		defer orderFlowTracker.mu.Unlock()
		refillState := orderFlowTracker.refillCounts[symbol]

		if prevVol < minIcebergVolume || currVol < minIcebergVolume {
			refillState[price] = 0
			return
		}

		ratio := float64(currVol) / float64(prevVol)
		if ratio >= refillBandLow && ratio <= refillBandHigh {
			refillState[price] = refillState[price] + 1
		} else {
			refillState[price] = 0
		}

		if refillState[price] >= minRefillCycles {
			anomalies = append(anomalies, OrderFlowAnomaly{
				Timestamp:   time.Now(),
				Symbol:      symbol,
				Type:        "ICEBERG",
				Price:       price,
				Volume:      currVol,
				Severity:    "MEDIUM",
				Description: fmt.Sprintf("Potential iceberg on %s side: repeated refill at %.2f", side, price),
			})
			refillState[price] = 0
		}
	}

	for price, currVol := range current.Bids {
		if prevVol, exists := previous.Bids[price]; exists {
			trackRefill(price, prevVol, currVol, "BID")
		}
	}
	for price, currVol := range current.Asks {
		if prevVol, exists := previous.Asks[price]; exists {
			trackRefill(price, prevVol, currVol, "ASK")
		}
	}

	return anomalies
}

func generateHeatmapData(symbol string, current *OrderBookSnapshot) []OrderFlowHeatmapRow {
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


// --- Order Flow Analysis ---

// NewAnomalyDetector creates a new anomaly detector
func NewAnomalyDetector(db *sql.DB) *AnomalyDetector {
	return &AnomalyDetector{
		db:                      db,
		recentOrders:            make(map[string][]OrderFlowEvent),
		recentAnomalies:         make(map[string][]OrderFlowAnomaly),
		marketDepthCache:        make(map[string]*MarketDepthSnapshot),
		spoosingThresholdMs:     5000, // 5 seconds
		phantomRatioThreshold:   3.0,  // 3:1 bid/ask ratio
		washTradeThreshold:      100,  // volume threshold
	}
}

// DetectSpoofing detects orders placed and immediately cancelled
func (ad *AnomalyDetector) DetectSpoofing(event OrderFlowEvent) *OrderFlowAnomaly {
	if event.DurationMs > 0 && event.DurationMs < ad.spoosingThresholdMs {
		return &OrderFlowAnomaly{
			Timestamp:   event.Timestamp,
			Symbol:      event.Symbol,
			Type:        "SPOOFING",
			Price:       event.Price,
			Volume:      event.Volume,
			Severity:    ad.calculateSeverity(event.Volume),
			Description: fmt.Sprintf("Order %s cancelled after %dms", event.OrderID, event.DurationMs),
		}
	}
	return nil
}

// DetectPhantomLiquidity detects extreme bid/ask imbalances
func (ad *AnomalyDetector) DetectPhantomLiquidity(symbol string, bidVol, askVol int64) *OrderFlowAnomaly {
	if bidVol == 0 || askVol == 0 {
		return nil
	}

	ratio := float64(bidVol) / float64(askVol)
	if ratio < 1 {
		ratio = float64(askVol) / float64(bidVol)
	}

	if ratio > ad.phantomRatioThreshold {
		severity := "MEDIUM"
		if ratio > ad.phantomRatioThreshold*2 {
			severity = "HIGH"
		}

		side := "BID"
		vol := bidVol
		if askVol > bidVol {
			side = "ASK"
			vol = askVol
		}

		return &OrderFlowAnomaly{
			Timestamp:   time.Now(),
			Symbol:      symbol,
			Type:        "PHANTOM_LIQUIDITY",
			Volume:      vol,
			Severity:    severity,
			Description: fmt.Sprintf("Extreme %s imbalance (ratio: %.2f)", side, ratio),
		}
	}
	return nil
}

// DetectWashTrade detects circular trading patterns
func (ad *AnomalyDetector) DetectWashTrade(symbol string, buyVol, sellVol int64) *OrderFlowAnomaly {
	if buyVol > ad.washTradeThreshold && sellVol > ad.washTradeThreshold {
		diff := buyVol - sellVol
		if diff < 0 {
			diff = -diff
		}

		if diff < ad.washTradeThreshold {
			return &OrderFlowAnomaly{
				Timestamp:   time.Now(),
				Symbol:      symbol,
				Type:        "WASH_SALE",
				Volume:      (buyVol + sellVol) / 2,
				Severity:    "HIGH",
				Description: fmt.Sprintf("Suspicious balanced buy/sell: buy=%d, sell=%d", buyVol, sellVol),
			}
		}
	}
	return nil
}

// DetectLayering detects multiple orders at same price level
func (ad *AnomalyDetector) DetectLayering(symbol string, price float64, orderCount int) *OrderFlowAnomaly {
	if orderCount > 10 {
		return &OrderFlowAnomaly{
			Timestamp:   time.Now(),
			Symbol:      symbol,
			Type:        "LAYERING",
			Price:       price,
			Severity:    "HIGH",
			Description: fmt.Sprintf("Multiple orders at same level: %d orders at %.2f", orderCount, price),
		}
	}
	return nil
}

// ProcessDepthData processes incoming depth data
func (ad *AnomalyDetector) ProcessDepthData(ctx context.Context, data DepthData) error {
	symbol := data.Symbol
	timestamp := time.Unix(0, data.Timestamp*int64(time.Millisecond))

	// Parse bid/ask levels into map
	bidMap := make(map[float64]int64)
	askMap := make(map[float64]int64)

	for _, bid := range data.Bids {
		bidMap[bid.Price] = bid.Volume
	}
	for _, ask := range data.Asks {
		askMap[ask.Price] = ask.Volume
	}

	// Store in-memory snapshot and cache
	snapshot := &OrderBookSnapshot{
		Timestamp: timestamp,
		Bids:      bidMap,
		Asks:      askMap,
	}

	if len(data.Bids) > 0 {
		snapshot.Bid = data.Bids[0].Price
	}
	if len(data.Asks) > 0 {
		snapshot.Ask = data.Asks[0].Price
	}
	snapshot.LastPrice = (snapshot.Bid + snapshot.Ask) / 2


	// compute spread in basis points
	spreadBps := int((snapshot.Ask - snapshot.Bid) / snapshot.LastPrice * 10000)

	// build and cache depth snapshot using helper
	depth := createDepthSnapshot(snapshot, symbol, timestamp, spreadBps)
	ad.mu.Lock()
	ad.marketDepthCache[symbol] = &depth
	ad.mu.Unlock()

	// Insert market depth
	return ad.insertDepthSnapshot(depth)
}

// CalculateHeatmap calculates order flow heatmap
func (ad *AnomalyDetector) CalculateHeatmap(ctx context.Context, symbol string, minutes int) ([]OrderFlowHeatmapRow, error) {
	query := fmt.Sprintf(`SELECT 
		COALESCE(time_bucket('1 minute', time), NOW()) AS bucket,
		symbol,
		price,
		COALESCE(SUM(CASE WHEN side = 'BUY' THEN volume ELSE 0 END), 0) AS bid_vol,
		COALESCE(SUM(CASE WHEN side = 'SELL' THEN volume ELSE 0 END), 0) AS ask_vol
	  FROM trades
	  WHERE symbol = $1 AND time > NOW() - INTERVAL '%d minutes'
	  GROUP BY bucket, symbol, price
	  ORDER BY bucket DESC, price DESC`, minutes)

	rows, err := ad.db.QueryContext(ctx, query, symbol)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var heatmaps []OrderFlowHeatmapRow
	for rows.Next() {
		var (
			bucket     time.Time
			sym        string
			price      float64
			bidVol     int64
			askVol     int64
		)

		if err := rows.Scan(&bucket, &sym, &price, &bidVol, &askVol); err != nil {
			return nil, err
		}

		netVol := bidVol - askVol
		ratio := 1.0
		if askVol > 0 {
			ratio = float64(bidVol) / float64(askVol)
		}

		// Normalize intensity 0-1
		intensity := math.Min(1.0, float64(bidVol+askVol)/1e6)

		heatmaps = append(heatmaps, OrderFlowHeatmapRow{
			Timestamp:   bucket,
			Symbol:      symbol,
			Price:       price,
			BidVolume:   bidVol,
			AskVolume:   askVol,
			NetVolume:   netVol,
			BidAskRatio: ratio,
			Intensity:   intensity,
		})
	}

	return heatmaps, rows.Err()
}

// CalculateHAKAHAKI calculates HAKA/HAKI summary
func (ad *AnomalyDetector) CalculateHAKAHAKI(ctx context.Context, symbol string) (*HAKAHAKISummary, error) {
	// Get latest bid/ask from market depth
	ad.mu.RLock()
	depthSnapshot := ad.marketDepthCache[symbol]
	ad.mu.RUnlock()

	if depthSnapshot == nil {
		return &HAKAHAKISummary{
			Time:        time.Now(),
			Symbol:      symbol,
			HAKAVolume:  0,
			HAKIVolume:  0,
			HAKARatio:   0.5,
			Dominance:   "BALANCED",
			NetPressure: 0,
		}, nil
	}

	bestAsk := depthSnapshot.MidPrice + depthSnapshot.BidAskSpread
	bestBid := depthSnapshot.MidPrice - depthSnapshot.BidAskSpread/2

	// Count aggressive buys (trades at or above ask) and sells (trades at or below bid)
	query := `SELECT
		COALESCE(SUM(CASE WHEN price >= $2 AND side = 'BUY' THEN volume ELSE 0 END), 0) AS haka,
		COALESCE(SUM(CASE WHEN price <= $3 AND side = 'SELL' THEN volume ELSE 0 END), 0) AS haki
	  FROM trades
	  WHERE symbol = $1 AND time > NOW() - INTERVAL '1 minute'`

	var hakaVol, hakiVol int64
	err := ad.db.QueryRowContext(ctx, query, symbol, bestAsk, bestBid).Scan(&hakaVol, &hakiVol)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	if hakaVol == 0 && hakiVol == 0 {
		return &HAKAHAKISummary{
			Time:        time.Now(),
			Symbol:      symbol,
			HAKAVolume:  0,
			HAKIVolume:  0,
			HAKARatio:   0.5,
			Dominance:   "BALANCED",
			NetPressure: 0,
		}, nil
	}

	total := hakaVol + hakiVol
	ratio := float64(hakaVol) / float64(total)

	dominance := "BALANCED"
	if ratio > 0.6 {
		dominance = "HAKA"
	} else if ratio < 0.4 {
		dominance = "HAKI"
	}

	netPressure := int((ratio - 0.5) * 200) // -100 to +100

	return &HAKAHAKISummary{
		Time:        time.Now(),
		Symbol:      symbol,
		HAKAVolume:  hakaVol,
		HAKIVolume:  hakiVol,
		HAKARatio:   ratio,
		Dominance:   dominance,
		NetPressure: netPressure,
	}, nil
}

// InsertHeatmapData persists heatmap data to database
func (ad *AnomalyDetector) InsertHeatmapData(ctx context.Context, heatmap OrderFlowHeatmapRow) error {
	query := `INSERT INTO order_flow_heatmap (time, symbol, price, bid_volume, ask_volume, net_volume, bid_ask_ratio, intensity, trade_count)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	          ON CONFLICT (time, symbol, price) DO NOTHING`

	_, err := ad.db.ExecContext(ctx, query,
		heatmap.Timestamp, heatmap.Symbol, heatmap.Price, heatmap.BidVolume, heatmap.AskVolume,
		heatmap.NetVolume, heatmap.BidAskRatio, heatmap.Intensity, 0)

	return err
}

// InsertHAKAHAKIData persists HAKA/HAKI summary
func (ad *AnomalyDetector) InsertHAKAHAKIData(ctx context.Context, summary HAKAHAKISummary) error {
	query := `INSERT INTO haka_haki_summary (time, symbol, haka_volume, haki_volume, haka_ratio, dominance, net_pressure)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)
	          ON CONFLICT (time, symbol) DO NOTHING`

	_, err := ad.db.ExecContext(ctx, query,
		summary.Time, summary.Symbol, summary.HAKAVolume, summary.HAKIVolume,
		summary.HAKARatio, summary.Dominance, summary.NetPressure)

	return err
}

// insertDepthSnapshot persists market depth snapshot
func (ad *AnomalyDetector) insertDepthSnapshot(depth MarketDepthSnapshot) error {
	bidJSON, _ := json.Marshal(depth.BidLevels)
	askJSON, _ := json.Marshal(depth.AskLevels)

	query := `INSERT INTO market_depth (time, symbol, bid_levels, ask_levels, total_bid_volume, total_ask_volume, mid_price, bid_ask_spread, spread_bps)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	          ON CONFLICT (time, symbol) DO NOTHING`

	_, err := ad.db.ExecContext(context.Background(), query,
		depth.Timestamp, depth.Symbol, string(bidJSON), string(askJSON),
		depth.TotalBidVolume, depth.TotalAskVolume, depth.MidPrice, depth.BidAskSpread, depth.SpreadBps)

	return err
}

// calculateSeverity determines anomaly severity based on volume
func (ad *AnomalyDetector) calculateSeverity(volume int64) string {
	if volume > 1000000 {
		return "HIGH"
	} else if volume > 100000 {
		return "MEDIUM"
	}
	return "LOW"
}

// GetRecentAnomalies returns recent anomalies for a symbol
func (ad *AnomalyDetector) GetRecentAnomalies(symbol string) []OrderFlowAnomaly {
	ad.mu.RLock()
	defer ad.mu.RUnlock()

	if anomalies, exists := ad.recentAnomalies[symbol]; exists {
		return anomalies
	}
	return []OrderFlowAnomaly{}
}

// StartAggregationWorker starts background aggregation
func (ad *AnomalyDetector) StartAggregationWorker(ctx context.Context, symbols []string) {
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				for _, symbol := range symbols {
					// Calculate and store heatmap
					heatmaps, err := ad.CalculateHeatmap(ctx, symbol, 60)
					if err != nil {
						log.Printf("Error calculating heatmap: %v", err)
						continue
					}

					for _, hm := range heatmaps {
						if err := ad.InsertHeatmapData(ctx, hm); err != nil {
							log.Printf("Error inserting heatmap: %v", err)
						}
					}

					// Calculate and store HAKA/HAKI
					summary, err := ad.CalculateHAKAHAKI(ctx, symbol)
					if err != nil {
						log.Printf("Error calculating HAKA/HAKI: %v", err)
						continue
					}

					if err := ad.InsertHAKAHAKIData(ctx, *summary); err != nil {
						log.Printf("Error inserting HAKA/HAKI: %v", err)
					}
				}
			}
		}
	}()
}

// --- Exported Functions ---

// GetOrderFlowHeatmap retrieves heatmap data
func GetOrderFlowHeatmap(symbol string, limit int) ([]OrderFlowHeatmapRow, error) {
	if anomalyDetector == nil {
		return nil, fmt.Errorf("anomaly detector not initialized")
	}

	rows, err := db.Query(`
		SELECT time, symbol, price, bid_volume, ask_volume, net_volume, bid_ask_ratio, intensity
		FROM order_flow_heatmap
		WHERE symbol = $1
		ORDER BY time DESC
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

	return results, rows.Err()
}

// GetLatestMarketDepth retrieves latest market depth
func GetLatestMarketDepth(symbol string) (*MarketDepthSnapshot, error) {
	if anomalyDetector == nil {
		return nil, fmt.Errorf("anomaly detector not initialized")
	}

	anomalyDetector.mu.RLock()
	defer anomalyDetector.mu.RUnlock()

	if depth, exists := anomalyDetector.marketDepthCache[symbol]; exists {
		return depth, nil
	}
	return nil, fmt.Errorf("no market depth data for %s", symbol)
}

// GetAnomalies retrieves anomalies
func GetAnomalies(symbol string, severity string, limit int) ([]OrderFlowAnomaly, error) {
	if anomalyDetector == nil {
		return nil, fmt.Errorf("anomaly detector not initialized")
	}

	query := `
		SELECT time, symbol, anomaly_type, price, volume, severity, description
		FROM order_flow_anomalies
		WHERE symbol = $1
	`
	args := []interface{}{symbol}

	if severity != "" {
		query += ` AND severity = $2`
		args = append(args, severity)
	}

	query += ` ORDER BY time DESC LIMIT $` + fmt.Sprint(len(args)+1)
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

// GetBrokerZScores computes net volume per broker and returns z-scores
func GetBrokerZScores(symbol string, days int) ([]struct {
	BrokerCode string
	NetVolume  int64
	ZScore     float64
}, error) {
	if db == nil {
		return nil, fmt.Errorf("db not initialized")
	}

	query := `
		SELECT broker_code, COALESCE(SUM(CASE WHEN side='BID' THEN volume ELSE -volume END),0) AS net_volume
		FROM order_events
		WHERE symbol = $1 AND time > NOW() - ($2 || ' days')::interval
		GROUP BY broker_code
	`
	rows, err := db.Query(query, symbol, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rec struct{
		BrokerCode string
		NetVolume int64
	}
	var recs []rec
	var sum float64
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.BrokerCode, &r.NetVolume); err != nil {
			return nil, err
		}
		recs = append(recs, r)
		sum += float64(r.NetVolume)
	}
	if err := rows.Err(); err != nil { return nil, err }

	n := float64(len(recs))
	if n == 0 {
		return []struct{BrokerCode string; NetVolume int64; ZScore float64}{}, nil
	}
	mean := sum / n

	var variance float64
	for _, r := range recs {
		d := float64(r.NetVolume) - mean
		variance += d * d
	}
	varStd := math.Sqrt(variance / n)

	out := make([]struct{BrokerCode string; NetVolume int64; ZScore float64}, 0, len(recs))
	for _, r := range recs {
		z := 0.0
		if varStd > 0 { z = (float64(r.NetVolume) - mean) / varStd }
		out = append(out, struct{BrokerCode string; NetVolume int64; ZScore float64}{BrokerCode: r.BrokerCode, NetVolume: r.NetVolume, ZScore: z})
	}

	// sort by absolute z-score desc
	sort.Slice(out, func(i,j int) bool { return math.Abs(out[i].ZScore) > math.Abs(out[j].ZScore) })

	return out, nil
}

