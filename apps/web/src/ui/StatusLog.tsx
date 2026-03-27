import { useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { useStore, type LogLevel } from '../store/useStore';

const LEVEL_CONFIG: Record<LogLevel, { color: string; icon: string; bg: string }> = {
  info:    { color: '#88bbff', icon: '\u25CF', bg: 'rgba(68,136,255,0.08)' },   // ●
  success: { color: '#44CC66', icon: '\u2714', bg: 'rgba(68,204,102,0.08)' },   // ✔
  error:   { color: '#ff6b6b', icon: '\u2716', bg: 'rgba(255,107,107,0.08)' },  // ✖
  warn:    { color: '#ffaa44', icon: '\u26A0', bg: 'rgba(255,170,68,0.08)' },   // ⚠
};

const glassPanel: CSSProperties = {
  background: 'rgba(10, 14, 30, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
};

export function StatusLog() {
  const logEntries = useStore((s) => s.logEntries);
  const logOpen = useStore((s) => s.logOpen);
  const setLogOpen = useStore((s) => s.setLogOpen);
  const logUnread = useStore((s) => s.logUnread);
  const clearLog = useStore((s) => s.clearLog);

  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(logEntries.length);

  // Auto-open panel when new events arrive (if closed)
  useEffect(() => {
    if (logEntries.length > prevLengthRef.current && !logOpen) {
      // Auto-open on first real activity (unless user disabled auto-open)
      if (logEntries.length >= 1 && prevLengthRef.current === 0) {
        const autoOpen = localStorage.getItem('mct-log-auto-open') !== 'false';
        if (autoOpen) setLogOpen(true);
      }
    }
    prevLengthRef.current = logEntries.length;
  }, [logEntries.length, logOpen, setLogOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logEntries.length, logOpen]);

  const toggleOpen = useCallback(() => {
    setLogOpen(!logOpen);
  }, [logOpen, setLogOpen]);

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Count by level
  const errorCount = logEntries.filter((e) => e.level === 'error').length;
  const successCount = logEntries.filter((e) => e.level === 'success').length;
  const activeCount = logEntries.filter((e) => e.level === 'info').length;

  return (
    <>
      <style>{`
        .statuslog-scroll::-webkit-scrollbar { width: 4px; }
        .statuslog-scroll::-webkit-scrollbar-track { background: transparent; }
        .statuslog-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .statuslog-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes logSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Toggle Button — top-left */}
      <button
        onClick={toggleOpen}
        style={{
          position: 'fixed',
          top: 52,
          left: 16,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 12,
          border: logOpen
            ? '1px solid rgba(68,136,255,0.3)'
            : '1px solid rgba(255,255,255,0.08)',
          background: logOpen
            ? 'rgba(68,136,255,0.12)'
            : 'rgba(10, 14, 30, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          cursor: 'pointer',
          color: logOpen ? '#88bbff' : 'rgba(255,255,255,0.6)',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'inherit',
          transition: 'all 0.25s ease',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        {/* Activity indicator */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Status
        {/* Unread badge */}
        {!logOpen && logUnread > 0 && (
          <span style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: 'white',
            background: errorCount > 0
              ? 'linear-gradient(135deg, #ff4444, #cc3333)'
              : 'linear-gradient(135deg, #4488FF, #44CC66)',
            padding: '0 5px',
            animation: 'statusPulse 2s ease-in-out infinite',
          }}>
            {logUnread > 99 ? '99+' : logUnread}
          </span>
        )}
        {/* Summary counters */}
        {logOpen && logEntries.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 6 }}>
            {successCount > 0 && <span style={{ color: '#44CC66' }}>{successCount} done</span>}
            {errorCount > 0 && <span style={{ color: '#ff6b6b' }}>{errorCount} err</span>}
            {activeCount > 0 && <span style={{ color: '#88bbff' }}>{activeCount}</span>}
          </span>
        )}
      </button>

      {/* Log Panel */}
      {logOpen && (
        <div
          style={{
            position: 'fixed',
            top: 90,
            left: 16,
            zIndex: 55,
            width: 420,
            maxHeight: 'calc(100vh - 200px)',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...glassPanel,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              Activity Log
              <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                {logEntries.length} entries
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => {
                  const current = localStorage.getItem('mct-log-auto-open') !== 'false';
                  localStorage.setItem('mct-log-auto-open', String(!current));
                }}
                title="자동 열림 설정"
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
              >
                {localStorage.getItem('mct-log-auto-open') !== 'false' ? '🔔' : '🔕'}
              </button>
              <button
                onClick={clearLog}
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div
            className="statuslog-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '6px 0',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            }}
          >
            {logEntries.length === 0 ? (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.2)',
                fontSize: 12,
              }}>
                No activity yet. Send a directive to get started.
              </div>
            ) : (
              logEntries.map((entry) => {
                const cfg = LEVEL_CONFIG[entry.level];
                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: '7px 14px',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      animation: 'logSlideIn 0.25s ease',
                      borderLeft: `2px solid ${cfg.color}33`,
                      background: 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = cfg.bg; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Icon */}
                    <span style={{
                      color: cfg.color,
                      fontSize: 11,
                      flexShrink: 0,
                      marginTop: 1,
                      width: 14,
                      textAlign: 'center',
                    }}>
                      {cfg.icon}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.82)',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}>
                        {entry.message}
                      </div>
                      {entry.detail && (
                        <div style={{
                          fontSize: 10,
                          color: entry.level === 'error' ? 'rgba(255,107,107,0.7)' : 'rgba(255,255,255,0.3)',
                          lineHeight: 1.4,
                          marginTop: 2,
                          wordBreak: 'break-all',
                          maxHeight: entry.level === 'error' ? 'none' : 60,
                          overflow: entry.level === 'error' ? 'visible' : 'hidden',
                        }}>
                          {entry.detail}
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <span style={{
                      fontSize: 9,
                      color: 'rgba(255,255,255,0.15)',
                      flexShrink: 0,
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}
