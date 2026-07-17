'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function JournalPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modal state
  const [selectedDateData, setSelectedDateData] = useState<{ date: string, entries: any[] } | null>(null);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  
  // Global P&L state
  const [globalPrices, setGlobalPrices] = useState<Record<string, number>>({});
  const [loadingGlobalPrices, setLoadingGlobalPrices] = useState(false);

  useEffect(() => {
    fetch('/api/journal').then(r => r.json()).then(d => setEntries(d.data));
  }, []);

  useEffect(() => {
    const openEmitens = Array.from(new Set(entries.filter(e => e.status === 'OPEN').map(e => e.emiten)));
    if (openEmitens.length === 0) return;
    
    const fetchOpenPrices = async () => {
      setLoadingGlobalPrices(true);
      const newPrices: Record<string, number> = { ...globalPrices };
      await Promise.all(openEmitens.map(async (emiten) => {
        try {
          const res = await fetch(`/api/stock?emiten=${emiten}`);
          const data = await res.json();
          if (data?.data?.price || data?.price) {
            newPrices[emiten] = data.data?.price || data.price;
          }
        } catch { /* ignore */ }
      }));
      setGlobalPrices(newPrices);
      setLoadingGlobalPrices(false);
    };
    
    fetchOpenPrices();
  }, [entries]);

  useEffect(() => {
    if (!selectedDateData) return;
    
    // Fetch live prices for entries shown in the modal
    const fetchLivePrices = async () => {
      setLoadingPrices(true);
      const uniqueEmitens = Array.from(new Set(selectedDateData.entries.map(e => e.emiten)));
      const newPrices: Record<string, number> = { ...currentPrices };
      
      await Promise.all(uniqueEmitens.map(async (emiten) => {
        try {
          const res = await fetch(`/api/stock?emiten=${emiten}`);
          const data = await res.json();
          if (data?.data?.price || data?.price) {
            newPrices[emiten] = data.data?.price || data.price;
          }
        } catch { /* ignore */ }
      }));
      
      setCurrentPrices(newPrices);
      setLoadingPrices(false);
    };
    
    fetchLivePrices();
  }, [selectedDateData]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return (
    <div className="app-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar searchQuery="" onSearchChange={() => {}} />
      
      <main style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, color: 'var(--text-main)' }}>Trading Journal</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, background: 'var(--bg-surface)', padding: '5px 15px', borderRadius: 20, border: '1px solid var(--border-default)' }}>
            <button onClick={prevMonth} className="btn btn--ghost btn--sm" style={{ padding: 5 }}><ChevronLeft size={16} /></button>
            <span style={{ fontWeight: 600, width: 120, textAlign: 'center' }}>{monthNames[month]} {year}</span>
            <button onClick={nextMonth} className="btn btn--ghost btn--sm" style={{ padding: 5 }}><ChevronRight size={16} /></button>
          </div>
        </div>

        {(() => {
          const realizedEntries = entries.filter(e => e.status === 'TP' || e.status === 'SL');
          let realizedPnL = 0, wins = 0, losses = 0;
          realizedEntries.forEach(e => {
            if (e.status === 'TP' && e.entry > 0) {
              realizedPnL += ((e.tp - e.entry) / e.entry) * 100;
              wins++;
            } else if (e.status === 'SL' && e.entry > 0) {
              realizedPnL += ((e.sl - e.entry) / e.entry) * 100;
              losses++;
            }
          });

          const openEntries = entries.filter(e => e.status === 'OPEN');
          let openPnL = 0, activeCount = 0;
          openEntries.forEach(e => {
            const livePrice = globalPrices[e.emiten];
            if (livePrice && e.entry > 0) {
              openPnL += ((livePrice - e.entry) / e.entry) * 100;
              activeCount++;
            }
          });

          return (
            <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
              <div style={{ flex: 1, padding: '15px 20px', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Realized P&L</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: realizedPnL >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                    {realizedPnL > 0 ? '+' : ''}{realizedPnL.toFixed(2)}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Win / Loss</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    <span style={{ color: 'var(--color-bullish)' }}>{wins}W</span>
                    <span style={{ color: 'var(--text-muted)' }}> - </span>
                    <span style={{ color: 'var(--color-bearish)' }}>{losses}L</span>
                  </div>
                </div>
              </div>
              
              <div style={{ flex: 1, padding: '15px 20px', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Open P&L</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: openPnL >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                    {loadingGlobalPrices ? '...' : `${openPnL > 0 ? '+' : ''}${openPnL.toFixed(2)}%`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Active Positions</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {activeCount} / {openEntries.length} Priced
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, background: 'var(--bg-surface)', padding: 20, borderRadius: 12, border: '1px solid var(--border-default)' }}>
          {/* Calendar Header */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', paddingBottom: 10 }}>{day}</div>
          ))}
          
          {/* Empty cells for first week alignment */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ height: 100, background: 'transparent' }} />
          ))}

          {/* Calendar Grid */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const currentMonthStr = String(month + 1).padStart(2, '0');
            const dayString = String(i + 1).padStart(2, '0');
            const dateStr = `${year}-${currentMonthStr}-${dayString}`;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            
            const dayEntries = entries.filter(e => e.date === dateStr);
            
            // Calculate daily PnL for closed trades
            let dayPnL = 0;
            dayEntries.forEach(e => {
              if (e.status === 'TP' && e.entry > 0) dayPnL += ((e.tp - e.entry) / e.entry) * 100;
              else if (e.status === 'SL' && e.entry > 0) dayPnL += ((e.sl - e.entry) / e.entry) * 100;
            });
            const hasClosedTrades = dayEntries.some(e => e.status === 'TP' || e.status === 'SL');
            
            return (
              <div 
                key={i} 
                onClick={() => { if (dayEntries.length > 0) setSelectedDateData({ date: dateStr, entries: dayEntries }) }}
                style={{ 
                  height: 100, border: isToday ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)', 
                  borderRadius: 6, padding: 5, overflowY: 'auto',
                  background: isToday ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)', position: 'relative',
                  cursor: dayEntries.length > 0 ? 'pointer' : 'default',
                  transition: '0.2s'
                }}
                onMouseOver={(e) => { if (dayEntries.length > 0) e.currentTarget.style.borderColor = 'var(--accent-cyan)' }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = isToday ? 'var(--accent-cyan)' : 'var(--border-default)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: isToday ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal' }}>{i + 1}</span>
                  {/* PnL Display */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    {hasClosedTrades && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: dayPnL >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                        Realized: {dayPnL >= 0 ? '+' : ''}{dayPnL.toFixed(1)}%
                      </span>
                    )}
                    {dayEntries.some(e => e.status === 'OPEN') && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                        Open: {(() => {
                          let openPnL = 0;
                          dayEntries.filter(e => e.status === 'OPEN').forEach(e => {
                            const live = globalPrices[e.emiten];
                            if (live && e.entry > 0) openPnL += ((live - e.entry) / e.entry) * 100;
                          });
                          return (openPnL >= 0 ? '+' : '') + openPnL.toFixed(1) + '%';
                        })()}
                      </span>
                    )}
                  </div>
                </div>
                {dayEntries.map(entry => (
                  <div key={entry.id} style={{ 
                    marginTop: 4, padding: '2px 4px', fontSize: 9, borderRadius: 3,
                    background: entry.status === 'TP' ? '#2ebd8544' : entry.status === 'SL' ? '#e0294a44' : entry.status === 'EXPIRED' ? 'rgba(255,255,255,0.1)' : '#fbbf2444',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }} title={entry.reason}>
                    {entry.emiten} ({entry.status === 'OPEN' ? 'OPN' : entry.status === 'EXPIRED' ? 'EXP' : entry.status})
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Detail Modal Overlay */}
        {selectedDateData && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
          }} onClick={() => setSelectedDateData(null)}>
            <div style={{
              background: 'var(--bg-main)', width: '90%', maxWidth: 700, maxHeight: '80vh',
              borderRadius: 12, border: '1px solid var(--border-default)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: 18, color: 'var(--text-main)', margin: 0 }}>Entry Details — {selectedDateData.date}</h2>
                  {(() => {
                    let pnl = 0;
                    selectedDateData.entries.forEach(e => {
                      if (e.status === 'TP' && e.entry > 0) pnl += ((e.tp - e.entry) / e.entry) * 100;
                      else if (e.status === 'SL' && e.entry > 0) pnl += ((e.sl - e.entry) / e.entry) * 100;
                    });
                    const hasClosed = selectedDateData.entries.some(e => e.status === 'TP' || e.status === 'SL');
                    const wins = selectedDateData.entries.filter(e => e.status === 'TP').length;
                    const losses = selectedDateData.entries.filter(e => e.status === 'SL').length;
                    if (!hasClosed) return null;
                    return (
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: pnl >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}% PnL
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          <span style={{ color: 'var(--color-bullish)' }}>{wins}W</span> / <span style={{ color: 'var(--color-bearish)' }}>{losses}L</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => setSelectedDateData(null)}>✕</button>
              </div>
              <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                {selectedDateData.entries.map((entry, idx) => {
                  const livePrice = currentPrices[entry.emiten];
                  let progress = 0;
                  if (livePrice && entry.entry) {
                    progress = ((livePrice - entry.entry) / entry.entry) * 100;
                  }
                  
                  return (
                    <div key={idx} style={{ 
                      marginBottom: 15, padding: 15, background: 'var(--bg-surface)', 
                      borderRadius: 8, border: '1px solid var(--border-default)' 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <h3 style={{ fontSize: 16, color: 'var(--accent-cyan)', margin: 0 }}>{entry.emiten}</h3>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 4 }}>{entry.sector}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ 
                            padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 'bold',
                            background: entry.status === 'TP' ? '#2ebd85' : entry.status === 'SL' ? '#e0294a' : entry.status === 'EXPIRED' ? '#666' : '#fbbf24',
                            color: '#000'
                          }}>{entry.status}</span>
                          <button 
                            className="btn btn--ghost btn--sm" 
                            style={{ color: 'var(--color-bearish)', padding: '2px 6px', fontSize: 12, border: '1px solid var(--color-bearish)' }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Hapus ${entry.emiten} dari jurnal?`)) {
                                const res = await fetch(`/api/journal?id=${entry.id}`, { method: 'DELETE' });
                                if (res.ok) {
                                  setEntries(prev => prev.filter(p => p.id !== entry.id));
                                  setSelectedDateData(prev => prev ? {
                                    ...prev,
                                    entries: prev.entries.filter(p => p.id !== entry.id)
                                  } : null);
                                }
                              }
                            }}
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, fontSize: 12, marginBottom: 15 }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)' }}>Entry</div>
                          <div style={{ fontWeight: 600 }}>Rp {entry.entry}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)' }}>Take Profit</div>
                          <div style={{ fontWeight: 600, color: 'var(--color-bullish)' }}>Rp {entry.tp}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)' }}>Stop Loss</div>
                          <div style={{ fontWeight: 600, color: 'var(--color-bearish)' }}>Rp {entry.sl}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)' }}>Current Price</div>
                          <div style={{ fontWeight: 600, color: progress > 0 ? 'var(--color-bullish)' : progress < 0 ? 'var(--color-bearish)' : 'var(--text-main)' }}>
                            {loadingPrices && !livePrice ? 'Loading...' : livePrice ? `Rp ${livePrice}` : '-'}
                            {livePrice && entry.entry && (
                              <span style={{ fontSize: 10, marginLeft: 4 }}>
                                ({progress > 0 ? '+' : ''}{progress.toFixed(2)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6 }}>
                        <strong style={{ color: 'var(--text-main)' }}>AI Reasoning:</strong><br/>
                        {entry.reason}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
