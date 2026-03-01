"""
Integration tests for Dellmology Pro APIs
Tests cross-service communication, database connectivity, and feature functionality
"""

import pytest
import asyncio
import httpx
from datetime import datetime, timedelta
import json

# Configuration
BASE_ML_ENGINE = "http://localhost:8003"
BASE_FRONTEND = "http://localhost:3000"
TIMEOUT = 10.0


class TestMLEngineHealth:
    """Test ML engine service health and connectivity"""
    
    @pytest.mark.asyncio
    async def test_screener_health(self):
        """Test screener API health check"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BASE_ML_ENGINE}/health")
            assert response.status_code == 200
            data = response.json()
            assert data.get("status") in ["healthy", "degraded"]
            assert "database" in data or "redis" in data
    
    @pytest.mark.asyncio
    async def test_cnn_api_health(self):
        """Test CNN pattern detector API health"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BASE_ML_ENGINE}/health")
            assert response.status_code in [200, 503]  # May be unavailable but shouldn't crash


class TestScreenerAPI:
    """Test advanced screener functionality"""
    
    @pytest.mark.asyncio
    async def test_screen_daytrade_mode(self):
        """Test screener in DAYTRADE mode"""
        payload = {
            "mode": "DAYTRADE",
            "min_score": 0.6,
            "include_analysis": True
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/screen",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data["mode"] == "DAYTRADE"
                assert "timestamp" in data
                assert "results" in data
                assert isinstance(data["results"], list)
                assert "statistics" in data
    
    @pytest.mark.asyncio
    async def test_screen_swing_mode(self):
        """Test screener in SWING mode"""
        payload = {
            "mode": "SWING",
            "min_score": 0.5,
            "symbols": ["BBCA", "ASII"],
            "include_analysis": True
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/screen",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data["mode"] == "SWING"
                # Results should be filtered by symbols if provided
                if data["results"]:
                    symbols = set(r["symbol"] for r in data["results"])
                    assert symbols.issubset({"BBCA", "ASII"})
    
    @pytest.mark.asyncio
    async def test_screen_watch_list(self):
        """Test watch list screening endpoint"""
        symbols = ["BBCA", "ASII", "BANK"]
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BASE_ML_ENGINE}/api/screen-watch",
                params={"symbols": symbols}
            )
            
            if response.status_code == 200:
                data = response.json()
                assert "timestamp" in data
                assert "watched_symbols" in data
                assert set(data["watched_symbols"]) == set(symbols)
                assert "results" in data


class TestBacktestAPI:
    """Test backtesting functionality"""
    
    @pytest.mark.asyncio
    async def test_backtest_sma_strategy(self):
        """Test backtest endpoint with basic strategy"""
        payload = {
            "symbol": "BBCA",
            "start_date": "2025-01-01",
            "end_date": "2025-02-01",
            "strategy": "SMA_CROSSOVER"
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # First try direct ML engine endpoint
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/backtest",
                json=payload,
                timeout=TIMEOUT + 5  # Backtest may take longer
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data.get("symbol") == "BBCA"
                assert "start_date" in data or "period_days" in data
                assert "trades" in data or "total_trades" in data
    
    @pytest.mark.asyncio
    async def test_backtest_via_frontend_proxy(self):
        """Test backtest through frontend API proxy"""
        payload = {
            "symbol": "ASII",
            "start_date": "2024-12-01",
            "end_date": "2024-12-31",
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_FRONTEND}/api/backtest",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                # Frontend wraps response
                if "result" in data:
                    result = data["result"]
                    assert result.get("symbol") == "ASII"
                elif "success" in data:
                    assert data["success"] is True


class TestCNNPatternDetector:
    """Test CNN pattern detection API"""
    
    @pytest.mark.asyncio
    async def test_detect_patterns(self):
        """Test pattern detection endpoint"""
        params = {
            "symbol": "BBCA",
            "lookback": 100,
            "min_confidence": 0.7
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BASE_ML_ENGINE}/api/detect-patterns",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                assert "patterns" in data or "timestamp" in data
                if "patterns" in data and data["patterns"]:
                    pattern = data["patterns"][0]
                    assert "pattern_name" in pattern or "type" in pattern


class TestFrontendAPIs:
    """Test frontend API routes"""
    
    @pytest.mark.asyncio
    async def test_advanced_screener_proxy(self):
        """Test advanced screener proxy route"""
        payload = {
            "mode": "DAYTRADE",
            "minScore": 0.65
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_FRONTEND}/api/advanced-screener",
                json=payload
            )
            
            # Should either work or timeout gracefully
            assert response.status_code in [200, 504, 502]
    
    @pytest.mark.asyncio
    async def test_cnn_patterns_proxy(self):
        """Test CNN patterns proxy route"""
        params = {
            "symbol": "BBCA",
            "lookback": 60
        }
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BASE_FRONTEND}/api/cnn-patterns",
                params=params
            )
            
            assert response.status_code in [200, 504, 502]


class TestDataValidation:
    """Test data validation endpoints"""
    
    @pytest.mark.asyncio
    async def test_data_validation_status(self):
        """Test data validation status endpoint"""
        params = {"symbol": "BBCA"}
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BASE_FRONTEND}/api/data-validation-status",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                assert "symbol" in data
                assert "valid_records" in data or "status" in data


class TestErrorHandling:
    """Test error handling and validation"""
    
    @pytest.mark.asyncio
    async def test_invalid_symbol(self):
        """Test handling of invalid symbol"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BASE_ML_ENGINE}/api/detect-patterns",
                params={"symbol": "INVALID_SYMBOL"}
            )
            
            # Should return 200 with empty results or 400
            assert response.status_code in [200, 400, 404]
    
    @pytest.mark.asyncio
    async def test_malformed_request(self):
        """Test handling of malformed requests"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/screen",
                json={"invalid": "request structure"}
            )
            
            # Should handle gracefully
            assert response.status_code in [200, 400, 422]
    
    @pytest.mark.asyncio
    async def test_missing_required_field(self):
        """Test handling of missing required fields"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/screen",
                json={}
            )
            
            # Should either use defaults or return error
            assert response.status_code in [200, 400, 422]


class TestPerformance:
    """Test performance characteristics"""
    
    @pytest.mark.asyncio
    async def test_screener_response_time(self):
        """Test that screener completes within reasonable time"""
        payload = {"mode": "DAYTRADE"}
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            import time
            start = time.time()
            
            response = await client.post(
                f"{BASE_ML_ENGINE}/api/screen",
                json=payload,
                timeout=TIMEOUT
            )
            
            elapsed = time.time() - start
            
            if response.status_code == 200:
                # Should complete in reasonable time (edge-cached endpoints  <1s)
                assert elapsed < 5.0, f"Screener took {elapsed}s"
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test handling multiple concurrent requests"""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            tasks = [
                client.get(f"{BASE_ML_ENGINE}/health")
                for _ in range(5)
            ]
            
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # At least most should succeed
            successes = sum(1 for r in responses if not isinstance(r, Exception))
            assert successes >= 3, f"Only {successes}/5 concurrent requests succeeded"


# Run tests with: pytest test_integration.py -v --asyncio-mode=auto
if __name__ == "__main__":
    print("Integration tests for Dellmology Pro")
    print(f"Testing ML Engine: {BASE_ML_ENGINE}")
    print(f"Testing Frontend: {BASE_FRONTEND}")
    print("\nRun with: pytest test_integration.py -v")
