"""Post-market broker flow retrieval and storage

This module fetches broker summary data from Stockbit (using the saved bearer token),
calculates net values, consistency scores and z-scores, and inserts the results into
TimescaleDB (Supabase) via psycopg2.

Intended to be run as a cron job after market close (17:00-18:00 WIB).
"""

import os
import requests
import psycopg2
import statistics
from datetime import date, timedelta
from typing import List, Dict

DB_URL = os.environ.get("DATABASE_URL")
STOCKBIT_TOKEN = os.environ.get("STOCKBIT_TOKEN")


class BrokerFlowEntry:
    def __init__(self, broker_code: str, buy_volume: int, sell_volume: int):
        self.broker_code = broker_code
        self.buy_volume = buy_volume
        self.sell_volume = sell_volume
        self.net_value = buy_volume - sell_volume
        # for broker_summaries table we also store average prices
        self.avg_buy_price = 0.0
        self.avg_sell_price = 0.0
        self.consistency_score = 0.0
        self.z_score = 0.0


def get_db_conn():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(DB_URL)


def fetch_broker_summary(symbol: str) -> List[Dict]:
    """Call Stockbit internal API and return the raw broker summary list."""
    if not STOCKBIT_TOKEN:
        raise RuntimeError("STOCKBIT_TOKEN not set")
    url = f"https://api.stockbit.com/v2/broker-summary/{symbol}"
    headers = {"Authorization": f"Bearer {STOCKBIT_TOKEN}"}
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json().get("data", [])


def compute_consistency(conn, symbol: str, broker: str) -> float:
    """Compute consistency score (days with activity in last 7 days)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM broker_summaries "
            "WHERE symbol=%s AND broker_id=%s AND net_buy_value<>0 "
            "AND date >= CURRENT_DATE - INTERVAL '7 days'",
            (symbol, broker),
        )
        count = cur.fetchone()[0]
    return count / 7.0


def compute_zscore(conn, symbol: str, broker: str, current: int) -> float:
    """Calculate z-score based on last 30 days of net_buy_value for the broker."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT net_buy_value FROM broker_summaries "
            "WHERE symbol=%s AND broker_id=%s ORDER BY date DESC LIMIT 30",
            (symbol, broker),
        )
        rows = [r[0] for r in cur.fetchall()]
    if len(rows) < 2:
        return 0.0
    mean = statistics.mean(rows)
    stdev = statistics.stdev(rows)
    if stdev == 0:
        return 0.0
    return (current - mean) / stdev


def store_entries(conn, symbol: str, entries: List[BrokerFlowEntry]):
    """Insert or update broker_flow table with the computed values."""
    today = date.today()
    # write into the existing broker_summaries table
    with conn.cursor() as cur:
        for e in entries:
            # for simplicity average prices assume price = net_value / volume if volume>0
            if e.buy_volume > 0:
                e.avg_buy_price = e.net_value / e.buy_volume
            if e.sell_volume > 0:
                e.avg_sell_price = abs(e.net_value) / e.sell_volume

            cur.execute(
                "INSERT INTO broker_summaries (date, symbol, broker_id, net_buy_value, avg_buy_price, avg_sell_price) "
                "VALUES (%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (date,symbol,broker_id) DO UPDATE SET "
                "net_buy_value=EXCLUDED.net_buy_value, avg_buy_price=EXCLUDED.avg_buy_price, "
                "avg_sell_price=EXCLUDED.avg_sell_price",
                (
                    today,
                    symbol,
                    e.broker_code,
                    e.net_value,
                    e.avg_buy_price,
                    e.avg_sell_price,
                ),
            )
            # Also persist into broker_flow (hypertable) including z_score and consistency
            try:
                cur.execute(
                    "INSERT INTO broker_flow(time, symbol, broker_code, buy_volume, sell_volume, net_value, consistency_score, z_score) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT (time,symbol,broker_code) DO UPDATE SET "
                    "buy_volume=EXCLUDED.buy_volume, sell_volume=EXCLUDED.sell_volume, net_value=EXCLUDED.net_value, "
                    "consistency_score=EXCLUDED.consistency_score, z_score=EXCLUDED.z_score",
                    (
                        today,
                        symbol,
                        e.broker_code,
                        e.buy_volume,
                        e.sell_volume,
                        e.net_value,
                        e.consistency_score,
                        e.z_score,
                    ),
                )
            except Exception:
                # best-effort: if broker_flow table doesn't exist or permission denied, continue
                pass
    conn.commit()


def process_symbol(symbol: str):
    raw = fetch_broker_summary(symbol)
    if not raw:
        print(f"no broker data for {symbol}")
        return
    conn = get_db_conn()
    entries = []
    for item in raw:
        entry = BrokerFlowEntry(
            broker_code=item.get("broker_code"),
            buy_volume=int(item.get("buy_volume", 0)),
            sell_volume=int(item.get("sell_volume", 0)),
        )
        entry.consistency_score = compute_consistency(conn, symbol, entry.broker_code)
        entry.z_score = compute_zscore(conn, symbol, entry.broker_code, entry.net_value)
        entries.append(entry)
    store_entries(conn, symbol, entries)
    conn.close()


def main(symbols: List[str] = None):
    """Run job for given symbols (or a preconfigured universe)."""
    if symbols is None:
        # load from environment or default list
        symbols = os.environ.get("BROKER_FLOW_SYMBOLS", "").split(",")
        symbols = [s.strip().upper() for s in symbols if s.strip()]
    for sym in symbols:
        try:
            print(f"processing {sym}")
            process_symbol(sym)
        except Exception as e:
            print(f"error processing {sym}: {e}")


if __name__ == "__main__":
    main()
