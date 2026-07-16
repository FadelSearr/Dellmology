'use client';
import { Search, Zap, BookOpen, Clock, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCombatMode?: () => void;
}

export default function Navbar({ searchQuery, onSearchChange, onCombatMode }: NavbarProps) {
  const [health, setHealth] = useState<Record<string, { status: string; metadata?: any }>>({
    engine: { status: 'offline' },
    database: { status: 'offline' },
    token: { status: 'offline' },
    dataIntegrity: { status: 'offline' },
  });
  const [macros, setMacros] = useState<any[]>([]);
  const [clock, setClock] = useState('');
  const [breadth, setBreadth] = useState<{ advance: number; decline: number; foreignNet: number } | null>(null);

  // Clock (Jakarta/WIB)
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const wib = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Asia/Jakarta', hour12: false,
      }).format(now);
      setClock(wib);
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real health status
  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        const json = await res.json();
        if (json.success && json.checks) setHealth(json.checks);
      } catch {
        // Keep current status
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Every 30s
    return () => clearInterval(interval);
  }, []);

  // Fetch macros
  useEffect(() => {
    async function fetchMacros() {
      try {
        const res = await fetch('/api/macro');
        const json = await res.json();
        if (json.success) setMacros(json.data);
      } catch (e) {
        console.error("Failed to load macros", e);
      }
    }
    fetchMacros();
    const interval = setInterval(fetchMacros, 300000); // Every 5 min
    return () => clearInterval(interval);
  }, []);

  // Fetch market breadth
  useEffect(() => {
    async function fetchBreadth() {
      try {
        const res = await fetch('/api/breadth');
        const json = await res.json();
        if (json.success) setBreadth(json.data);
      } catch {
        // ignore — API might not exist yet, show default
      }
    }
    fetchBreadth();
    const interval = setInterval(fetchBreadth, 60000);
    return () => clearInterval(interval);
  }, []);

  // Send heartbeat periodically
  useEffect(() => {
    async function heartbeat() {
      try { await fetch('/api/heartbeat', { method: 'POST' }); } catch { /* ignore */ }
    }
    heartbeat();
    const interval = setInterval(heartbeat, 5 * 60 * 1000); // Every 5 min
    return () => clearInterval(interval);
  }, []);

  // Build macro items for marquee duplication
  const macroItems = macros.length > 0 ? macros : [];

  const macroMarkup = macroItems.map(m => (
    <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{m.id}</span>
      <span style={{ color: m.percentChange >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
        {m.price ? m.price.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'}{' '}
        ({m.percentChange > 0 ? '+' : ''}{m.percentChange.toFixed(2)}%)
      </span>
    </div>
  ));

  return (
    <nav className="navbar" id="navbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        <div className="navbar__brand" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div className="navbar__brand-icon" style={{ position: 'absolute', left: 0, zIndex: 2 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 24, height: 24, objectFit: 'contain' }} className="brand-logo-anim" />
          </div>
          <span className="brand-text-anim" style={{ marginLeft: '32px' }}>DELLMOLOGY <span style={{ color: 'var(--accent-cyan)' }}>PRO</span></span>
        </div>

        <div className="navbar__search">
          <Search size={14} className="navbar__search-icon" />
          <input
            id="search-emiten"
            type="text"
            placeholder="Search emiten... (e.g. BBRI)"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Macro Ticker — Marquee */}
      <div className="marquee-container" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', margin: '0 12px' }}>
        {macroItems.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Loading macro data...</span>
        ) : (
          <div className="marquee-content">
            {macroMarkup}
            {/* Duplicate for seamless loop */}
            {macroMarkup}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {breadth && (
          <>
            <div className="breadth-badge" title="Advance / Decline Ratio">
              <TrendingUp size={11} style={{ color: 'var(--color-bullish)' }} />
              <span style={{ color: 'var(--color-bullish)' }}>{breadth.advance}</span>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <span style={{ color: 'var(--color-bearish)' }}>{breadth.decline}</span>
            </div>
            <div className="breadth-badge" title="Foreign Net Flow" style={{ color: breadth.foreignNet >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
              {breadth.foreignNet >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              <span>{breadth.foreignNet >= 0 ? '+' : ''}{(breadth.foreignNet / 1e9).toFixed(1)}B</span>
            </div>
          </>
        )}

        {/* Clock */}
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Clock size={11} />
          <span>{clock}</span>
          <span style={{ fontSize: 8, opacity: 0.6 }}>WIB</span>
        </div>

        {onCombatMode && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={onCombatMode}
            id="btn-combat-mode"
            title="Activate Combat Mode"
            style={{ color: 'var(--color-warning)', borderColor: 'rgba(245,158,11,0.3)' }}
          >
            <Zap size={12} /> COMBAT
          </button>
        )}

        <div className="navbar__health">
          <HealthDot label="Engine" status={health.engine?.status || 'offline'} />
          <HealthDot label="DB" status={health.database?.status || 'offline'} />
          <HealthDot 
            label="Token" 
            status={health.token?.status || 'offline'} 
            detail={health.token?.metadata?.expiresInMinutes ? `${health.token.metadata.expiresInMinutes}m` : undefined} 
          />
          <HealthDot label="Data" status={health.dataIntegrity?.status || 'offline'} />
        </div>
      </div>
    </nav>
  );
}

function HealthDot({ label, status, detail }: { label: string; status: string; detail?: string }) {
  const cls = status === 'online' ? 'online' : status === 'expiring' ? 'warning' : status === 'warning' ? 'warning' : 'offline';
  return (
    <div className="health-dot" title={detail ? `${label} expires in ${detail}` : label}>
      <div className={`health-dot__indicator health-dot__indicator--${cls}`} />
      <span>{label}{detail ? ` (${detail})` : ''}</span>
    </div>
  );
}
