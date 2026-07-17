#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');

// Helper to spawn a process and prefix its output
function startProcess(name, command, args, cwd, colorCode) {
  const child = spawn(command, args, { cwd, shell: true });
  
  const prefix = `\x1b[${colorCode}m[${name}]\x1b[0m `;
  
  child.stdout.on('data', (data) => {
    process.stdout.write(
      data.toString().split('\n').map(line => line.trim() ? prefix + line : '').join('\n')
    );
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(
      data.toString().split('\n').map(line => line.trim() ? prefix + line : '').join('\n')
    );
  });
  
  child.on('close', (code) => {
    console.log(`${prefix}Process exited with code ${code}`);
  });
  
  return child;
}

console.log('\x1b[36m🚀 Launching Dellmology Pro Services...\x1b[0m\n');

// 0. Ensure Redis is running via Docker
const { execSync } = require('child_process');
try {
  // Try to start existing container first
  execSync('docker start redis 2>nul || docker run -d --name redis -p 6379:6379 redis:alpine', { shell: true, stdio: 'pipe' });
  console.log('\x1b[32m[REDIS] ✅ Redis container started on port 6379\x1b[0m');
} catch (e) {
  console.warn('\x1b[33m[REDIS] ⚠️ Docker not available or Redis failed. Go Engine will run without cache.\x1b[0m');
}

// 1. Python CNN Worker
const pythonDir = path.join(rootDir, 'python_worker');
const venvPython = path.join(pythonDir, 'venv', 'Scripts', 'python.exe');
const pythonExec = fs.existsSync(venvPython) ? venvPython : 'python';
startProcess('PYTHON', pythonExec, ['main.py'], pythonDir, '33'); // Yellow

// 1b. CNN API Worker (FastAPI on port 8001)
const cnnDir = path.join(rootDir, 'cnn-worker');
const cnnVenv = path.join(cnnDir, 'venv', 'Scripts', 'python.exe');
const cnnExec = fs.existsSync(cnnVenv) ? cnnVenv : 'python';
startProcess('FASTAPI', cnnExec, ['main.py'], cnnDir, '33'); // Yellow

// 1c. Unified ML Server (CNN, NLP, LSTM on port 8000)
const mlServerDir = path.join(rootDir, 'engine');
// Using the explicit global python that has vaderSentiment installed
const mlServerPython = 'C:\\Users\\fadel\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
startProcess('ML_SERVER', mlServerPython, ['ml_server.py'], mlServerDir, '35'); // Magenta

// 2. Go Engine
const goDir = path.join(rootDir, 'engine');
startProcess('GO', 'go build -o engine.exe main.go && .\\engine.exe', [], goDir, '35'); // Magenta

// 3. Next.js App
startProcess('NEXTJS', 'npm', ['run', 'dev'], rootDir, '36'); // Cyan

// 4. WebSocket Server
startProcess('WEBSOCKET', 'node', ['server.js'], rootDir, '37'); // White

// 5. Telegram Bot
startProcess('TELEGRAM', 'node', ['telegram_bot.js'], rootDir, '34'); // Blue

// 6. Whale Detective
startProcess('WHALE', 'python', ['engine/whale_detective.py'], rootDir, '32'); // Green

// 7. Market Guardian (needs yfinance - use Python 3.14)
const python314 = 'C:\\Users\\fadel\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
startProcess('MACRO', python314, ['engine/market_guardian.py'], rootDir, '33'); // Yellow

// 8. Memory Agent (needs flask - use Python 3.14)
startProcess('MEMORY', python314, ['engine/memory_agent.py'], rootDir, '36'); // Cyan

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[31m🛑 Shutting down all services...\x1b[0m');
  process.exit(0);
});
