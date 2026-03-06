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
	"sync/atomic"
	"time"

	"context"
	"os/exec"

	analysispkg "github.com/dellmology/streamer/internal/analysis"
	"github.com/go-redis/redis/v8"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// --- Configuration ---
const (
	tokenAPIURL         = "http://localhost:3000/api/session"
	websocketURL        = "wss://stream.stockbit.com/stream"
	systemControlAPIURL = "http://localhost:3000/api/system-control"
	workerResetAPIURL   = "http://localhost:3000/api/system-control/worker-reset"
	databaseURL         = "postgresql://admin:password@localhost:5433/dellmology?sslmode=disable"
	httpListenAddr      = "127.0.0.1:8080"
	workerHeartbeatAPIURL = "http://localhost:3000/api/worker-heartbeat"
	reconnectMinWait    = 2 * time.Second
	reconnectMaxWait    = 60 * time.Second
	workerHeartbeatInterval = 5 * time.Minute
	workerHeartbeatTimeout = 8 * time.Second
	workerHeartbeatStaleThresholdSeconds = 60
	telegramAlertAPIURL = "http://localhost:3000/api/telegram-alert"
	telegramHeartbeatInterval = 5 * time.Minute
	telegramOfflineThreshold = 10 * time.Minute
	telegramAlertCooldown = 10 * time.Minute
	telegramAlertTimeout = 8 * time.Second
	systemControlPollInterval = 1 * time.Minute
	systemControlTimeout = 8 * time.Second
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

type SystemControlResponse struct {
	IsSystemActive bool `json:"is_system_active"`
}

type WorkerResetResponse struct {
	ResetRequested bool   `json:"reset_requested"`
	Reason         string `json:"reason"`
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
	telegramAlertStateMutex = &sync.Mutex{}
	lastTelegramEmergencyAlertAt time.Time
	lastTelegramOfflineState bool
	ErrTokenUnavailable = errors.New("token unavailable")

    // ML inference metrics
    mlFetchFailures int64
    mlFetchSuccesses int64
    mlMutex sync.Mutex
    mlLastError string
    mlLastChecked time.Time
	// ML circuit-breaker state
	mlConsecutiveFailures int64
	mlCircuitOpen bool
	mlCircuitOpenedAt time.Time
	mlCircuitMutex sync.Mutex
	// debug: force ML failures (for testing circuit-breaker)
	mlForceFail bool
	mlForceFailMutex sync.Mutex
	// ML latency histogram
	mlLatencyBucketThresholds = []float64{0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0}
	mlLatencyBucketCounts []int64
	mlLatencyCount int64
	mlLatencySumMs int64
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

	// initialize ML latency bucket counters
	mlLatencyBucketCounts = make([]int64, len(mlLatencyBucketThresholds))

	sseBroker = newBroker()
	go sseBroker.run()

	// Start the alert-log rotation helper (best-effort, non-blocking).
	// This will invoke the PowerShell rotation script if present on Windows.
	go startLogRotation()

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
	go startTelegramHeartbeatMonitor()
	runStreamer()
}

func startTelegramHeartbeatMonitor() {
	targetURL := strings.TrimSpace(os.Getenv("TELEGRAM_HEARTBEAT_URL"))
	if targetURL == "" {
		targetURL = telegramAlertAPIURL
	}

	interval := telegramHeartbeatInterval
	if raw := strings.TrimSpace(os.Getenv("TELEGRAM_HEARTBEAT_INTERVAL_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 30 && parsed <= 3600 {
			interval = time.Duration(parsed) * time.Second
		}
	}

	offlineThreshold := telegramOfflineThreshold
	if raw := strings.TrimSpace(os.Getenv("TELEGRAM_OFFLINE_THRESHOLD_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 60 && parsed <= 7200 {
			offlineThreshold = time.Duration(parsed) * time.Second
		}
	}

	alertCooldown := telegramAlertCooldown
	if raw := strings.TrimSpace(os.Getenv("TELEGRAM_EMERGENCY_ALERT_COOLDOWN_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 60 && parsed <= 7200 {
			alertCooldown = time.Duration(parsed) * time.Second
		}
	}

	timeout := telegramAlertTimeout
	if raw := strings.TrimSpace(os.Getenv("TELEGRAM_HEARTBEAT_TIMEOUT_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 2 && parsed <= 120 {
			timeout = time.Duration(parsed) * time.Second
		}
	}

	client := &http.Client{Timeout: timeout}
	log.Printf("Telegram heartbeat monitor enabled: %s every %s (offline threshold=%s cooldown=%s)", targetURL, interval, offlineThreshold, alertCooldown)

	publishTelegramHeartbeat(client, targetURL, offlineThreshold, alertCooldown)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		publishTelegramHeartbeat(client, targetURL, offlineThreshold, alertCooldown)
	}
}

func publishTelegramHeartbeat(client *http.Client, targetURL string, offlineThreshold time.Duration, alertCooldown time.Duration) {
	now := time.Now().UTC()
	staleSeconds := -1
	state := "warming"
	isOffline := false

	if !lastMessageAt.IsZero() {
		staleSeconds = int(now.Sub(lastMessageAt).Seconds())
		if now.Sub(lastMessageAt) > offlineThreshold {
			state = "offline"
			isOffline = true
		} else {
			state = "online"
		}
	}

	note := fmt.Sprintf("streamer heartbeat %s | stale_seconds=%d", state, staleSeconds)
	if err := sendTelegramSystemAlert(client, targetURL, "STREAMER_HEARTBEAT_PING", note, staleSeconds); err != nil {
		log.Printf("WARN: telegram heartbeat ping failed: %v", err)
	}

	shouldSendEmergency := false
	shouldSendRecovered := false
	telegramAlertStateMutex.Lock()
	if isOffline {
		if lastTelegramEmergencyAlertAt.IsZero() || now.Sub(lastTelegramEmergencyAlertAt) >= alertCooldown {
			lastTelegramEmergencyAlertAt = now
			shouldSendEmergency = true
		}
	} else if lastTelegramOfflineState && !lastMessageAt.IsZero() {
		shouldSendRecovered = true
	}
	lastTelegramOfflineState = isOffline
	telegramAlertStateMutex.Unlock()

	if shouldSendEmergency {
		emergency := "DELLMOLOGY OFFLINE - CHECK POSITION MANUALLY!"
		detail := fmt.Sprintf("No stream data for %d seconds (threshold %ds)", staleSeconds, int(offlineThreshold.Seconds()))
		if err := sendTelegramSystemAlert(client, targetURL, "DELLMOLOGY_OFFLINE", emergency+" | "+detail, staleSeconds); err != nil {
			log.Printf("WARN: telegram emergency alert failed: %v", err)
		}
	}

	if shouldSendRecovered {
		recovered := fmt.Sprintf("Stream recovered. Latest data seen %d seconds ago", staleSeconds)
		if err := sendTelegramSystemAlert(client, targetURL, "DELLMOLOGY_RECOVERED", recovered, staleSeconds); err != nil {
			log.Printf("WARN: telegram recovery alert failed: %v", err)
		}
	}
}

func sendTelegramSystemAlert(client *http.Client, targetURL string, event string, message string, staleSeconds int) error {
	payload := map[string]interface{}{
		"type":   "market",
		"symbol": "SYSTEM",
		"data": map[string]interface{}{
			"event":         event,
			"message":       message,
			"stale_seconds": staleSeconds,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
			"source":        "streamer-go",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Best-effort: also persist outgoing alerts locally for debugging/verification
	go func(b []byte) {
		_ = os.MkdirAll("logs", 0755)
		f, err := os.OpenFile("logs/telegram_alerts.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return
		}
		defer f.Close()
		ts := time.Now().UTC().Format(time.RFC3339)
		f.WriteString(ts + " ")
		f.Write(b)
		f.WriteString("\n")
	}(body)

	request, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")

	// attempt with retries
	maxAttempts := 3
	backoffMs := 500
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		resp, err := client.Do(request)
		if err != nil {
			lastErr = err
			log.Printf("WARN: telegram alert attempt %d failed: %v", attempt, err)
		} else {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
			lastErr = fmt.Errorf("status %d", resp.StatusCode)
			log.Printf("WARN: telegram alert attempt %d returned status %d", attempt, resp.StatusCode)
		}
		// exponential backoff
		time.Sleep(time.Duration(backoffMs*(1<<(attempt-1))) * time.Millisecond)
	}

	// All attempts failed — persist failed alert for inspection (best-effort)
	go func(b []byte, errMsg string) {
		_ = os.MkdirAll("logs", 0755)
		f, err := os.OpenFile("logs/telegram_alerts_failed.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return
		}
		defer f.Close()
		ts := time.Now().UTC().Format(time.RFC3339)
		f.WriteString(ts + " ")
		f.WriteString(errMsg + " ")
		f.Write(b)
		f.WriteString("\n")
	}(body, lastErr.Error())

	return lastErr
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
	systemControlURL := strings.TrimSpace(os.Getenv("SYSTEM_CONTROL_URL"))
	if systemControlURL == "" {
		systemControlURL = systemControlAPIURL
	}
	workerResetURL := strings.TrimSpace(os.Getenv("WORKER_RESET_URL"))
	if workerResetURL == "" {
		workerResetURL = workerResetAPIURL
	}

	for {
		resetRequested, resetReason, err := fetchWorkerResetState(workerResetURL)
		if err != nil {
			log.Printf("WARN: worker-reset check failed (%v)", err)
		} else if resetRequested {
			log.Printf("WARN: Cloud hard-reset requested before connect: %s", resetReason)
			_ = acknowledgeWorkerReset(workerResetURL, "streamer-go")
			time.Sleep(reconnectMinWait)
			continue
		}

		active, err := fetchSystemActive(systemControlURL)
		if err != nil {
			log.Printf("WARN: system-control check failed (%v), continue with existing state", err)
		} else if !active {
			wait := reconnectWait
			if wait < 30*time.Second {
				wait = 30 * time.Second
			}
			log.Printf("INFO: Cloud kill-switch active (is_system_active=false). Worker paused for %v", wait)
			time.Sleep(wait)
			reconnectWait = nextBackoff(reconnectWait)
			continue
		}

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
		monitorStop := make(chan struct{})
		go monitorSystemControlLoop(conn, systemControlURL, workerResetURL, monitorStop)
		messageLoop(conn)
		close(monitorStop)
		
		conn.Close()
		log.Println("WebSocket disconnected. Attempting to reconnect...")
		time.Sleep(reconnectWait)
		reconnectWait = nextBackoff(reconnectWait)
	}
}

func monitorSystemControlLoop(conn *websocket.Conn, systemControlURL string, workerResetURL string, stop <-chan struct{}) {
	ticker := time.NewTicker(systemControlPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			resetRequested, resetReason, err := fetchWorkerResetState(workerResetURL)
			if err != nil {
				log.Printf("WARN: worker-reset monitor failed: %v", err)
			} else if resetRequested {
				log.Printf("WARN: Cloud hard-reset requested: %s. Closing websocket session.", resetReason)
				_ = acknowledgeWorkerReset(workerResetURL, "streamer-go")
				_ = conn.Close()
				return
			}

			active, err := fetchSystemActive(systemControlURL)
			if err != nil {
				log.Printf("WARN: system-control monitor failed: %v", err)
				continue
			}
			if !active {
				log.Printf("WARN: Cloud kill-switch turned OFF stream (is_system_active=false). Closing websocket session.")
				_ = conn.Close()
				return
			}
		}
	}
}

func fetchWorkerResetState(workerResetURL string) (bool, string, error) {
	client := &http.Client{Timeout: systemControlTimeout}
	response, err := client.Get(workerResetURL)
	if err != nil {
		return false, "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return false, "", fmt.Errorf("worker-reset status %d", response.StatusCode)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return false, "", err
	}

	var payload WorkerResetResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return false, "", err
	}

	return payload.ResetRequested, payload.Reason, nil
}

func acknowledgeWorkerReset(workerResetURL string, source string) error {
	client := &http.Client{Timeout: systemControlTimeout}
	payload := map[string]string{
		"action": "acknowledge",
		"source": source,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequest(http.MethodPost, workerResetURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("worker-reset acknowledge status %d", response.StatusCode)
	}

	return nil
}

func fetchSystemActive(systemControlURL string) (bool, error) {
	client := &http.Client{Timeout: systemControlTimeout}
	response, err := client.Get(systemControlURL)
	if err != nil {
		return true, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return true, fmt.Errorf("system-control status %d", response.StatusCode)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return true, err
	}

	var payload SystemControlResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return true, err
	}

	return payload.IsSystemActive, nil
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

// startLogRotation attempts to run the scripts/rotate_alert_logs.ps1 PowerShell
// helper at startup (best-effort). It runs in a goroutine and does not block
// the main application if the script is missing or fails to start.
func startLogRotation() {
	scriptPath := "scripts\\rotate_alert_logs.ps1"
	if _, err := os.Stat(scriptPath); err != nil {
		if os.IsNotExist(err) {
			log.Printf("rotate script not found: %s (skipping)", scriptPath)
			return
		}
		log.Printf("rotate script stat error: %v", err)
		return
	}

	// Try to start the PowerShell script detached so it can run independently.
	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath)
	if err := cmd.Start(); err != nil {
		log.Printf("WARN: failed to start rotate script: %v", err)
		return
	}
	log.Printf("Started rotate script (pid=%d)", cmd.Process.Pid)
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
	// Basic data integrity guard: drop obviously invalid frames early
	if msg.Type == "trade" || strings.Contains(strings.ToLower(msg.Type), "trade") {
		var td TradeData
		if err := json.Unmarshal(msg.Data, &td); err == nil {
			if !validateTrade(td) {
				log.Printf("WARN: Dropped invalid trade frame: %v", td)
				return
			}
		}
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

		// Run data integrity validation before inserting
		dp := DataPoint{
			Symbol:    processed.Symbol,
			Price:     processed.Price,
			Volume:    processed.Volume,
			Timestamp: processed.Timestamp.Unix() * 1000,
			Source:    "TRADE",
		}
		result := dataValidator.ValidateDataPoint(dp)
		// store validation result for monitoring
		dataValidator.StoreValidationResult(result, processed.Symbol)
		if !result.IsValid {
			log.Printf("VALIDATION FAILED for %s: %v (Score: %.1f)", processed.Symbol, result.Issues, result.Score)
			// skip inserting obviously invalid trades
			return
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

// validateTrade performs lightweight sanity checks to avoid poisoned data
func validateTrade(t TradeData) bool {
	// price and volume must be positive
	if t.Price <= 0 || t.Volume <= 0 {
		return false
	}
	// unrealistic price cap (defensive)
	if t.Price > 10000000000 { // > 10 billion
		return false
	}
	// timestamp should be a reasonable unix timestamp (after 2000)
	if t.Timestamp <= 946684800 { // 2000-01-01
		return false
	}
	return true
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
	if db == nil {
		// running in test or without DB; skip write
		return nil
	}
	_, err := db.Exec(`INSERT INTO trades (symbol, price, volume, trade_type, timestamp) VALUES ($1, $2, $3, $4, $5)`, t.Symbol, t.Price, t.Volume, t.TradeType, t.Timestamp)
	return err
}

func startHTTPServer() {
	// Initialize router
	mux := http.NewServeMux()

	// Endpoint: /market/commodities
	mux.HandleFunc("/market/commodities", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*"); w.Header().Set("Content-Type", "application/json");
		// Dummy data, replace with real API integration (e.g. yfinance, RSS, etc)
		resp := map[string]interface{}{
			"gold": 0.5,    // % change
			"coal": -1.2,
			"nickel": 2.1,
			"ihsg": 7200,
			"updated_at": time.Now().UTC(),
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
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
		// attempt to attach ML inference to REST response as well
		if rawInf := fetchMLInference(symbol); rawInf != nil {
			var inf interface{}
			if err := json.Unmarshal(rawInf, &inf); err == nil {
				m := map[string]interface{}{}
				if pbytes, err := json.Marshal(payload); err == nil {
					_ = json.Unmarshal(pbytes, &m)
				}
				m["ml_inference"] = inf
				if err := json.NewEncoder(w).Encode(m); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
		}
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	// REST Endpoint: /api/broker/stats?symbol=BBCA&days=7
	mux.HandleFunc("/api/broker/stats", func(w http.ResponseWriter, r *http.Request) {
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

	// Debug endpoint: trigger AnalyzeBrokerFlow now, attach ML inference if available,
	// broadcast result to SSE clients and return combined payload immediately.
	mux.HandleFunc("/debug/broker/analyze-now", func(w http.ResponseWriter, r *http.Request) {
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
		// attach ML inference if available
		if rawInf := fetchMLInference(symbol); rawInf != nil {
			var inf interface{}
			if err := json.Unmarshal(rawInf, &inf); err == nil {
				m := map[string]interface{}{}
				if pbytes, err := json.Marshal(payload); err == nil {
					_ = json.Unmarshal(pbytes, &m)
				}
				m["ml_inference"] = inf
				if b, err := json.Marshal(m); err == nil {
					// broadcast to SSE clients
					sseBroker.messages <- b
					// return combined payload
					if err := json.NewEncoder(w).Encode(m); err != nil {
						http.Error(w, err.Error(), http.StatusInternalServerError)
					}
					return
				}
			}
		}
		// fallback: broadcast and return original payload
		if b, err := json.Marshal(payload); err == nil {
			sseBroker.messages <- b
			if err := json.NewEncoder(w).Encode(payload); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		http.Error(w, "failed to encode payload", http.StatusInternalServerError)
	})

	// Debug endpoints to force ML failures for testing circuit-breaker
	mux.HandleFunc("/debug/ml/fail-on", func(w http.ResponseWriter, r *http.Request) {
		mlForceFailMutex.Lock()
		mlForceFail = true
		mlForceFailMutex.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"forced": true, "message": "ML failure mode enabled"})
	})
	mux.HandleFunc("/debug/ml/fail-off", func(w http.ResponseWriter, r *http.Request) {
		mlForceFailMutex.Lock()
		mlForceFail = false
		mlForceFailMutex.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"forced": false, "message": "ML failure mode disabled"})
	})
	mux.HandleFunc("/debug/ml/status", func(w http.ResponseWriter, r *http.Request) {
		mlForceFailMutex.Lock()
		force := mlForceFail
		mlForceFailMutex.Unlock()
		mlCircuitMutex.Lock()
		copen := mlCircuitOpen
		copened := mlCircuitOpenedAt
		mlCircuitMutex.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"force_fail": force, "circuit_open": copen, "circuit_opened_at": copened})
	})

	// SSE Endpoint: /stream/broker-analysis streams periodic broker analysis JSON
	mux.Handle("/stream/broker-analysis", sseBroker)

	// start background broadcaster for broker analysis (periodic)
	go func() {
		symbolsEnv := strings.TrimSpace(os.Getenv("BROKER_POLL_SYMBOLS"))
		symbols := []string{"BBCA"}
		if symbolsEnv != "" {
			parts := strings.Split(symbolsEnv, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if s := strings.ToUpper(strings.TrimSpace(p)); s != "" {
					trimmed = append(trimmed, s)
				}
			}
			if len(trimmed) > 0 {
				symbols = trimmed
			}
		}
		interval := 10 * time.Second
		if raw := strings.TrimSpace(os.Getenv("BROKER_POLL_INTERVAL_SECONDS")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 {
				interval = time.Duration(parsed) * time.Second
			}
		}
		for {
			for _, sym := range symbols {
				payload := analysispkg.AnalyzeBrokerFlow(sym, 7)
				// optionally call ML inference and attach results into the same payload
				if rawInf := fetchMLInference(sym); rawInf != nil {
					var inf interface{}
					if err := json.Unmarshal(rawInf, &inf); err == nil {
						// attach under `ml_inference` key
						m := map[string]interface{}{}
						// convert original payload to map[string]interface{}
						if pbytes, err := json.Marshal(payload); err == nil {
							_ = json.Unmarshal(pbytes, &m)
						}
						m["ml_inference"] = inf
						if b, err := json.Marshal(m); err == nil {
							sseBroker.messages <- b
						}
						continue
					}
				}
				if b, err := json.Marshal(payload); err == nil {
					sseBroker.messages <- b
				}
			}
			time.Sleep(interval)
		}
	}()
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



	// Endpoint: /market/regime?symbol=BBCA
	mux.HandleFunc("/market/regime", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
		if symbol == "" {
			symbol = "BBCA"
		}
		// Dummy: regime detection (replace with real logic)
		prices := []float64{1000, 1020, 1040, 1030, 1050, 1060, 1070, 1080, 1090, 1100}
		volumes := []int64{100, 120, 130, 110, 150, 160, 170, 180, 190, 200}
		regime := analysispkg.DetectMarketRegime(prices, volumes)
		isVol := analysispkg.IsVolatileMarket(prices, 0.03)
		resp := map[string]interface{}{
			"symbol": symbol,
			"regime": regime,
			"volatility": isVol,
			"updated_at": time.Now().UTC(),
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	// Endpoint: /market/price?symbol=BBCA
	mux.HandleFunc("/market/price", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
		if symbol == "" {
			symbol = "BBCA"
		}
		quotesMutex.RLock()
		quote, ok := latestQuotes[symbol]
		quotesMutex.RUnlock()
		resp := map[string]interface{}{
			"symbol": symbol,
			"bid": quote.Bid,
			"offer": quote.Offer,
			"last_price": quote.Offer, // fallback to offer
			"updated_at": time.Now().UTC(),
		}
		if !ok {
			resp["status"] = "no_data"
		} else {
			resp["status"] = "ok"
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	// Endpoint: /api/order-flow/heatmap?symbol=BBCA&limit=100
	mux.HandleFunc("/api/order-flow/heatmap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
		if symbol == "" {
			http.Error(w, "missing symbol parameter", http.StatusBadRequest)
			return
		}
		limit := 100
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 1000 {
				limit = parsed
			}
		}
		rows, err := GetOrderFlowHeatmap(symbol, limit)
		if err != nil {
			log.Printf("ERROR: failed to get heatmap: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := json.NewEncoder(w).Encode(map[string]interface{}{"symbol": symbol, "rows": rows}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	// Basic Prometheus-style metrics endpoint (text exposition)
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		failures := atomic.LoadInt64(&mlFetchFailures)
		successes := atomic.LoadInt64(&mlFetchSuccesses)
		mlMutex.Lock()
		lastErr := mlLastError
		lastChecked := mlLastChecked
		mlMutex.Unlock()

		fmt.Fprintf(w, "# HELP ml_fetch_successes Total successful ML fetches\n")
		fmt.Fprintf(w, "# TYPE ml_fetch_successes counter\n")
		fmt.Fprintf(w, "ml_fetch_successes %d\n", successes)

		fmt.Fprintf(w, "# HELP ml_fetch_failures Total failed ML fetch attempts\n")
		fmt.Fprintf(w, "# TYPE ml_fetch_failures counter\n")
		fmt.Fprintf(w, "ml_fetch_failures %d\n", failures)

		// consecutive failures and circuit state
		consec := atomic.LoadInt64(&mlConsecutiveFailures)
		mlCircuitMutex.Lock()
		copen := mlCircuitOpen
		copened := mlCircuitOpenedAt
		mlCircuitMutex.Unlock()
		fmt.Fprintf(w, "# HELP ml_consecutive_failures Consecutive ML fetch failures\n")
		fmt.Fprintf(w, "# TYPE ml_consecutive_failures gauge\n")
		fmt.Fprintf(w, "ml_consecutive_failures %d\n", consec)

		fmt.Fprintf(w, "# HELP ml_circuit_open ML circuit-breaker open (1=open,0=closed)\n")
		fmt.Fprintf(w, "# TYPE ml_circuit_open gauge\n")
		if copen {
			fmt.Fprintf(w, "ml_circuit_open 1\n")
			escTime := copened.UTC().Format(time.RFC3339)
			fmt.Fprintf(w, "# ML circuit opened at %s\n", escTime)
		} else {
			fmt.Fprintf(w, "ml_circuit_open 0\n")
		}

		// expose last error as a labeled gauge if present
		if lastErr != "" {
			esc := escapeLabelValue(lastErr)
			fmt.Fprintf(w, "# HELP ml_last_error Info about last ML fetch error (label)\n")
			fmt.Fprintf(w, "# TYPE ml_last_error gauge\n")
			fmt.Fprintf(w, "ml_last_error{error=\"%s\",checked=\"%s\"} 1\n", esc, lastChecked.UTC().Format(time.RFC3339))
		}

		// latency histogram exposition (buckets are cumulative)
		latCount := atomic.LoadInt64(&mlLatencyCount)
		latSum := atomic.LoadInt64(&mlLatencySumMs)
		fmt.Fprintf(w, "# HELP ml_fetch_latency_count Total ML fetch latency observations\n")
		fmt.Fprintf(w, "# TYPE ml_fetch_latency_count counter\n")
		fmt.Fprintf(w, "ml_fetch_latency_count %d\n", latCount)
		fmt.Fprintf(w, "# HELP ml_fetch_latency_sum_ms Sum of ML fetch latencies in milliseconds\n")
		fmt.Fprintf(w, "# TYPE ml_fetch_latency_sum_ms counter\n")
		fmt.Fprintf(w, "ml_fetch_latency_sum_ms %d\n", latSum)

		// buckets (cumulative)
		fmt.Fprintf(w, "# HELP ml_fetch_latency_bucket ML fetch latency buckets (cumulative)\n")
		fmt.Fprintf(w, "# TYPE ml_fetch_latency_bucket counter\n")
		cum := int64(0)
		for i, th := range mlLatencyBucketThresholds {
			cnt := atomic.LoadInt64(&mlLatencyBucketCounts[i])
			cum += cnt
			fmt.Fprintf(w, "ml_fetch_latency_bucket{le=\"%g\"} %d\n", th, cum)
		}
		// +Inf bucket
		fmt.Fprintf(w, "ml_fetch_latency_bucket{le=\"+Inf\"} %d\n", cum)
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
						"ml_inference": func() map[string]interface{} {
							mlCircuitMutex.Lock()
							copen := mlCircuitOpen
							copened := mlCircuitOpenedAt
							mlCircuitMutex.Unlock()
							return map[string]interface{}{
								"failures": atomic.LoadInt64(&mlFetchFailures),
								"successes": atomic.LoadInt64(&mlFetchSuccesses),
								"consecutive_failures": atomic.LoadInt64(&mlConsecutiveFailures),
								"circuit_open": copen,
								"circuit_opened_at": copened,
								"last_error": mlLastError,
								"last_checked": mlLastChecked,
							}
						}(),
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

// fetchMLInference calls a local HTTP inference service and wraps the
// response into a small SSE-friendly JSON object. Returns marshaled JSON
// bytes or nil on error.
func fetchMLInference(symbol string) []byte {
	startTime := time.Now()
	inferenceURL := strings.TrimSpace(os.Getenv("ML_INFERENCE_URL"))
	if inferenceURL == "" {
		inferenceURL = "http://127.0.0.1:5000/infer"
	}

	timeoutSeconds := 3
	if raw := strings.TrimSpace(os.Getenv("ML_INFERENCE_TIMEOUT_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 {
			timeoutSeconds = parsed
		}
	}
	retries := 2
	if raw := strings.TrimSpace(os.Getenv("ML_INFERENCE_RETRIES")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			retries = parsed
		}
	}
	backoffMs := 200
	if raw := strings.TrimSpace(os.Getenv("ML_INFERENCE_BACKOFF_MS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 50 {
			backoffMs = parsed
		}
	}

	// build URL with symbol param
	url := inferenceURL
	if strings.Contains(url, "?") {
		url = url + "&symbol=" + symbol
	} else {
		url = url + "?symbol=" + symbol
	}


	// circuit-breaker configuration
	failureThreshold := 5
	if raw := strings.TrimSpace(os.Getenv("ML_CIRCUIT_FAILURE_THRESHOLD")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 {
			failureThreshold = parsed
		}
	}
	cooldownSeconds := 60
	if raw := strings.TrimSpace(os.Getenv("ML_CIRCUIT_COOLDOWN_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 {
			cooldownSeconds = parsed
		}
	}

	// debug: force failure mode check
	mlForceFailMutex.Lock()
	force := mlForceFail
	mlForceFailMutex.Unlock()
	if force {
		// simulate a failure without calling the inference server
		atomic.AddInt64(&mlFetchFailures, 1)
		log.Printf("ERROR: ML inference forced failure for %s", symbol)
		consec := atomic.AddInt64(&mlConsecutiveFailures, 1)
		mlMutex.Lock()
		mlLastError = "forced failure (debug)"
		mlLastChecked = time.Now().UTC()
		mlMutex.Unlock()
		if int(consec) >= failureThreshold {
			mlCircuitMutex.Lock()
			if !mlCircuitOpen {
				mlCircuitOpen = true
				mlCircuitOpenedAt = time.Now().UTC()
				log.Printf("WARN: ML circuit opened due to %d consecutive failures", consec)
				// send Telegram alert (non-blocking)
				go func(c int64, sym string) {
					client := &http.Client{Timeout: telegramAlertTimeout}
					target := strings.TrimSpace(os.Getenv("TELEGRAM_HEARTBEAT_URL"))
					if target == "" {
						target = telegramAlertAPIURL
					}
					_ = sendTelegramSystemAlert(client, target, "ML_CIRCUIT_OPEN", fmt.Sprintf("ML circuit opened for %s after %d consecutive failures", sym, c), 0)
				}(consec, symbol)
			}
			mlCircuitMutex.Unlock()
		}
		// record latency & return nil (no inference payload)
		recordMLLatency(startTime)
		return nil
	}

	// if circuit is open, check cooldown
	mlCircuitMutex.Lock()
	circuitOpen := mlCircuitOpen
	openedAt := mlCircuitOpenedAt
	mlCircuitMutex.Unlock()
	if circuitOpen {
		if time.Since(openedAt) < time.Duration(cooldownSeconds)*time.Second {
			log.Printf("WARN: ML circuit open for %s, skipping inference (opened_at=%s)", symbol, openedAt.UTC().Format(time.RFC3339))
			return nil
		}
		// cooldown expired: close circuit and reset consecutive failures
		mlCircuitMutex.Lock()
		mlCircuitOpen = false
		mlCircuitOpenedAt = time.Time{}
		mlCircuitMutex.Unlock()
		atomic.StoreInt64(&mlConsecutiveFailures, 0)
		log.Printf("INFO: ML circuit cooldown expired, resuming inference for %s", symbol)
	}

	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		client := &http.Client{Timeout: time.Duration(timeoutSeconds) * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			lastErr = err
			log.Printf("WARN: ML inference request attempt %d failed: %v", attempt+1, err)
		} else {
			defer resp.Body.Close()
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				body, _ := io.ReadAll(resp.Body)
				lastErr = fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
				log.Printf("WARN: ML inference returned attempt %d status %d: %s", attempt+1, resp.StatusCode, string(body))
			} else {
				body, err := io.ReadAll(resp.Body)
				if err != nil {
					lastErr = err
					log.Printf("WARN: ML inference read failed attempt %d: %v", attempt+1, err)
				} else {
					wrapped := map[string]interface{}{
						"type":   "ml_inference",
						"symbol": symbol,
					}
					var inf interface{}
					if err := json.Unmarshal(body, &inf); err == nil {
						wrapped["inference"] = inf
					} else {
						wrapped["inference_raw"] = string(body)
					}
					if out, err := json.Marshal(wrapped); err == nil {
						// record success
						atomic.AddInt64(&mlFetchSuccesses, 1)
						log.Printf("INFO: ML inference success for %s", symbol)
						mlMutex.Lock()
						mlLastError = ""
						mlLastChecked = time.Now().UTC()
						mlMutex.Unlock()
						// notify if circuit was open and now recovered
						go func(sym string) {
							client := &http.Client{Timeout: telegramAlertTimeout}
							target := strings.TrimSpace(os.Getenv("TELEGRAM_HEARTBEAT_URL"))
							if target == "" {
								target = telegramAlertAPIURL
							}
							_ = sendTelegramSystemAlert(client, target, "ML_CIRCUIT_RECOVERED", fmt.Sprintf("ML circuit recovered for %s (successful inference)", sym), 0)
						}(symbol)
						// reset consecutive failures and close circuit if open
						atomic.StoreInt64(&mlConsecutiveFailures, 0)
						mlCircuitMutex.Lock()
						mlCircuitOpen = false
						mlCircuitOpenedAt = time.Time{}
						mlCircuitMutex.Unlock()
						// record latency for this successful call
						recordMLLatency(startTime)
						return out
					}
					lastErr = fmt.Errorf("marshal wrapped inference failed: %v", err)
				}
			}
		}

		// if not last attempt, sleep exponential backoff
		if attempt < retries {
			sleepMs := backoffMs * (1 << attempt)
			time.Sleep(time.Duration(sleepMs) * time.Millisecond)
		}
	}

	// record last error in cache (best-effort)
	if lastErr != nil {
		cacheSet("ml_last_error", map[string]interface{}{"error": lastErr.Error(), "symbol": symbol, "checked_at": time.Now().UTC()}, 5*time.Minute)
		atomic.AddInt64(&mlFetchFailures, 1)
		log.Printf("ERROR: ML inference failed for %s: %v", symbol, lastErr)
		// increment consecutive failures and possibly open circuit
		consec := atomic.AddInt64(&mlConsecutiveFailures, 1)
		mlMutex.Lock()
		mlLastError = lastErr.Error()
		mlLastChecked = time.Now().UTC()
		mlMutex.Unlock()

		// check threshold and open circuit if needed
		if int(consec) >= failureThreshold {
			mlCircuitMutex.Lock()
			if !mlCircuitOpen {
				mlCircuitOpen = true
				mlCircuitOpenedAt = time.Now().UTC()
				log.Printf("WARN: ML circuit opened due to %d consecutive failures", consec)
			}
			mlCircuitMutex.Unlock()
		}
			// also record latency for the failed call
			recordMLLatency(startTime)
	}
	return nil
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

// recordMLLatency records overall duration since start into atomic histogram counters
func recordMLLatency(start time.Time) {
	d := time.Since(start).Seconds()
	ms := time.Since(start).Milliseconds()
	atomic.AddInt64(&mlLatencyCount, 1)
	atomic.AddInt64(&mlLatencySumMs, ms)
	// find bucket
	for i, th := range mlLatencyBucketThresholds {
		if d <= th {
			atomic.AddInt64(&mlLatencyBucketCounts[i], 1)
			return
		}
	}
	// overflow bucket (slower than last threshold)
	if len(mlLatencyBucketCounts) > 0 {
		atomic.AddInt64(&mlLatencyBucketCounts[len(mlLatencyBucketCounts)-1], 1)
	}
}

// escapeLabelValue makes a string safe for Prometheus label value quoting
func escapeLabelValue(s string) string {
	// escape backslashes and double quotes and newlines
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\r")
	return s
}
