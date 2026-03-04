# Roadmap Execution Matrix (Post Single-Pass)

| Workstream | Status | Owner | Dependency | DoD | ETA |
|---|---|---|---|---|---|
| P0 Real Signal Path | Completed | ML + Web | DB trades/broker_flow | Screener/path runtime non-mock | Done |
| P0 Telegram Live Send | Completed | ML | TELEGRAM env | Alert terkirim ke Bot API | Done |
| P1 Negotiated/Cross API | Completed | Streamer + Web | trades trade_type NEGO/CROSS | Endpoint + panel ringkas aktif | Done |
| P1 Iceberg Detector | Completed | Streamer | depth feed | Anomali ICEBERG masuk order_flow_anomalies | Done |
| P1 Whale Cluster API Layer | Completed | Web API | broker_flow | cluster + correlation field tersedia | Done |
| P1 Whale Cluster Native Engine | Completed | Streamer | native analysis callsite | endpoint `/broker/whale-clusters` aktif + cluster scoring native | Done |
| P1 Commodity Correlation Engine | Completed | Web API | external market feed | endpoint correlation aktif + consumed by FlowEngine | Done |
| P1 Sentiment Multi-Source | Completed | Web API | external feeds | google+reddit+stocktwits + alignment/coverage diagnostics | Done |
| P2 External Queue Broker | Completed | Streamer | Redis | publish/subscribe + heartbeat queue telemetry + fallback local | Done |
| P2 RLS Full Coverage | Completed | DB | Supabase roles | policy read/write mencakup order_events + broker_zscore | Done |
| P2 Operational Guardrails | Completed | Web + Streamer | trade freshness + external check | heartbeat, cross-check lock, dead-letter observability terpakai di UI | Done |
| Dashboard Shell page.tsx | Completed | Web | page.tsx patched via terminal | panel nego/cross consume `/api/negotiated-monitor` | Done |
| ROADMAP.md inline update | Completed | Docs | ROADMAP.md patched via terminal | pointer ke matrix eksekusi tertanam | Done |

## Notes
- File jumbo (`page.tsx`, `ROADMAP.md`) telah diselesaikan via jalur terminal langsung karena batas sinkronisasi extension untuk file >50MB.
- Matrix ini tetap menjadi ringkasan status eksekusi lintas workstream.
