@echo off
echo ==================================================
echo DELLMOLOGY PRO - STARTUP SCRIPT
echo ==================================================
echo.

echo [1/2] Starting AI Machine Learning Server (Port 8000)...
cd engine
start "Dellmology ML Server" cmd /c "C:\Users\fadel\AppData\Local\Programs\Python\Python311\python.exe ml_server.py || echo Failed to start ML server. Press any key... && pause"
cd ..

echo [2/2] Starting Next.js Web Dashboard (Port 3000)...
start "Dellmology Web Dashboard" cmd /c "npm run dev || echo Failed to start Web Dashboard. Press any key... && pause"

echo.
echo All services are starting up!
echo - Web Dashboard will be available at http://localhost:3000
echo - ML Server is running in the background.
echo.
echo You can now close this window, the servers are running in their own windows.
pause
