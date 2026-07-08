'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Maximize2, Minimize2, Loader2, Zap } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  results?: any[];
}

export default function ChatOracle() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Halo! Saya Chat Oracle. Anda bisa meminta saya mencari saham dengan instruksi natural.\n\nContoh: "Carikan saya saham untuk daytrade hari ini" atau "Cari saham yang sedang diakumulasi bandar".'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: query.trim() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'nl_to_screener', query: userMessage.content }),
      });
      const data = await res.json();

      if (data.success && data.data && data.data.results) {
        const hits = data.data.results.slice(0, 5);
        let responseText = `Saya menggunakan parameter: Mode ${data.params.mode}`;
        if (data.params.minPrice) responseText += `, Harga Min: ${data.params.minPrice}`;
        
        if (hits.length === 0) {
          responseText += `\n\nMaaf, tidak ada saham yang cocok dengan kriteria tersebut saat ini.`;
        } else {
          responseText += `\n\nBerikut top ${hits.length} hasilnya:`;
        }

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: responseText,
          results: hits
        }]);
      } else {
        throw new Error('Format respon tidak valid');
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Maaf, terjadi kesalahan saat menghubungi Oracle. Silakan coba lagi.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          padding: '16px', borderRadius: '50%', background: 'var(--accent-primary)',
          color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px var(--accent-primary-glow)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}
        title="Ask Oracle"
      >
        <Bot size={24} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: '24px', bottom: '24px', zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      width: isExpanded ? '600px' : '380px',
      height: isExpanded ? '80vh' : '600px',
      transition: 'all var(--transition-normal)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 'bold' }}>
          <Bot color="var(--accent-primary)" size={20} />
          Chat Oracle <span style={{ fontSize: '10px', background: 'var(--accent-primary-glow)', padding: '2px 6px', borderRadius: '10px', color: 'var(--accent-primary)' }}>Beta</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setIsExpanded(!isExpanded)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '12px', fontSize: '13px', lineHeight: 1.5,
              borderRadius: 'var(--radius-md)',
              borderBottomRightRadius: msg.role === 'user' ? 0 : 'var(--radius-md)',
              borderBottomLeftRadius: msg.role === 'assistant' ? 0 : 'var(--radius-md)',
              background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-card)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-default)',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
            
            {msg.results && msg.results.length > 0 && (
              <div style={{ marginTop: '8px', width: '100%', maxWidth: '95%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {msg.results.map((hit, i) => (
                  <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '10px', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                        {hit.code}
                        {hit.volumeRatio > 2 && <Zap size={14} color="var(--color-warning)" />}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rp {hit.price}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: hit.changePercent > 0 ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                        {hit.changePercent > 0 ? '+' : ''}{hit.changePercent}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', borderBottomLeftRadius: 0, padding: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={16} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Oracle sedang berpikir...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-default)' }}>
        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tanya Oracle..."
            disabled={isLoading}
            style={{
              width: '100%', padding: '12px 40px 12px 16px', fontSize: '13px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
              borderRadius: '24px', color: 'var(--text-primary)', outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            style={{
              position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
              background: 'var(--accent-primary)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '32px', height: '32px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              opacity: (!query.trim() || isLoading) ? 0.5 : 1
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
