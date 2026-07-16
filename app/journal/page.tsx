'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function JournalPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetch('/api/journal').then(r => r.json()).then(d => setEntries(d.data));
  }, []);

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
            
            return (
              <div key={i} style={{ 
                height: 100, border: isToday ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)', 
                borderRadius: 6, padding: 5, overflowY: 'auto',
                background: isToday ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)', position: 'relative'
              }}>
                <span style={{ fontSize: 10, color: isToday ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal' }}>{i + 1}</span>
                {entries.filter(e => e.date === dateStr).map(entry => (
                  <div key={entry.id} style={{ 
                    marginTop: 5, padding: '2px 4px', fontSize: 9, borderRadius: 3,
                    background: entry.status === 'TP' ? '#2ebd8544' : entry.status === 'SL' ? '#e0294a44' : '#fbbf2444',
                    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)'
                  }} title={entry.reason}>
                    {entry.emiten} ({entry.status})
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
