const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for dev
    methods: ["GET", "POST"]
  }
});

console.log("WebSocket server initializing...");

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Periodic real market scan for whale alerts every 60 seconds
setInterval(async () => {
  try {
    const res = await fetch("http://localhost:3000/api/screener?mode=daytrade");
    if (!res.ok) throw new Error("Screener offline");
    
    const json = await res.json();
    const results = json.data?.results || [];

    // Find any real stock with high volume expansion (> 2x)
    const highVolumeStocks = results.filter(s => s.volumeRatio > 2);

    if (highVolumeStocks.length > 0) {
      // Pick the strongest anomaly
      const topAnomaly = highVolumeStocks.sort((a, b) => b.volumeRatio - a.volumeRatio)[0];
      const whaleEvent = {
        type: 'WHALE_ALERT',
        timestamp: Date.now(),
        emiten: topAnomaly.emiten,
        volumeRatio: topAnomaly.volumeRatio,
        price: topAnomaly.price,
        changePercent: topAnomaly.changePercent
      };

      console.log(`[WS] Pushing REAL whale alert: ${topAnomaly.emiten} (Ratio: ${topAnomaly.volumeRatio}x)`);
      io.emit("oracle_update", whaleEvent);
    } else if (results.length > 0) {
      // Fallback: Pick top active gainer
      const topGainer = results.sort((a, b) => b.changePercent - a.changePercent)[0];
      const gainerEvent = {
        type: 'WHALE_ALERT',
        timestamp: Date.now(),
        emiten: topGainer.emiten,
        volumeRatio: topGainer.volumeRatio || 1.5,
        price: topGainer.price,
        changePercent: topGainer.changePercent
      };
      
      console.log(`[WS] Pushing active mover alert: ${topGainer.emiten} (+${topGainer.changePercent}%)`);
      io.emit("oracle_update", gainerEvent);
    }
  } catch (err) {
    console.warn("[WS Server] Error scanning real market data for alerts:", err.message);
  }
}, 30000); // Check every 30 seconds for live changes

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});

