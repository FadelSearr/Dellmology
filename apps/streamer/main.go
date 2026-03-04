package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"context"

	analysispkg "github.com/dellmology/streamer/internal/analysis"
	"github.com/go-redis/redis/v8"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// --- Configuration ---
const (
	tokenAPIURL         = "http://localhost:3000/api/session"
	websocketURL        = "wss://stream.stockbit.com/stream"
	databaseURL         = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"
	httpListenAddr      = ":8080"
	workerHeartbeatAPIURL = "http://localhost:3000/api/worker-heartbeat"
	reconnectMinWait    = 2 * time.Second
	reconnectMaxWait    = 60 * time.Second
	workerHeartbeatInterval = 5 * time.Minute
	workerHeartbeatTimeout = 8 * time.Second
	workerHeartbeatStaleThresholdSeconds = 60
	// Risk Mitigation Config
	rocInterval         = 5 * time.Minute // 5 minute window for RoC check
	rocPriceDrop        = -0.10           // -10% price drop threshold
	rocCooldownDuration = 15 * time.Minute // Cooldown period for a flagged symbol
	redisQueueChannel   = "dellmology:raw:ws"
)

// --- Structs ---
type TokenResponse struct {
	Token             string `json:"token"`
	Available         bool   `json:"available"`
	Reason            string `json:"reason"`
	RetryAfterSeconds int    `json:"retry_after_seconds"`
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
	Market    string  `json:"market"`
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

type DeadLetterRecord struct {
	Payload   string    `json:"payload"`
	Reason    string    `json:"reason"`
	Timestamp time.Time `json:"timestamp"`
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
	negotiatedMutex  = &sync.RWMutex{}
	sseBroker        *Broker
	messageQueue     chan []byte
	negotiatedTrades []ProcessedTrade
	useExternalQueue bool
	lastMessageAt    time.Time
	processedMessageHashes = make(map[uint64]time.Time)
	processedMutex   = &sync.Mutex{}
	deadLetters      []DeadLetterRecord
	deadLetterMutex  = &sync.Mutex{}
	ErrTokenUnavailable = errors.New("token unavailable")
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
		useExternalQueue = strings.EqualFold(os.Getenv("USE_REDIS_QUEUE"), "true")
	}

	sseBroker = newBroker()
	go sseBroker.run()

	messageQueue = make(chan []byte, 2048)
	if useExternalQueue && redisClient != nil {
		log.Printf("Redis external queue enabled on channel %s", redisQueueChannel)
		for i := 0; i < 4; i++ {
			go redisSubscriberWorker(i)
		}
	} else {
		for i := 0; i < 4; i++ {
			go messageWorker(i)
		}
	}

	db, err = initDB()
	if err != nil {
		log.Fatalf("FATAL: Could not connect to database. Error: %v", err)
	}
	defer db.Close()
	log.Println("Successfully connected to the database.")

	go startHTTPServer()
	go startWorkerHeartbeatReporter()
	runStreamer()
}

func startWorkerHeartbeatReporter() {
	targetURL := strings.TrimSpace(os.Getenv("WORKER_HEARTBEAT_URL"))
	if targetURL == "" {
		targetURL = workerHeartbeatAPIURL
	}

	interval := workerHeartbeatInterval
	if raw := strings.TrimSpace(os.Getenv("WORKER_HEARTBEAT_INTERVAL_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 30 && parsed <= 3600 {
			interval = time.Duration(parsed) * time.Second
		}
	}

	timeout := workerHeartbeatTimeout
	if raw := strings.TrimSpace(os.Getenv("WORKER_HEARTBEAT_TIMEOUT_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 2 && parsed <= 120 {
			timeout = time.Duration(parsed) * time.Second
		}
	}

	client := &http.Client{Timeout: timeout}
	log.Printf("Worker heartbeat reporter enabled: %s every %s", targetURL, interval)

	publishWorkerHeartbeat(client, targetURL)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		publishWorkerHeartbeat(client, targetURL)
	}
}

func publishWorkerHeartbeat(client *http.Client, targetURL string) {
	staleSeconds := -1
	state := "warming"
	if !lastMessageAt.IsZero() {
		staleSeconds = int(time.Since(lastMessageAt).Seconds())
		state = "alive"
		if staleSeconds > workerHeartbeatStaleThresholdSeconds {
			state = "stale"
		}
	}

	deadLetterMutex.Lock()
	deadLetterCount := len(deadLetters)
	deadLetterMutex.Unlock()
	processedMutex.Lock()
	processedCacheSize := len(processedMessageHashes)
	processedMutex.Unlock()
	queueDepth := 0
	if messageQueue != nil {
		queueDepth = len(messageQueue)
	}
	queueMode := "local"
	if useExternalQueue {
		queueMode = "redis_pubsub"
	}

	note := fmt.Sprintf(
		"stale_seconds=%d queue_mode=%s queue_depth=%d processed_cache=%d dead_letters=%d",
		staleSeconds,
		queueMode,
		queueDepth,
		processedCacheSize,
		deadLetterCount,
	)
	payload := map[string]string{
		"source": "streamer-go",
		"state":  state,
		"note":   note,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("WARN: heartbeat payload marshal failed: %v", err)
		return
	}

	request, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		log.Printf("WARN: heartbeat request build failed: %v", err)
		return
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := client.Do(request)
	if err != nil {
		log.Printf("WARN: heartbeat publish failed: %v", err)
		return
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)

	if response.StatusCode >= 300 {
		log.Printf("WARN: heartbeat publish returned status %d", response.StatusCode)
	}
}

func runStreamer() {
	reconnectWait := reconnectMinWait

	for {
		token, err := getAuthToken()
		if err != nil {
			if errors.Is(err, ErrTokenUnavailable) {
				wait := reconnectWait
				if wait < 15*time.Second {
					wait = 15 * time.Second
				}
				log.Printf("INFO: Auth token currently unavailable (%v). Retrying in %v...", err, wait)
				time.Sleep(wait)
				reconnectWait = nextBackoff(reconnectWait)
				continue
			}

			log.Printf("ERROR: Could not retrieve auth token: %v. Retrying in %v...", err, reconnectWait)
			time.Sleep(reconnectWait)
			reconnectWait = nextBackoff(reconnectWait)
			continue
		}
		log.Printf("Successfully retrieved auth token.")

		conn, err := connectWebSocket(token)
		if err != nil {
			log.Printf("ERROR: Failed to connect to WebSocket: %v. Retrying in %v...", err, reconnectWait)
			time.Sleep(reconnectWait)
			reconnectWait = nextBackoff(reconnectWait)
			continue
		}

		reconnectWait = reconnectMinWait

		log.Println("Successfully connected to WebSocket. Listening for messages...")
		messageLoop(conn)
		
		conn.Close()
		log.Println("WebSocket disconnected. Attempting to reconnect...")
		time.Sleep(reconnectWait)
		reconnectWait = nextBackoff(reconnectWait)
	}
}

func nextBackoff(current time.Duration) time.Duration {
	next := current * 2
	if next > reconnectMaxWait {
		return reconnectMaxWait
	}
	if next < reconnectMinWait {
		return reconnectMinWait
	}
	return next
}

func messageLoop(conn *websocket.Conn) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("ERROR: Failed to read message: %v", err)
			return
		}
		lastMessageAt = time.Now().UTC()

		if useExternalQueue && redisClient != nil {
			if err := redisClient.Publish(ctx, redisQueueChannel, string(message)).Err(); err != nil {
				log.Printf("WARN: Redis publish failed, fallback local queue: %v", err)
				select {
				case messageQueue <- message:
				default:
					log.Printf("WARN: message queue full, dropping message")
				}
			}
			continue
		}
		select {
		case messageQueue <- message:
		default:
			log.Printf("WARN: message queue full, dropping message")
		}
	}
}

func messageWorker(id int) {
	for msg := range messageQueue {
		handleMessageWithGuard(msg)
	}
}

func redisSubscriberWorker(id int) {
	if redisClient == nil {
		return
	}
	pubsub := redisClient.Subscribe(ctx, redisQueueChannel)
	defer pubsub.Close()
	ch := pubsub.Channel()
	for msg := range ch {
		handleMessageWithGuard([]byte(msg.Payload))
	}
}

func handleMessageWithGuard(msg []byte) {
	h := fnv.New64a()
	_, _ = h.Write(msg)
	hash := h.Sum64()

	processedMutex.Lock()
	if ts, exists := processedMessageHashes[hash]; exists && time.Since(ts) < 30*time.Second {
		processedMutex.Unlock()
		return
	}
	processedMessageHashes[hash] = time.Now().UTC()
	if len(processedMessageHashes) > 10000 {
		for k, t := range processedMessageHashes {
			if time.Since(t) > 2*time.Minute {
				delete(processedMessageHashes, k)
			}
		}
	}
	processedMutex.Unlock()

	defer func() {
		if rec := recover(); rec != nil {
			pushDeadLetter(string(msg), fmt.Sprintf("panic: %v", rec))
		}
	}()

	processMessage(msg)
}

func pushDeadLetter(payload string, reason string) {
	deadLetterMutex.Lock()
	defer deadLetterMutex.Unlock()
	deadLetters = append(deadLetters, DeadLetterRecord{
		Payload: payload,
		Reason: reason,
		Timestamp: time.Now().UTC(),
	})
	if len(deadLetters) > 200 {
		deadLetters = deadLetters[len(deadLetters)-200:]
	}
}

func processMessage(rawMsg []byte) {
	var msg WebSocketMessage
	if err := json.Unmarshal(rawMsg, &msg); err != nil {
		log.Printf("WARN: Failed to parse generic websocket message: %v", err)
		return
	}

	switch msg.Type {
	case "trade", "trade_nego", "trade_cross", "nego", "cross":
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

		tradeType := "NORMAL"
		typeLower := strings.ToLower(msg.Type)
		if strings.Contains(typeLower, "nego") {
			tradeType = "NEGO"
		} else if strings.Contains(typeLower, "cross") {
			tradeType = "CROSS"
		} else if strings.EqualFold(strings.TrimSpace(trade.Market), "nego") {
			tradeType = "NEGO"
		} else if strings.EqualFold(strings.TrimSpace(trade.Market), "cross") {
			tradeType = "CROSS"
		} else if ok && trade.Price >= quote.Offer {
			tradeType = "HAKA"
		} else if ok && trade.Price <= quote.Bid {
			tradeType = "HAKI"
		} else if !ok {
			tradeType = "NORMAL"
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
		if processed.TradeType == "NEGO" || processed.TradeType == "CROSS" {
			recordNegotiatedTrade(processed)
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
	mux.HandleFunc("/broker/whale-clusters", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
		if symbol == "" {
			symbol = "BBCA"
		}
		days := 7
		if raw := strings.TrimSpace(r.URL.Query().Get("days")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 && parsed <= 30 {
				days = parsed
			}
		}
		payload := analysispkg.AnalyzeBrokerFlow(symbol, days)
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("/negotiated/latest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		negotiatedMutex.RLock()
		defer negotiatedMutex.RUnlock()
		if err := json.NewEncoder(w).Encode(map[string]interface{}{
			"items": negotiatedTrades,
			"count": len(negotiatedTrades),
			"timestamp": time.Now().UTC(),
		}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})
	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		staleSeconds := 0
		if !lastMessageAt.IsZero() {
			staleSeconds = int(time.Since(lastMessageAt).Seconds())
		}
		status := "healthy"
		if staleSeconds > 60 {
			status = "stale"
		}
		deadLetterMutex.Lock()
		deadLetterCount := len(deadLetters)
		deadLetterMutex.Unlock()
		processedMutex.Lock()
		processedCacheSize := len(processedMessageHashes)
		processedMutex.Unlock()
		queueDepth := 0
		if messageQueue != nil {
			queueDepth = len(messageQueue)
		}
		queueMode := "local"
		if useExternalQueue {
			queueMode = "redis_pubsub"
		}
		if err := json.NewEncoder(w).Encode(map[string]interface{}{
			"status": status,
			"stale_seconds": staleSeconds,
			"external_queue": useExternalQueue,
			"queue_mode": queueMode,
			"queue_depth": queueDepth,
			"processed_cache_size": processedCacheSize,
			"dead_letter_count": deadLetterCount,
			"checked_at": time.Now().UTC(),
		}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("/dead-letter", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		deadLetterMutex.Lock()
		rows := append([]DeadLetterRecord(nil), deadLetters...)
		deadLetterMutex.Unlock()
		if err := json.NewEncoder(w).Encode(map[string]interface{}{
			"count": len(rows),
			"items": rows,
			"checked_at": time.Now().UTC(),
		}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
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
	if tokenResp.Token == "" {
		reason := tokenResp.Reason
		if reason == "" {
			reason = "token not found in api response"
		}
		if tokenResp.RetryAfterSeconds > 0 {
			reason = fmt.Sprintf("%s (retry_after=%ds)", reason, tokenResp.RetryAfterSeconds)
		}
		return "", fmt.Errorf("%w: %s", ErrTokenUnavailable, reason)
	}
	return tokenResp.Token, nil
}

func recordNegotiatedTrade(t ProcessedTrade) {
	negotiatedMutex.Lock()
	defer negotiatedMutex.Unlock()
	negotiatedTrades = append(negotiatedTrades, t)
	if len(negotiatedTrades) > 100 {
		negotiatedTrades = negotiatedTrades[len(negotiatedTrades)-100:]
	}
}
