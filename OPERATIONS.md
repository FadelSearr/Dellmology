# Dellmology Pro - Operations Runbook

Quick reference guide for common operational tasks and troubleshooting.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Common Tasks](#common-tasks)
3. [Troubleshooting Guide](#troubleshooting-guide)
4. [Emergency Procedures](#emergency-procedures)
5. [Maintenance Schedule](#maintenance-schedule)

---

## Quick Start

### First Time Setup

```bash
# 1. Clone and navigate
git clone <repo>
cd IDX_Analyst

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start services
docker-compose up -d

# 4. Verify setup
python diagnostic.py

# 5. Access dashboard
open http://localhost:3000
```

### Stop Services

```bash
# Stop all
docker-compose down

# Stop specific service
docker-compose stop ml-engine
docker-compose down db  # WARNING: Removes database
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ml-engine
docker-compose logs -f db

# Last N lines
docker-compose logs --tail 100 ml-engine

# Search logs
docker-compose logs | grep "ERROR"
```

---

## Common Tasks

### Restart a Service

```bash
# Option 1: Restart specific service
docker-compose restart ml-engine

# Option 2: Full restart
docker-compose down
docker-compose up -d

# Option 3: Rebuild and restart (after code changes)
docker-compose up -d --build ml-engine
```

### Check Service Status

```bash
# All services
docker ps
docker-compose ps

# Service health
curl http://localhost:8003/health
curl http://localhost:8080/health
curl http://localhost:3000/api/health
```

### Update Code

```bash
# Pull latest
git pull origin main

# Rebuild affected services
docker-compose up -d --build

# Restart without rebuild (minor changes)
docker-compose restart ml-engine
```

### Monitor Resource Usage

```bash
# Real-time stats
docker stats

# Specific service
docker stats dellmology_ml-engine

# Memory pressure
free -h
df -h

# Database size
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT pg_database.datname, pg_size_pretty(pg_database_size(datname)) 
  FROM pg_database;"
```

### Clean Up Space

```bash
# Remove unused images
docker image prune

# Remove unused volumes
docker volume prune

# Full cleanup (CAUTION)
docker system prune -a

# Delete old database backups
rm -f dellmology_*.sql.gz.[0-9]*
```

### Database Operations

```bash
# Access PostgreSQL CLI
docker exec -it dellmology_db psql -U admin -d dellmology

# Backup database
docker exec dellmology_db pg_dump -U admin dellmology | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
gunzip < backup_20250115.sql.gz | docker exec -i dellmology_db psql -U admin -d dellmology

# Check database size
docker exec dellmology_db du -sh /var/lib/postgresql/data

# List tables
docker exec dellmology_db psql -U admin -d dellmology -c "\dt"

# Count records in trades table
docker exec dellmology_db psql -U admin -d dellmology -c "SELECT COUNT(*) FROM trades;"
```

### Cache Operations

```bash
# Access Redis
docker exec -it dellmology_redis redis-cli

# Check memory usage
MEMORY STATS

# Clear all cache
FLUSHALL

# Check specific key
GET "screen:DAYTRADE:0.6"

# Monitor cache activity
MONITOR
```

---

## Troubleshooting Guide

### Issue: Services Won't Start

```bash
# 1. Check Docker daemon
docker ps

# 2. Check for port conflicts
netstat -an | grep LISTEN
# If ports 3000, 5433, 6379, 8001, 8080, 8002, 8003 are in use:
# - Change ports in docker-compose.yml
# - Or kill conflicting processes

# 3. Check dependencies
docker-compose ps

# 4. View startup logs
docker-compose logs --tail 50

# 5. Force rebuild
docker-compose down -v  # CAUTION: Removes data
docker-compose up -d --build
```

### Issue: Database Connection Refused

```bash
# 1. Verify database is running
docker-compose ps db

# 2. Check if it's healthy
docker-compose ps  # Look for "(healthy)" status

# 3. Wait for startup
docker-compose logs db | tail -20

# 4. Test connection
docker exec dellmology_db pg_isready -U admin

# 5. Force recreate
docker-compose down db
docker-compose up -d db
docker-compose logs -f db
```

### Issue: ML Engine Returning 503

```bash
# 1. Check if service is running
curl http://localhost:8003/health
docker-compose ps ml-engine

# 2. Check logs for errors
docker-compose logs ml-engine | tail -50

# 3. Check database connectivity
curl -X GET http://localhost:8003/health | jq '.database'

# 4. Check resource limits
docker stats dellmology_ml-engine

# 5. Restart service
docker-compose restart ml-engine
docker-compose logs -f ml-engine
```

### Issue: High Memory Usage

```bash
# 1. Check which service is using memory
docker stats --no-stream | sort -k 4 -h -r

# 2. Check database bloat
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
  FROM pg_tables ORDER BY pg_total_relation_size DESC LIMIT 10;"

# 3. Compress old data
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT compress_chunk(chunk) FROM show_chunks('trades')
  WHERE range_start < NOW() - INTERVAL '7 days';"

# 4. Increase memory limit
# Edit docker-compose.yml: services.ml-engine.environment.MEMORY_LIMIT
# Or modify container limits:
docker update --memory=4g dellmology_ml-engine

# 5. Clear Redis cache if consuming memory
docker exec dellmology_redis redis-cli FLUSHALL
```

### Issue: Slow Screener Queries

```bash
# 1. Check query performance
docker exec dellmology_db psql -U admin -d dellmology -c "
  EXPLAIN ANALYZE SELECT * FROM trades WHERE symbol='BBCA' LIMIT 100;"

# 2. Check missing indexes
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT schemaname, tablename, indexname FROM pg_indexes 
  WHERE schemaname = 'public';"

# 3. Add index if missing
docker exec dellmology_db psql -U admin -d dellmology -c "
  CREATE INDEX idx_trades_symbol_time ON trades(symbol, timestamp DESC);"

# 4. Analyze table statistics
docker exec dellmology_db psql -U admin -d dellmology -c "ANALYZE trades;"

# 5. Enable query cache
# Edit screener_api.py: increase CACHE_TTL
```

### Issue: Frontend Not Loading

```bash
# 1. Check if Node.js service is running
docker-compose ps web
curl http://localhost:3000

# 2. Check for build errors
docker-compose logs web

# 3. Clear node modules and rebuild
docker exec dellmology_web rm -rf node_modules
docker-compose restart web

# 4. Check port availability
netstat -an | grep 3000

# 5. Try manual build
docker-compose down web
docker-compose up -d --build web
```

### Issue: Data Not Syncing from Stockbit

```bash
# 1. Verify Stockbit token is fresh
echo $STOCKBIT_TOKEN

# 2. Check streamer connection
curl http://localhost:8080/health

# 3. View streamer logs
docker-compose logs streamer

# 4. Verify WebSocket connection
docker exec dellmology_streamer curl -i https://stream.stockbit.com/stream

# 5. Restart streamer
docker-compose restart streamer
```

### Issue: Telegram Alerts Not Working

```bash
# 1. Verify bot token is valid
TELEGRAM_BOT_TOKEN=<your-token>
curl -i https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe

# 2. Verify chat ID exists
curl -i https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}

# 3. Test sending message
curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage \
  -d chat_id=${TELEGRAM_CHAT_ID} \
  -d text="Test message"

# 4. Check ML engine logs
docker-compose logs ml-engine | grep -i telegram

# 5. Verify database has telegram entity
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT * FROM telegram_config LIMIT 1;"
```

---

## Emergency Procedures

### Full System Reset

```bash
# WARNING: This will delete ALL data
docker-compose down -v
rm -f .env  # Backup .env first!
cp .env.example .env
# Edit .env with credentials
docker-compose up -d

# Verify reset
python diagnostic.py
```

### Restore from Backup

```bash
# 1. Stop services
docker-compose down

# 2. Restore database
gunzip < backup_20250115.sql.gz | \
  docker exec -i dellmology_db psql -U admin -d dellmology

# 3. Restart services
docker-compose up -d

# 4. Verify restoration
python diagnostic.py
```

### Emergency Failover

```bash
# 1. Detect primary failure
curl http://primary-server:8080/health || echo "FAILED"

# 2. Promote hot standby
ssh secondary-server
docker-compose up -d

# 3. Update DNS/LB
# Point traffic to secondary server

# 4. Verify replication caught up
docker exec timescaledb psql -U admin -d dellmology -c "
  SELECT pg_last_wal_receive_lsn();"

# 5. Monitor sync
docker-compose logs -f db
```

### Kill Hung Processes

```bash
# Find memory hogs
docker top dellmology_ml-engine | sort -nk 4 -r

# Kill specific process by PID
docker exec dellmology_ml-engine kill -9 <PID>

# Force restart container
docker-compose restart ml-engine -t 5  # 5 second grace period

# Check system resources
free -h
ps aux | grep python | grep -v grep
```

---

## Maintenance Schedule

### Daily (Automated)

```bash
# Via cron job (runs automatically)
# 0 02 * * * /opt/dellmology/daily_maintenance.sh

# Manual check
- Check system status: `docker-compose ps`
- Review error logs: `docker-compose logs | grep ERROR`
- Monitor disk space: `df -h`
```

### Weekly

```bash
# Every Sunday 02:00
# 0 2 * * 0 /opt/dellmology/weekly_maintenance.sh

# Manual tasks
1. Database backup
   docker exec dellmology_db pg_dump -U admin dellmology | gzip > backup_$(date +%Y%m%d).sql.gz

2. Delete old logs (>30 days)
   docker exec dellmology_db psql -U admin -d dellmology -c "
     DELETE FROM trade_logs WHERE timestamp < NOW() - INTERVAL '30 days';"

3. Analyze table statistics
   docker exec dellmology_db psql -U admin -d dellmology -c "ANALYZE;"

4. Review performance metrics
   docker stats --no-stream
```

### Monthly

```bash
# 1. Compress old data (>30 days)
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT compress_chunk(chunk) FROM show_chunks('trades')
  WHERE range_start < NOW() - INTERVAL '30 days';"

# 2. Update dependencies
docker pull timescale/timescaledb:latest-pg15
docker pull redis:7-alpine
docker-compose up -d --build

# 3. Review and rotate logs
# Kubernetes: Check PVC usage
# Docker: Prune unused images

# 4. Security audit
# - Review .env file permissions
# - Check API keys/tokens
# - Review user access logs
```

### Quarterly

```bash
# 1. Full backup
tar -czf dellmology_backup_full_$(date +%Y%m%d).tar.gz \
  -C / var/lib/postgresql/data \
  database_code \
  configuration_files

# 2. Disaster recovery test
# Test restore from backup to new environment

# 3. Performance optimization
# Review slow queries
# Add missing indexes
# Tune database parameters

# 4. Capacity planning
# Review growth trends
# Plan for scaling
```

---

## Support & Escalation

### Before Escalating

1. Run diagnostic: `python diagnostic.py`
2. Check logs: `docker-compose logs | grep ERROR`
3. Check resources: `docker stats`
4. Search troubleshooting guide above

### When to Escalate

- Persistent service failures (>15 minutes)
- Data loss or corruption detected
- Security incident (unauthorized access)
- System under attack (high error rates)

### Report Template

```markdown
**Issue**: Brief description
**Severity**: Critical/High/Medium/Low
**Impact**: How many users affected, business impact
**Reproducibility**: Always/Sometimes/Unreproducible
**Environment**: Production/Staging/Development
**Timestamp**: YYYY-MM-DD HH:MM:SS UTC
**Error Logs**: (attach relevant logs)
**Diagnostic Output**: (output of diagnostic.py)
**Steps to Reproduce**: (numbered list)
**Expected Behavior**: 
**Actual Behavior**: 
```

---

## Quick Reference Commands

```bash
# Service Management
docker-compose up -d                          # Start all services
docker-compose down                          # Stop all services
docker-compose restart <service>             # Restart service
docker-compose logs -f <service>             # View logs

# Database
docker exec dellmology_db psql -U admin -d dellmology <sql>
docker exec dellmology_db pg_dump -U admin dellmology | gzip > backup.sql.gz

# Redis
docker exec dellmology_redis redis-cli <command>
docker exec dellmology_redis redis-cli FLUSHALL  # Clear cache

# Health Check
curl http://localhost:8003/health             # Screener
curl http://localhost:8002/health             # CNN
curl http://localhost:8080/health             # Streamer
curl http://localhost:3000/api/health         # Frontend

# Diagnostics
python diagnostic.py                          # Full system check
docker stats --no-stream                      # Resource usage
docker-compose ps                             # Service status
```

---

Cost: ~5-30 minutes per week for routine maintenance when automated
Complexity: Medium (mostly docker commands)
Requires: Basic Linux commands, Docker knowledge, database understanding
