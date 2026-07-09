// ══════════════════════════════════════════════════════════════
// Dellmology Pro — Go WebSocket Engine
// Real-time HAKA/HAKI tick streaming + SSE relay
//
// Per roadmap: "Go for WebSocket because it handles thousands
// of concurrent connections without breaking a sweat"
// ══════════════════════════════════════════════════════════════

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

// ── Types ────────────────────────────────────────────────────

type Tick struct {
	Time    string  `json:"time"`
	Emiten  string  `json:"emiten"`
	Price   float64 `json:"price"`
	Volume  int64   `json:"volume"`
	Type    string  `json:"type"` // "haka" or "haki"
	Board   string  `json:"board"`
	BrokerB string  `json:"broker_buy"`
	BrokerS string  `json:"broker_sell"`
}

type OrderbookLevel struct {
	Price  float64 `json:"price"`
	Volume int64   `json:"volume"`
	Count  int     `json:"count"`
}

type OrderbookSnapshot struct {
	Emiten string           `json:"emiten"`
	Time   string           `json:"time"`
	Bids   []OrderbookLevel `json:"bids"`
	Asks   []OrderbookLevel `json:"asks"`
}

type SSEClient struct {
	channel chan []byte
	done    chan struct{}
}

// ── Hub (broadcast to all SSE clients) ───────────────────────

type Hub struct {
	clients map[*SSEClient]bool
	mu      sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*SSEClient]bool)}
}

func (h *Hub) Register(c *SSEClient) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	log.Printf("[Hub] Client connected. Total: %d", len(h.clients))
}

func (h *Hub) Unregister(c *SSEClient) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	log.Printf("[Hub] Client disconnected. Total: %d", len(h.clients))
}

func (h *Hub) Broadcast(data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.channel <- data:
		default:
			// Client too slow, skip
		}
	}
}

// ── Globals ──────────────────────────────────────────────────

var (
	hub      = NewHub()
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ctx         = context.Background()
	redisClient *redis.Client

	// For Data Integrity Shield
	lastPriceMap = make(map[string]float64)
	priceMapMu   sync.Mutex

	// Rule Engine config
	engineRules = struct {
		PriceDeviationLimit float64  `json:"priceDeviationLimit"`
		AllowedBoards       []string `json:"allowedBoards"`
	}{
		PriceDeviationLimit: 0.20,
		AllowedBoards:       []string{"RG"},
	}

	// Monitored symbols (dynamic)
	monitoredSymbols = []string{"BBRI", "BBCA", "ANTM", "TLKM", "GOTO"}
	symbolsMu        sync.RWMutex

	// Real-time Base Prices for simulation
	basePriceMap = make(map[string]float64)
	basePriceMu  sync.RWMutex
)

// ── SSE Handler (Next.js dashboard connects here) ────────────

func sseHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	client := &SSEClient{
		channel: make(chan []byte, 256),
		done:    make(chan struct{}),
	}
	hub.Register(client)
	defer hub.Unregister(client)

	// Send heartbeat every 15s
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				client.channel <- []byte(`{"type":"heartbeat"}`)
			case <-client.done:
				return
			}
		}
	}()

	for {
		select {
		case msg := <-client.channel:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			close(client.done)
			return
		}
	}
}

// ── WebSocket Upstream (connects to Stockbit WS) ────────────

func connectUpstream(token string) {
	for {
		log.Println("[WS] Connecting to upstream...")

		symbols := getMonitoredSymbols()
		log.Printf("[WS] Monitoring %d symbols: %v", len(symbols), symbols)

		// In production, this would connect to Stockbit's WebSocket
		// For now, simulate tick data
		simulateTicks(symbols)

		log.Println("[WS] Disconnected. Reconnecting in 5s...")
		time.Sleep(5 * time.Second)
	}
}

func getMonitoredSymbols() []string {
	symbolsMu.RLock()
	defer symbolsMu.RUnlock()
	// Return a copy
	res := make([]string, len(monitoredSymbols))
	copy(res, monitoredSymbols)
	return res
}

func updateMonitoredSymbols() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	// Initial fetch
	refreshSymbols()

	for range ticker.C {
		refreshSymbols()
	}
}

func refreshSymbols() {
	newSymbols := make(map[string]bool)
	// Default Blue Chips
	defaults := []string{"BBRI", "BBCA", "BMRI", "BBNI", "TLKM", "ASII", "GOTO", "ANTM"}
	for _, s := range defaults {
		newSymbols[s] = true
	}

	// 1. Fetch from Oracle Picks (Supabase session table)
	if supabaseURL != "" {
		picks := fetchOraclePicks()
		for _, p := range picks {
			newSymbols[p] = true
		}
	}

	// 2. Fetch from Watchlist (Next.js API)
	watchlist := fetchWatchlistFromAPI()
	for _, w := range watchlist {
		newSymbols[w] = true
	}

	// Convert map to slice
	var finalSymbols []string
	for s := range newSymbols {
		finalSymbols = append(finalSymbols, s)
	}

	symbolsMu.Lock()
	monitoredSymbols = finalSymbols
	symbolsMu.Unlock()

	log.Printf("[Symbols] Monitoring refreshed. Total: %d", len(finalSymbols))
}

func fetchOraclePicks() []string {
	url := fmt.Sprintf("%s/rest/v1/session?key=eq.oracle_daily_picks&select=value", supabaseURL)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Authorization", "Bearer "+supabaseKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var results []struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil || len(results) == 0 {
		return nil
	}

	// Parse the nested JSON in value
	var cache struct {
		Data struct {
			TopPicks []struct {
				Emiten string `json:"emiten"`
			} `json:"topPicks"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(results[0].Value), &cache); err != nil {
		return nil
	}

	var picks []string
	for _, p := range cache.Data.TopPicks {
		picks = append(picks, p.Emiten)
	}
	return picks
}

func fetchWatchlistFromAPI() []string {
	// We hit the local Next.js API.
	// Note: We might need a secret or just hope it's accessible.
	resp, err := http.Get("http://localhost:3000/api/screener?mode=watchlist")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Data struct {
			Results []struct {
				Code  string  `json:"code"`
				Price float64 `json:"price"`
			} `json:"results"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	var symbols []string
	for _, r := range data.Data.Results {
		symbols = append(symbols, r.Code)
		
		// Also update base price map if not already set
		basePriceMu.Lock()
		if _, exists := basePriceMap[r.Code]; !exists || r.Price > 0 {
			basePriceMap[r.Code] = r.Price
		}
		basePriceMu.Unlock()
	}
	return symbols
}

func fetchRealPrices() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		log.Println("[PriceSync] Refreshing base prices from API...")
		symbols := getMonitoredSymbols()
		if len(symbols) == 0 {
			continue
		}

		// Hit the watchlist API to get fresh prices
		resp, err := http.Get("http://localhost:3000/api/screener?mode=watchlist")
		if err != nil {
			continue
		}

		var data struct {
			Data struct {
				Results []struct {
					Code  string  `json:"code"`
					Price float64 `json:"price"`
				} `json:"results"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
			basePriceMu.Lock()
			for _, r := range data.Data.Results {
				if r.Price > 0 {
					basePriceMap[r.Code] = r.Price
				}
			}
			basePriceMu.Unlock()
		}
		resp.Body.Close()
	}
}

func simulateTicks(symbols []string) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	// Track Shield log throttle to reduce spam
	shieldLogCount := make(map[string]int)
	lastShieldFlush := time.Now()

	for range ticker.C {
		// Flush Shield log count every 30s
		if time.Since(lastShieldFlush) > 30*time.Second {
			if total := func() int {
				n := 0
				for _, v := range shieldLogCount {
					n += v
				}
				return n
			}(); total > 0 {
				log.Printf("[Shield] Suppressed %d outlier ticks in last 30s (NG board / price deviation)", total)
				shieldLogCount = make(map[string]int)
			}
			lastShieldFlush = time.Now()
		}

		for _, sym := range symbols {
			ms := time.Now().UnixMilli()

			// NG board: inject very rarely (~0.5% of ticks) — was %15 (6.7%)
			board := "RG"
			if ms%200 == 0 {
				board = "NG"
			}

			// Use real base price if available, otherwise fallback to 4650
			basePriceMu.RLock()
			base, exists := basePriceMap[sym]
			basePriceMu.RUnlock()

			if !exists || base == 0 {
				base = 4650 // Global fallback
			}

			price := base + float64(ms%100-50)
			// Price deviation: inject very rarely (~0.3% of ticks) — was %25 (4%)
			if ms%333 == 0 {
				price = price * 0.5
			}

			tick := Tick{
				Time:   time.Now().Format("15:04:05.000"),
				Emiten: sym,
				Price:  price,
				Volume: int64(100 + ms%500),
				Type:   "haka",
				Board:  board,
			}
			if ms%3 == 0 {
				tick.Type = "haki"
			}

			// ── Data Integrity Shield (Outlier Filter) ──
			isAllowedBoard := false
			for _, b := range engineRules.AllowedBoards {
				if tick.Board == b {
					isAllowedBoard = true
					break
				}
			}
			if !isAllowedBoard && tick.Board != "" {
				shieldLogCount["ng_board"]++
				continue
			}

			priceMapMu.Lock()
			lastPrice, exists := lastPriceMap[sym]
			if exists {
				deviation := (tick.Price - lastPrice) / lastPrice
				if deviation > engineRules.PriceDeviationLimit || deviation < -engineRules.PriceDeviationLimit {
					shieldLogCount["price_dev"]++
					priceMapMu.Unlock()
					continue
				}
			}
			lastPriceMap[sym] = tick.Price
			priceMapMu.Unlock()
			// ────────────────────────────────────────────

			// Add to Redis Queue
			if redisClient != nil {
				tickBytes, _ := json.Marshal(tick)
				err := redisClient.LPush(ctx, "ticks_queue", tickBytes).Err()
				if err != nil {
					log.Printf("[Redis] LPush error: %v", err)
				}
			}

			data, _ := json.Marshal(map[string]interface{}{
				"type": "tick",
				"data": tick,
			})
			hub.Broadcast(data)
		}
	}
}

// ── Health Check ─────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "online",
		"clients": len(hub.clients),
		"uptime":  time.Since(startTime).String(),
	})
}

var startTime = time.Now()

// ── Supabase Batch Writer ─────────────────────────────────────

var (
	supabaseURL string
	supabaseKey string
)

func startBatchWriter() {
	ticker := time.NewTicker(2 * time.Second) // Flush every 2 seconds
	defer ticker.Stop()

	for range ticker.C {
		flushBuffer()
	}
}

func flushBuffer() {
	if redisClient == nil {
		return
	}

	var batch []Tick

	// Pop up to 500 items from Redis queue
	for i := 0; i < 500; i++ {
		res, err := redisClient.RPop(ctx, "ticks_queue").Result()
		if err == redis.Nil {
			break // queue is empty
		} else if err != nil {
			log.Printf("[Redis] RPop error: %v", err)
			break
		}

		var tick Tick
		if err := json.Unmarshal([]byte(res), &tick); err == nil {
			batch = append(batch, tick)
		}
	}

	if len(batch) == 0 {
		return
	}

	if supabaseURL == "" || supabaseKey == "" {
		return // Not configured
	}

	// Prepare payload for Supabase (running_trades)
	payloadBytes, err := json.Marshal(batch)
	if err != nil {
		log.Printf("[DB] Error marshaling batch: %v", err)
		return
	}

	req, err := http.NewRequest("POST", supabaseURL+"/rest/v1/running_trades", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Authorization", "Bearer "+supabaseKey)
	req.Header.Set("Prefer", "return=minimal")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[DB] Failed to insert batch: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// log.Printf("[DB] Supabase returned status %d", resp.StatusCode)
	} else {
		log.Printf("[DB] Successfully flushed %d ticks to Database", len(batch))
	}
}

// ── Main ─────────────────────────────────────────────────────

func main() {
	// Load environment variables
	envPath := filepath.Join("..", ".env.local")
	if err := godotenv.Load(envPath); err != nil {
		log.Println("No .env.local file found, using system env variables")
	}

	// ── Load Rule Engine ─────────────────────────────────────────
	rulesData, err := os.ReadFile("rules.json")
	if err == nil {
		json.Unmarshal(rulesData, &engineRules)
		log.Printf("[Init] Loaded Rule Engine: Deviation %.2f%%, Boards %v", engineRules.PriceDeviationLimit*100, engineRules.AllowedBoards)
	} else {
		log.Println("[Init] rules.json not found, using default hardcoded rules")
	}

	// ── Redis Init ───────────────────────────────────────────────
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0" // Fallback
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("[Redis] Warning: Failed to parse REDIS_URL: %v", err)
	} else {
		redisClient = redis.NewClient(opts)
		if err := redisClient.Ping(ctx).Err(); err != nil {
			log.Printf("[Redis] Warning: Could not connect to Redis: %v", err)
			redisClient = nil // disable redis logic if not connected
		} else {
			log.Println("[Init] Connected to Redis successfully.")
		}
	}

	// ── Supabase Init ────────────────────────────────────────────
	supabaseURL = os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	supabaseKey = os.Getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

	if supabaseURL != "" {
		log.Println("[Init] Database connection configured.")
		go startBatchWriter()
	} else {
		log.Println("[Init] WARNING: Database connection missing (SUPABASE_URL)")
	}

	port := ":8080"
	http.HandleFunc("/sse", sseHandler)
	http.HandleFunc("/health", healthHandler)

	// Start symbols updater
	go updateMonitoredSymbols()

	// Start price sync worker
	go fetchRealPrices()

	// Start upstream connection in background
	go connectUpstream("")

	log.Printf("🚀 Dellmology Engine starting on %s", port)
	log.Printf("   SSE:    http://localhost%s/sse", port)
	log.Printf("   Health: http://localhost%s/health", port)

	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
