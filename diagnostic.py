#!/usr/bin/env python3
"""
Dellmology Pro System Diagnostic Script
Performs comprehensive health checks on all system components
"""

import subprocess
import sys
import os
import time
import requests
import json
from datetime import datetime
from typing import Dict, List, Tuple
import platform

class Diagnostic:
    """System diagnostic runner"""
    
    def __init__(self):
        self.results = {}
        self.start_time = datetime.now()
    
    def print_header(self, text: str):
        """Print formatted header"""
        print(f"\n{'='*60}")
        print(f"  {text}")
        print(f"{'='*60}\n")
    
    def print_check(self, name: str, status: str, details: str = ""):
        """Print check result"""
        symbol = "✓" if status == "OK" else "✗" if status == "FAIL" else "⚠"
        color = "\033[92m" if status == "OK" else "\033[91m" if status == "FAIL" else "\033[93m"
        reset = "\033[0m"
        
        print(f"  {color}{symbol}{reset} {name:40} {color}{status:10}{reset} {details}")
    
    def check_prerequisites(self) -> bool:
        """Check system prerequisites"""
        self.print_header("System Prerequisites")
        
        all_ok = True
        
        # Python version
        py_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        if sys.version_info >= (3, 8):
            self.print_check("Python Version", "OK", f"(v{py_version})")
        else:
            self.print_check("Python Version", "FAIL", f"(v{py_version}, requires 3.8+)")
            all_ok = False
        
        # OS
        os_name = platform.system()
        self.print_check("Operating System", "OK", f"({os_name})")
        
        # Node.js (for frontend)
        try:
            node_output = subprocess.check_output(["node", "--version"], text=True).strip()
            self.print_check("Node.js", "OK", f"({node_output})")
        except:
            self.print_check("Node.js", "WARN", "(npm operations may fail)")
        
        # Docker
        try:
            subprocess.check_output(["docker", "--version"], stderr=subprocess.DEVNULL)
            self.print_check("Docker", "OK", "")
        except:
            self.print_check("Docker", "WARN", "(docker-compose may not work)")
        
        return all_ok
    
    def check_database(self) -> bool:
        """Check PostgreSQL/TimescaleDB connectivity"""
        self.print_header("Database Connectivity")
        
        all_ok = True
        
        try:
            import psycopg2
            
            # Try to connect
            try:
                conn = psycopg2.connect(
                    host="localhost",
                    port=5433,
                    user="admin",
                    password="password",
                    database="dellmology"
                )
                
                cursor = conn.cursor()
                
                # Check database
                self.print_check("Database Connection", "OK", "dellmology@localhost:5433")
                
                # Check TimescaleDB
                try:
                    cursor.execute("SELECT * FROM timescaledb_information.hypertables LIMIT 1")
                    hypertables = cursor.fetchone()
                    self.print_check("TimescaleDB Extension", "OK", "(hypertables exist)")
                except:
                    self.print_check("TimescaleDB Extension", "WARN", "(extension may not be installed)")
                
                # Check tables
                cursor.execute("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public' ORDER BY table_name
                """)
                tables = [row[0] for row in cursor.fetchall()]
                
                expected_tables = [
                    'trades', 'order_book_snapshots', 'broker_flows',
                    'model_metrics', 'model_alert_thresholds'
                ]
                
                found = sum(1 for t in expected_tables if t in tables)
                self.print_check("Database Tables", "OK" if found == len(expected_tables) else "WARN",
                                f"({found}/{len(expected_tables)} expected tables found)")
                
                # Check data
                cursor.execute("SELECT COUNT(*) FROM trades")
                trade_count = cursor.fetchone()[0]
                self.print_check("Trade Records", "OK" if trade_count > 0 else "WARN",
                                f"({trade_count} records)")
                
                conn.close()
                self.results['database'] = 'OK'
                
            except psycopg2.Error as e:
                self.print_check("Database Connection", "FAIL", str(e)[:50])
                all_ok = False
                self.results['database'] = 'FAIL'
        
        except ImportError:
            self.print_check("psycopg2", "WARN", "(install: pip install psycopg2-binary)")
            all_ok = False
        
        return all_ok
    
    def check_redis(self) -> bool:
        """Check Redis connectivity"""
        self.print_header("Redis Cache")
        
        all_ok = True
        
        try:
            import redis
            
            try:
                client = redis.Redis(host='localhost', port=6379, db=0, socket_connect_timeout=2)
                client.ping()
                
                info = client.info()
                self.print_check("Redis Connection", "OK", "localhost:6379")
                self.print_check("Redis Memory", "OK", f"({info['used_memory_human']} used)")
                self.results['redis'] = 'OK'
                
            except redis.ConnectionError:
                self.print_check("Redis Connection", "FAIL", "localhost:6379 unreachable")
                all_ok = False
                self.results['redis'] = 'FAIL'
        
        except ImportError:
            self.print_check("redis-py", "WARN", "(install: pip install redis)")
            all_ok = False
        
        return all_ok
    
    def check_services(self) -> bool:
        """Check running services"""
        self.print_header("Service Connectivity")
        
        all_ok = True
        
        services = [
            ("ML Engine (Screener)", "http://localhost:8003/health", 3),
            ("ML Engine (CNN)", "http://localhost:8002/health", 3),
            ("ML Engine (Training)", "http://localhost:8001/health", 3),
            ("Go Streamer", "http://localhost:8080/health", 3),
            ("Frontend", "http://localhost:3000/", 3),
        ]
        
        for name, url, timeout in services:
            try:
                response = requests.get(url, timeout=timeout)
                
                if response.status_code == 200:
                    self.print_check(name, "OK", f"({response.status_code})")
                    self.results[name] = 'OK'
                else:
                    self.print_check(name, "WARN", f"(HTTP {response.status_code})")
                    self.results[name] = 'WARN'
                    
            except requests.exceptions.Timeout:
                self.print_check(name, "FAIL", "timeout")
                all_ok = False
                self.results[name] = 'FAIL'
            except requests.exceptions.ConnectionError:
                self.print_check(name, "FAIL", "connection refused")
                all_ok = False
                self.results[name] = 'FAIL'
            except Exception as e:
                self.print_check(name, "FAIL", str(e)[:30])
                all_ok = False
                self.results[name] = 'FAIL'
        
        return all_ok
    
    def check_environment(self) -> bool:
        """Check environment variables"""
        self.print_header("Environment Configuration")
        
        env_vars = [
            ('DATABASE_URL', 'required'),
            ('GEMINI_API_KEY', 'recommended'),
            ('TELEGRAM_BOT_TOKEN', 'optional'),
            ('STOCKBIT_TOKEN', 'recommended'),
            ('ML_ENGINE_URL', 'optional'),
            ('REDIS_HOST', 'optional'),
            ('REDIS_PORT', 'optional'),
        ]
        
        all_ok = True
        
        for var, importance in env_vars:
            value = os.getenv(var)
            
            if value:
                masked = value[:10] + "*" * (len(value) - 10) if len(value) > 10 else value
                self.print_check(var, "SET", masked)
            else:
                status = "WARN" if importance == "optional" else "FAIL" if importance == "required" else "WARN"
                self.print_check(var, status, f"({importance})")
                if importance == "required":
                    all_ok = False
        
        return all_ok
    
    def check_api_contracts(self) -> bool:
        """Test API endpoints"""
        self.print_header("API Contract Verification")
        
        all_ok = True
        
        # Test screener API
        try:
            response = requests.post(
                "http://localhost:8003/api/screen",
                json={"mode": "DAYTRADE", "min_score": 0.6},
                timeout=5
            )
            
            if response.status_code == 200:
                data = response.json()
                if all(k in data for k in ['mode', 'results', 'statistics', 'timestamp']):
                    self.print_check("Screener API", "OK", "contract verified")
                    self.results['screener_api'] = 'OK'
                else:
                    self.print_check("Screener API", "WARN", "response missing fields")
                    all_ok = False
            else:
                self.print_check("Screener API", "FAIL", f"HTTP {response.status_code}")
                all_ok = False
        
        except Exception as e:
            self.print_check("Screener API", "FAIL", str(e)[:40])
            all_ok = False
        
        # Test backtest API
        try:
            response = requests.post(
                "http://localhost:8003/api/backtest",
                json={
                    "symbol": "BBCA",
                    "start_date": "2025-01-01",
                    "end_date": "2025-02-01"
                },
                timeout=5
            )
            
            if response.status_code == 200:
                self.print_check("Backtest API", "OK", "endpoint responsive")
                self.results['backtest_api'] = 'OK'
            else:
                self.print_check("Backtest API", "WARN", f"HTTP {response.status_code}")
        
        except Exception as e:
            self.print_check("Backtest API", "WARN", str(e)[:40])
        
        return all_ok
    
    def print_summary(self):
        """Print diagnostic summary"""
        self.print_header("Diagnostic Summary")
        
        ok_count = sum(1 for v in self.results.values() if v == 'OK')
        total = len(self.results)
        
        print(f"  Components checked: {total}")
        print(f"  Healthy: {ok_count}")
        print(f"  Issues: {total - ok_count}\n")
        
        elapsed = (datetime.now() - self.start_time).total_seconds()
        print(f"  Diagnostic duration: {elapsed:.2f}s")
        print()
        
        # Recommendations
        if total - ok_count > 0:
            print("  🔧 Recommendations:")
            
            if self.results.get('database') == 'FAIL':
                print("     • Ensure PostgreSQL is running: docker-compose up -d db")
            
            if self.results.get('redis') == 'FAIL':
                print("     • Ensure Redis is running: docker-compose up -d redis")
            
            if self.results.get('ML Engine (Screener)') == 'FAIL':
                print("     • Start ML engine: cd apps/ml-engine && python screener_api.py")
            
            if self.results.get('Frontend') == 'FAIL':
                print("     • Start frontend: cd apps/web && npm run dev")
            
            print()


def main():
    """Run full diagnostic"""
    diag = Diagnostic()
    
    print("\n")
    print("╔" + "─" * 58 + "╗")
    print("║" + " " * 15 + "DELLMOLOGY PRO SYSTEM DIAGNOSTIC" + " " * 11 + "║")
    print("╚" + "─" * 58 + "╝")
    
    diag.check_prerequisites()
    diag.check_database()
    diag.check_redis()
    diag.check_environment()
    diag.check_services()
    diag.check_api_contracts()
    diag.print_summary()


if __name__ == "__main__":
    main()
