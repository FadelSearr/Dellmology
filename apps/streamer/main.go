package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/go-redis/redis/v8"
	"context"
)

// --- Configuration ---
const (
	tokenAPIURL         = "http://localhost:3000/api/session"
	websocketURL        = "wss://stream.stockbit.com/stream"
	databaseURL         = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"
	httpListenAddr      = ":8080"
	reconnectWait       = 5 * time.Second
	// Risk Mitigation Config
	rocInterval         = 5 * time.Minute // 5 minute window for RoC check
	rocPriceDrop        = -0.10           // -10% price drop threshold
	rocCooldownDuration = 15 * time.Minute // Cooldown period for a flagged symbol
)

// --- Structs ---
type TokenResponse struct {
	Token string `json:"token"`
}
type WebSocketMessage struct {
	Type string          `json:"t"`
	Data json.RawMessage `json:"d"`
}
type TradeData struct {
	Symbol    string  `json:"s"`
	Price     float64 `json:"p"`
	Volume    int64   `json:"v"`
	Timestamp int64   `json:"dt"`
}
type QuoteData struct {
	Symbol string  `json:"s"`
	Bid    float64 `json:"b"`
	Offer  float64 `json:"o"`
}
type ProcessedTrade struct {
	Symbol    string    `json:"symbol"`
	Price     float64   `json:"price"`
	Volume    int64     `json:"volume"`
	TradeType string    `json:"trade_type"`
	Timestamp time.Time `json:"timestamp"`
}

// --- Risk Mitigation Structs ---
type PriceHistory struct {
	Price     float64
	Timestamp time.Time
}

// --- Redis Cache Helpers ---

func cacheSet(key string, value interface{}, ttl time.Duration) {
	if redisClient == nil {
		return
	}
	bytes, err := json.Marshal(value)
	if err != nil {
		log.Printf("Cache set marshal error: %v", err)
		return
	}
	redisClient.Set(ctx, key, string(bytes), ttl)
}

func cacheGet(key string, dest interface{}) bool {
	if redisClient == nil {
		return false
	}
	str, err := redisClient.Get(ctx, key).Result()
	if err != nil {
		return false
	}
	if json.Unmarshal([]byte(str), dest) == nil {
		return true
	}
	return false
}

// --- End Redis Cache Helpers ---
type CooldownInfo struct {
	EndTime time.Time
}

// --- Global State ---
var (
	db               *sql.DB
	redisClient      *redis.Client
	ctx              = context.Background()
	latestQuotes     = make(map[string]QuoteData)
	priceHistory     = make(map[string]PriceHistory) // For RoC Kill-Switch
	cooldownSymbols  = make(map[string]CooldownInfo) // For RoC Kill-Switch
	quotesMutex      = &sync.RWMutex{}
	priceHistoryMutex = &sync.Mutex{}
	sseBroker        *Broker
)

// --- SSE Broker ---
type Broker struct {
	clients      map[chan []byte]bool
	newClients   chan chan []byte
	defunctClients chan chan []byte
	messages     chan []byte
	mutex        sync.Mutex
}
func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}
	messageChan := make(chan []byte)
	b.newClients <- messageChan
	defer func() { b.defunctClients <- messageChan }()
	ctx := r.Context()
	for {
		select {
		case msg := <-messageChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}
func (b *Broker) run() {
	for {
		select {
		case s := <-b.newClients:
			b.mutex.Lock()
			b.clients[s] = true
			b.mutex.Unlock()
			log.Println("SSE client connected.")
		case s := <-b.defunctClients:
			b.mutex.Lock()
			delete(b.clients, s)
			b.mutex.Unlock()
			log.Println("SSE client disconnected.")
		case msg := <-b.messages:
			b.mutex.Lock()
			for s := range b.clients {
				s <- msg
			}
			b.mutex.Unlock()
		}
	}
}
func newBroker() *Broker {
	return &Broker{
		clients:      make(map[chan []byte]bool),
		newClients:   make(chan (chan []byte)),
		defunctClients: make(chan (chan []byte)),
		messages:     make(chan []byte, 100),
	}
}

// --- Main Application ---

func main() {
	var err error
	log.Println("Initializing Dellmology Pro Data Streamer...")

	// initialize Redis client for caching
	redisClient = redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "",
		DB:       0,
	})
	if _, err := redisClient.Ping(ctx).Result(); err != nil {
		log.Printf("WARNING: Redis not reachable: %v", err)
	} else {
		log.Println("Redis cache connected.")
	}

	sseBroker = newBroker()
	go sseBroker.run()

	db, err = initDB()
	if err != nil {
		log.Fatalf("FATAL: Could not connect to database. Error: %v", err)
	}
	defer db.Close()
	log.Println("Successfully connected to the database.")

	go startHTTPServer()
	runStreamer()
}

func runStreamer() {
	for {
		token, err := getAuthToken()
		if err != nil {
			log.Printf("ERROR: Could not retrieve auth token: %v. Retrying in %v...", err, reconnectWait)
			time.Sleep(reconnectWait)
			continue
		}
		log.Printf("Successfully retrieved auth token.")

		conn, err := connectWebSocket(token)
		if err != nil {
			log.Printf("ERROR: Failed to connect to WebSocket: %v. Retrying in %v...", err, reconnectWait)
			time.Sleep(reconnectWait)
			continue
		}

		log.Println("Successfully connected to WebSocket. Listening for messages...")
		messageLoop(conn)
		
		conn.Close()
		log.Println("WebSocket disconnected. Attempting to reconnect...")
		time.Sleep(reconnectWait)
	}
}

func messageLoop(conn *websocket.Conn) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("ERROR: Failed to read message: %v", err)
			return
		}
		go processMessage(message)
	}
}

func processMessage(rawMsg []byte) {
	var msg WebSocketMessage
	if err := json.Unmarshal(rawMsg, &msg); err != nil {
		log.Printf("WARN: Failed to parse generic websocket message: %v", err)
		return
	}

	switch msg.Type {
	case "trade":
		var trade TradeData
		if err := json.Unmarshal(msg.Data, &trade); err != nil {
			log.Printf("WARN: Failed to parse trade data: %v", err)
			return
		}

		// --- RoC Kill-Switch Mitigation ---
		if isSymbolInCooldown(trade.Symbol) {
			return // Skip processing for this symbol
		}
		if checkAndApplyRoCKillSwitch(trade) {
			return // Skip further processing if the kill switch was activated
		}
		// --- End Mitigation ---
		
		quotesMutex.RLock()
		quote, ok := latestQuotes[trade.Symbol]
		quotesMutex.RUnlock()

		if !ok {
			return
		}

		tradeType := "NORMAL"
		if trade.Price >= quote.Offer {
			tradeType = "HAKA"
		} else if trade.Price <= quote.Bid {
			tradeType = "HAKI"
		}
		
		processed := ProcessedTrade{
			Symbol:    trade.Symbol,
			Price:     trade.Price,
			Volume:    trade.Volume,
			TradeType: tradeType,
			Timestamp: time.Unix(trade.Timestamp, 0),
		}

		if err := insertTrade(processed); err != nil {
			log.Printf("ERROR: Failed to insert trade into DB: %v", err)
		}

		jsonData, err := json.Marshal(processed)
		if err == nil {
			sseBroker.messages <- jsonData
		}

	case "quote":
		var quote QuoteData
		if err := json.Unmarshal(msg.Data, &quote); err != nil {
			log.Printf("WARN: Failed to parse quote data: %v", err)
			return
		}
		quotesMutex.Lock()
		latestQuotes[quote.Symbol] = quote
		quotesMutex.Unlock()

	case "depth":
		var depth DepthData
		if err := json.Unmarshal(msg.Data, &depth); err != nil {
			log.Printf("WARN: Failed to parse depth data: %v", err)
			return
		}
		// Process order flow analysis asynchronously
		go processDepthData(depth)
	}
}


// --- Risk Mitigation Functions ---

func isSymbolInCooldown(symbol string) bool {
	priceHistoryMutex.Lock()
	defer priceHistoryMutex.Unlock()
	
	cooldown, exists := cooldownSymbols[symbol]
	if exists && time.Now().Before(cooldown.EndTime) {
		return true // Still in cooldown
	} else if exists {
		// Cooldown expired, remove it
		delete(cooldownSymbols, symbol)
	}
	return false
}

func checkAndApplyRoCKillSwitch(trade TradeData) bool {
	priceHistoryMutex.Lock()
	defer priceHistoryMutex.Unlock()

	now := time.Now()
	last, exists := priceHistory[trade.Symbol]

	// Update history regardless, but only if the entry is old enough to be a new reference point
	if !exists || now.Sub(last.Timestamp) > rocInterval {
		priceHistory[trade.Symbol] = PriceHistory{Price: trade.Price, Timestamp: now}
		return false
	}
	
	// Check for price drop
	if now.Sub(last.Timestamp) <= rocInterval {
		priceChange := (trade.Price - last.Price) / last.Price
		if priceChange < rocPriceDrop {
			log.Printf("CRITICAL: VOLATILITY SPIKE (RoC Kill-Switch) triggered for %s. Price dropped %.2f%% in %v. Symbol on cooldown for %v.",
				trade.Symbol, priceChange*100, now.Sub(last.Timestamp).Round(time.Second), rocCooldownDuration)
			
			// Put symbol on cooldown
			cooldownSymbols[trade.Symbol] = CooldownInfo{EndTime: now.Add(rocCooldownDuration)}
			// Reset history for this symbol
			delete(priceHistory, trade.Symbol)
			return true // Kill switch activated
		}
	}
	return false
}


// --- Database & HTTP Functions ---

func initDB() (*sql.DB, error) {
	d, err := sql.Open("postgres", databaseURL)
	if err != nil { return nil, err }
	if err = d.Ping(); err != nil { return nil, err }
	return d, nil
}

func insertTrade(t ProcessedTrade) error {
	_, err := db.Exec(`INSERT INTO trades (symbol, price, volume, trade_type, timestamp) VALUES ($1, $2, $3, $4, $5)`, t.Symbol, t.Price, t.Volume, t.TradeType, t.Timestamp)
	return err
}

func startHTTPServer() {
	mux := http.NewServeMux()
	mux.Handle("/stream", sseBroker)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})
	log.Printf("SSE and Health server listening on %s", httpListenAddr)
	if err := http.ListenAndServe(httpListenAddr, mux); err != nil {
		log.Fatalf("FATAL: HTTP server failed: %v", err)
	}
}

func connectWebSocket(token string) (*websocket.Conn, error) {
	headers := http.Header{"Authorization": {"Bearer " + token}}
	conn, _, err := websocket.DefaultDialer.Dial(websocketURL, headers)
	return conn, err
}

func getAuthToken() (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(tokenAPIURL)
	if err != nil { return "", err }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return "", fmt.Errorf("api returned non-200 status: %s", resp.Status) }
	body, err := io.ReadAll(resp.Body)
	if err != nil { return "", err }
	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil { return "", err }
	if tokenResp.Token == "" { return "", fmt.Errorf("token not found in api response") }
	return tokenResp.Token, nil
}
