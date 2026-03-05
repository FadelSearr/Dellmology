-- Additional table for real-time HAKA/HAKI trades
CREATE TABLE IF NOT EXISTS haka_haki_trades (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    price BIGINT NOT NULL,
    action TEXT NOT NULL, -- HAKA or HAKI
    volume BIGINT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Table for storing Stockbit tokens
CREATE TABLE IF NOT EXISTS stockbit_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);
