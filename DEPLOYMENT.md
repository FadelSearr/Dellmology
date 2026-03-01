# Dellmology Pro - Deployment & Operations Guide

Complete guide for deploying, scaling, and operating Dellmology Pro in production environments.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Docker & Container Deployment](#docker--container-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Performance Tuning](#performance-tuning)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Scaling Strategies](#scaling-strategies)
7. [Troubleshooting](#troubleshooting)
8. [Security Hardening](#security-hardening)

---

## Pre-Deployment Checklist

### System Requirements

```bash
# Minimum requirements
- CPU: 4 cores (2 GHz+)
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 100 Mbps minimum

# Recommended for production
- CPU: 8+ cores
- RAM: 32 GB
- Storage: 500 GB SSD with separate partitions for:
  - Database (/var/lib/postgresql - 300 GB)
  - Application (/opt/dellmology - 100 GB)
- Network: 1 Gbps
```

### Environment Validation

```bash
# Run diagnostic script
python diagnostic.py

# All checks should show ✓ (OK) or ⚠ (WARN)
# No ✗ (FAIL) should appear before deployment
```

### Dependency Installation

```bash
# Python 3.8+
python --version

# Node.js 18+
node --version

# PostgreSQL client (for migrations)
psql --version

# Docker & Docker Compose
docker --version
docker-compose --version

# Required Python packages
pip install -r apps/ml-engine/requirements.txt

# Node.js packages
cd apps/web
npm install
```

---

## Docker & Container Deployment

### Single-Node Docker Compose (Development/Small Production)

```bash
# Clone and configure
git clone <repo>
cd IDX_Analyst

# Copy and edit environment
cp .env.example .env
nano .env

# Set these for production
POSTGRES_PASSWORD=<strong-password>
ML_ENGINE_KEY=<strong-key>
INTERNAL_API_KEY=<strong-key>
GEMINI_API_KEY=<your-api-key>
STOCKBIT_TOKEN=<your-token>
TELEGRAM_BOT_TOKEN=<your-token>
TELEGRAM_CHAT_ID=<your-chat-id>

# Start all services
docker-compose up -d

# Verify services
docker-compose ps

# Check logs
docker-compose logs -f ml-engine
docker-compose logs -f db
```

**Expected output:**
```
NAME          STATUS      PORTS
timescaledb   Up 2 min    5433->5432/tcp
redis         Up 2 min    6379->6379/tcp
ml-engine     Up 1 min    8001->8001/tcp
```

### Database Initialization

```bash
# Migrations run automatically on container startup
# Verify tables were created
docker exec dellmology_db psql -U admin -d dellmology -c "\dt"

# Check TimescaleDB hypertables
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT table_name FROM timescaledb_information.hypertables;"
```

### Multi-Node Docker Compose (High Availability)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: timescale/timescaledb:latest-pg15
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - '5433:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin"]
      interval: 10s
      retries: 5
    networks:
      - dellmology-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    networks:
      - dellmology-network

  ml-engine-screener:
    build:
      context: ./apps/ml-engine
      target: screener
    restart: always
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_HOST: redis
      PORT: 8003
    ports:
      - '8003:8003'
    depends_on:
      - db
      - redis
    networks:
      - dellmology-network

  ml-engine-cnn:
    build:
      context: ./apps/ml-engine
      target: cnn
    restart: always
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_HOST: redis
      PORT: 8002
    ports:
      - '8002:8002'
    depends_on:
      - db
      - redis
    networks:
      - dellmology-network

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ml-engine-screener
      - ml-engine-cnn
    networks:
      - dellmology-network

volumes:
  postgres_data:
  redis_data:

networks:
  dellmology-network:
    driver: bridge
```

**Deploy:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Kubernetes Deployment

### Prerequisites

```bash
# Install kubectl
kubectl version --client

# Access to Kubernetes cluster (local minikube, cloud provider, etc)
kubectl cluster-info
```

### Create Namespace & ConfigMaps

```bash
# Create namespace
kubectl create namespace dellmology

# Create secrets from .env
kubectl create secret generic dellmology-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=GEMINI_API_KEY="..." \
  -n dellmology

# Create configmap for non-sensitive config
kubectl create configmap dellmology-config \
  --from-literal=LOG_LEVEL=INFO \
  --from-literal=CACHE_TTL=30 \
  -n dellmology
```

### PostgreSQL Deployment

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: timescaledb
  namespace: dellmology
spec:
  serviceName: timescaledb
  replicas: 1
  selector:
    matchLabels:
      app: timescaledb
  template:
    metadata:
      labels:
        app: timescaledb
    spec:
      containers:
      - name: timescaledb
        image: timescale/timescaledb:latest-pg15
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dellmology-secrets
              key: POSTGRES_PASSWORD
        - name: POSTGRES_DB
          value: dellmology
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "8Gi"
            cpu: "4"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 200Gi

---
apiVersion: v1
kind: Service
metadata:
  name: timescaledb
  namespace: dellmology
spec:
  clusterIP: None
  selector:
    app: timescaledb
  ports:
  - port: 5432
    targetPort: 5432
```

### Redis Deployment

```yaml
# redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: dellmology
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command: ["redis-server", "--appendonly", "yes"]
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-storage
          mountPath: /data
        resources:
          requests:
            memory: "512Mi"
            cpu: "0.25"
          limits:
            memory: "2Gi"
            cpu: "1"
      volumes:
      - name: redis-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: dellmology
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

### ML Engine Deployment

```yaml
# ml-engine-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-engine-screener
  namespace: dellmology
spec:
  replicas: 3  # Horizontal scaling
  selector:
    matchLabels:
      app: ml-engine-screener
  template:
    metadata:
      labels:
        app: ml-engine-screener
    spec:
      containers:
      - name: ml-engine
        image: dellmology/ml-engine:latest
        ports:
        - containerPort: 8003
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: dellmology-secrets
              key: DATABASE_URL
        - name: REDIS_HOST
          value: "redis"
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: dellmology-config
              key: LOG_LEVEL
        livenessProbe:
          httpGet:
            path: /health
            port: 8003
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8003
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "1Gi"
            cpu: "0.5"
          limits:
            memory: "4Gi"
            cpu: "2"
---
apiVersion: v1
kind: Service
metadata:
  name: ml-engine-screener
  namespace: dellmology
spec:
  selector:
    app: ml-engine-screener
  ports:
  - port: 8003
    targetPort: 8003
  type: ClusterIP
```

**Deploy to Kubernetes:**
```bash
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f ml-engine-deployment.yaml

# Check status
kubectl get pods -n dellmology
kubectl logs -f deployment/ml-engine-screener -n dellmology
```

---

## Performance Tuning

### Database Optimization

```sql
-- Connection pooling
-- In PostgreSQL postgresql.conf
max_connections = 200
shared_buffers = 4GB
effective_cache_size = 16GB

-- Timeline compression (keep 7 days raw, compress older)
ALTER TABLE trades SET (timescaledb.compress_orderby = 'timestamp DESC');
ALTER TABLE trades SET (timescaledb.compress_segmentby = 'symbol');

SELECT add_compression_policy('trades', INTERVAL '7 days');
```

### Redis Optimization

```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru  # Evict least recently used
appendfsync everysec          # Balance durability vs performance
```

### Application Tuning

```python
# apps/ml-engine/config.py
# Connection pooling
SQLALCHEMY_ENGINE_OPTIONS = {
    "pool_size": 20,
    "max_overflow": 40,
    "pool_recycle": 3600,
    "echo": False,
}

# Cache configuration
CACHE_TTL = {
    "screener_results": 30,      # 30 seconds
    "patterns": 60,              # 1 minute
    "broker_flows": 300,         # 5 minutes
    "ohlc_data": 60,            # 1 minute
}
```

### Next.js Edge Caching

```typescript
// apps/web/src/app/api/route.ts
export const runtime = 'edge';
export const revalidate = 15;  // Revalidate every 15 seconds

export async function GET(request: NextRequest) {
  const response = await fetch(ML_ENGINE_URL, {
    cache: 'force-cache',
    next: { revalidate: 15 },
  });
  return response;
}
```

### Monitoring Key Metrics

```bash
# Database query performance
EXPLAIN ANALYZE SELECT * FROM trades WHERE symbol = 'BBCA' LIMIT 100;

# Redis memory usage
redis-cli INFO memory

# Service response times
curl -w "@curl-format.txt" http://localhost:8003/health
```

---

## Monitoring & Alerting

### Prometheus Integration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'timescaledb'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']

  - job_name: 'ml-engine'
    static_configs:
      - targets: ['localhost:8003']
    metrics_path: '/metrics'
```

### Grafana Dashboards

```bash
# Create dashboard for:
# 1. Database metrics (transactions/sec, queries, connections)
# 2. Redis metrics (hit rate, memory usage, evictions)
# 3. Service metrics (response time, error rate, throughput)
# 4. ML Engine metrics (screening time, cache hits, patterns found)
```

### Alerting Rules

```yaml
# alert-rules.yml
groups:
  - name: dellmology-alerts
    rules:
      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        annotations:
          summary: "Database is down"

      - alert: HighErrorRate
        expr: rate(ml_engine_errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "ML engine error rate > 5%"

      - alert: CacheEvictions
        expr: redis_evicted_keys_total > 1000
        for: 10m
        annotations:
          summary: "Redis evictions detected - increase memory"

      - alert: SlowQueries
        expr: histogram_quantile(0.95, query_duration_seconds) > 5
        for: 5m
        annotations:
          summary: "95th percentile query time > 5s"
```

### Logging & Log Aggregation

```bash
# Docker logging
docker logs --tail 100 dellmology_ml-engine

# ELK Stack integration
# Send logs to Elasticsearch for centralized monitoring
# Use Logstash to parse and forward

# Kubernetes logs
kubectl logs -f deployment/ml-engine-screener -n dellmology
kubectl logs -f statefulset/timescaledb -n dellmology
```

---

## Scaling Strategies

### Horizontal Scaling

```bash
# Scale ML Engine replicas
kubectl scale deployment ml-engine-screener --replicas=5 -n dellmology

# Add load balancer
kubectl patch service ml-engine-screener -p '{"spec":{"type":"LoadBalancer"}}' -n dellmology
```

### Vertical Scaling

```bash
# Increase resource limits
kubectl set resources deployment ml-engine-screener \
  -n dellmology \
  --limits=memory=8Gi,cpu=4 \
  --requests=memory=4Gi,cpu=2
```

### Database Sharding (Advanced)

```sql
-- Partition trades table by symbol for distributed queries
CREATE TABLE trades_partitioned (
    id BIGSERIAL,
    symbol VARCHAR(20),
    timestamp TIMESTAMPTZ,
    ...
) PARTITION BY LIST (symbol);

CREATE TABLE trades_bbca PARTITION OF trades_partitioned
    FOR VALUES IN ('BBCA');
```

### Request Rate Limiting

```python
# apps/ml-engine/middleware.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/screen")
@limiter.limit("10/minute")
async def screen(request):
    ...
```

---

## Troubleshooting

### Common Issues

**Issue: "Database connection refused"**
```bash
# Check PostgreSQL is running
docker-compose ps db

# Check credentials in .env
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**Issue: "Redis connection refused"**
```bash
# Check Redis port
nc -zv localhost 6379

# Check Redis is running
docker-compose ps redis
```

**Issue: "ML Engine returning 503"**
```bash
# Check logs
docker logs dellmology_ml-engine

# Verify database connectivity
curl http://localhost:8003/health

# Check resource limits
docker stats dellmology_ml-engine
```

**Issue: "High memory usage"**
```bash
# Check what's in Redis
redis-cli --stat

# Reduce cache TTL
# Increase Redis maxmemory

# Kill large processes
docker exec dellmology_ml-engine ps aux | sort -nk 4 -r
```

### Diagnostic Commands

```bash
# Full system diagnostic
python diagnostic.py

# Database health
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT version();
  SELECT COUNT(*) FROM trades;
  SELECT * FROM pg_stat_activity;"

# Service connectivity
curl -H "Content-Type: application/json" http://localhost:8003/health
curl http://localhost:8080/health
curl http://localhost:3000/api/health

# Network debugging
docker network ls
docker network inspect dellmology-network
```

---

## Security Hardening

### Database Security

```sql
-- Create application user with limited permissions
CREATE USER dellmology_app WITH PASSWORD 'strong_password';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE dellmology TO dellmology_app;
GRANT USAGE ON SCHEMA public TO dellmology_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dellmology_app;

-- Enforce SSL connections
-- In postgresql.conf: ssl = on
```

### Network Security

```yaml
# Kubernetes Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dellmology-network-policy
  namespace: dellmology
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: dellmology
  egress:
  - to:
    - namespaceSelector: {}
```

### API Security

```python
# Rate limiting and authentication
from fastapi import FastAPI, HTTPException, Depends, Header

app = FastAPI()

async def verify_api_key(x_api_key: str = Header(...)) -> str:
    if x_api_key != os.environ.get("ML_ENGINE_KEY"):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key

@app.post("/api/screen")
async def screen(request: ScreenRequest, api_key: str = Depends(verify_api_key)):
    ...
```

### Secrets Management

```bash
# Use environment variables or secrets manager
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id dellmology/db-password

# HashiCorp Vault
vault kv get secret/dellmology/credentials

# Kubernetes Secrets
kubectl get secrets -n dellmology
```

---

## Maintenance & Backups

### Database Backups

```bash
# Daily backup
docker exec dellmology_db pg_dump -U admin dellmology | gzip > dellmology_$(date +%Y%m%d).sql.gz

# Or with pg_basebackup for continuous archiving
docker exec dellmology_db pg_basebackup -D /backup -Ft -z -Xstream
```

### Cleanup Tasks

```bash
# Compress old trades data (>7 days)
docker exec dellmology_db psql -U admin -d dellmology -c "
  SELECT compress_chunk(chunk) FROM show_chunks('trades')
  WHERE range_start < NOW() - INTERVAL '7 days';"

# Delete very old logs (>30 days)
DELETE FROM trade_logs WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Health Monitoring

```bash
# Daily report email
0 06 * * * /opt/dellmology/send_health_report.py > /var/log/dellmology_health.log 2>&1
```

---

## Support & Documentation

- **Issue Tracker**: Report bugs [here]
- **Documentation**: Full docs at [docs site]
- **Community**: Join us on [Discord/Slack]
- **Commercial Support**: Contact support@dellmology.com
