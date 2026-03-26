import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { useStore } from '../store/useStore';

type Mode = 'bubble' | 'input' | 'chat';

const TRANSITION_DURATION = '0.35s';
const TRANSITION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION = `all ${TRANSITION_DURATION} ${TRANSITION_EASE}`;

/* ---------- style helpers ---------- */

const glassBase: CSSProperties = {
  background: 'rgba(15, 20, 40, 0.65)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
};

const scrollbarStyles = `
  .chatpanel-messages::-webkit-scrollbar { width: 4px; }
  .chatpanel-messages::-webkit-scrollbar-track { background: transparent; }
  .chatpanel-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
  .chatpanel-messages::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

  @keyframes chatBubblePulse {
    0%, 100% { box-shadow: 0 4px 20px rgba(68,136,255,0.35); }
    50% { box-shadow: 0 4px 28px rgba(68,136,255,0.55), 0 0 40px rgba(68,200,102,0.15); }
  }

  @keyframes chatBubbleFadeIn {
    from { opacity: 0; transform: scale(0.7); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes typingDot {
    0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-3px); }
  }
`;

/* ---------- icons ---------- */

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(68,136,255,0.3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

/* ---------- ChatPanel ---------- */

export function ChatPanel() {
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const chatMessages = useStore((s) => s.chatMessages);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const currentProjectId = useStore((s) => s.currentProjectId);

  const [mode, setMode] = useState<Mode>('bubble');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  /* sync store chatOpen → mode */
  useEffect(() => {
    if (chatOpen && mode === 'bubble') {
      setMode('input');
    } else if (!chatOpen && mode !== 'bubble') {
      setMode('bubble');
    }
  }, [chatOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* animate input bar slide-in */
  useEffect(() => {
    if (mode === 'input') {
      // trigger slide animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setInputVisible(true));
      });
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInputVisible(false);
    }
  }, [mode]);

  /* animate chat panel expand */
  useEffect(() => {
    if (mode === 'chat') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setChatVisible(true));
      });
      setTimeout(() => chatInputRef.current?.focus(), 100);
    } else {
      setChatVisible(false);
    }
  }, [mode]);

  /* auto-scroll messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* re-enter chat mode if messages exist when opening */
  useEffect(() => {
    if (mode === 'input' && chatMessages.length > 0) {
      setMode('chat');
    }
  }, [mode, chatMessages.length]);

  const handleClose = useCallback(() => {
    setMode('bubble');
    setChatOpen(false);
  }, [setChatOpen]);

  const handleBubbleClick = useCallback(() => {
    setChatOpen(true);
  }, [setChatOpen]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !currentProjectId) return;
    const message = input.trim();
    setInput('');
    setSending(true);

    addChatMessage({
      role: 'user',
      content: message,
      sender: 'CEO',
      timestamp: new Date().toISOString(),
    });

    if (mode === 'input') setMode('chat');

    try {
      const res = await fetch(`/api/projects/${currentProjectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>;
        const errMsg = err.error ?? 'Failed to send';
        const detail = err.detail ? `\n${err.detail}` : '';
        addChatMessage({
          role: 'assistant',
          content: `Error: ${errMsg}${detail}`,
          sender: 'System',
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      addChatMessage({
        role: 'assistant',
        content: 'Error: Cannot connect to server',
        sender: 'System',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, currentProjectId, mode, addChatMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleSend, handleClose],
  );

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  /* ========== RENDER ========== */

  return (
    <>
      <style>{scrollbarStyles}</style>

      {/* ---- Bubble ---- */}
      {mode === 'bubble' && (
        <button
          onClick={handleBubbleClick}
          title="Chat with PM"
          style={{
            position: 'fixed',
            bottom: 72,
            right: 20,
            zIndex: 50,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            background: 'linear-gradient(135deg, #4488FF, #44CC66)',
            animation: 'chatBubblePulse 3s ease-in-out infinite, chatBubbleFadeIn 0.35s ease',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          <ChatIcon />
        </button>
      )}

      {/* ---- Quick Input Bar ---- */}
      {mode === 'input' && (
        <div
          style={{
            position: 'fixed',
            bottom: 72,
            right: 20,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 20,
            width: 380,
            ...glassBase,
            transform: inputVisible ? 'translateX(0)' : 'translateX(120%)',
            opacity: inputVisible ? 1 : 0,
            transition: TRANSITION,
          }}
        >
          {/* gradient accent line on left */}
          <div style={{
            width: 3,
            height: 24,
            borderRadius: 2,
            background: 'linear-gradient(180deg, #4488FF, #44CC66)',
            flexShrink: 0,
          }} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder={sending ? 'Sending...' : 'Message PM...'}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '8px 12px',
              color: 'white',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              cursor: sending || !input.trim() ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              background: sending || !input.trim()
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, #4488FF, #44CC66)',
              opacity: sending || !input.trim() ? 0.4 : 1,
              transition: TRANSITION,
              flexShrink: 0,
            }}
          >
            <SendIcon />
          </button>
          <button
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
              background: 'transparent',
              transition: TRANSITION,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* ---- Full Chat Panel ---- */}
      {mode === 'chat' && (
        <div
          style={{
            position: 'fixed',
            bottom: 60,
            right: 20,
            zIndex: 50,
            width: 420,
            height: 520,
            borderRadius: 18,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...glassBase,
            /* border glow */
            boxShadow: chatVisible
              ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(68,136,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 8px 32px rgba(0, 0, 0, 0.3)',
            transform: chatVisible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.95)',
            opacity: chatVisible ? 1 : 0,
            transition: TRANSITION,
          }}
        >
          {/* -- Header -- */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#4488FF',
                background: 'rgba(68,136,255,0.12)',
                border: '1px solid rgba(68,136,255,0.25)',
              }}>
                PM
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>PM Chat</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                  Conversation & Task Instructions
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.04)',
                transition: TRANSITION,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color = 'white';
                el.style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color = 'rgba(255,255,255,0.4)';
                el.style.background = 'rgba(255,255,255,0.04)';
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* -- Messages -- */}
          <div
            className="chatpanel-messages"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.15) transparent',
            }}
          >
            {chatMessages.length === 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 12,
                opacity: 0.6,
                paddingTop: 40,
              }}>
                <EmptyStateIcon />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.5 }}>
                  Send a message to PM.<br />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                    Chat, ask questions, brainstorm, or give task instructions.
                  </span>
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const isStatus = !isUser && /^(\[[\d/]+\]|✓|✗|전체)/.test(msg.content);
              const isSuccess = msg.content.startsWith('✓');
              const isFail = msg.content.startsWith('✗');
              const isSummary = msg.content.startsWith('전체');

              // ── Status message (compact inline) ──
              if (isStatus) {
                return (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    padding: '1px 0',
                  }}>
                    <div style={{
                      maxWidth: '92%',
                      padding: isSummary ? '8px 12px' : '4px 10px',
                      borderRadius: 8,
                      fontSize: 11,
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: isFail
                        ? 'rgba(255, 120, 120, 0.9)'
                        : isSuccess
                          ? 'rgba(100, 220, 130, 0.9)'
                          : isSummary
                            ? 'rgba(255, 255, 255, 0.85)'
                            : 'rgba(180, 200, 255, 0.8)',
                      background: isSummary
                        ? 'rgba(68, 136, 255, 0.1)'
                        : isFail
                          ? 'rgba(255, 80, 80, 0.06)'
                          : 'transparent',
                      borderLeft: isSummary
                        ? '2px solid rgba(68, 136, 255, 0.4)'
                        : isFail
                          ? '2px solid rgba(255, 80, 80, 0.3)'
                          : isSuccess
                            ? '2px solid rgba(68, 204, 102, 0.25)'
                            : '2px solid rgba(100, 140, 255, 0.15)',
                      fontWeight: isSummary ? 600 : 400,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // ── Normal message (user / assistant) ──
              return (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '82%',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    background: isUser
                      ? 'linear-gradient(135deg, rgba(40, 60, 100, 0.7), rgba(30, 50, 90, 0.7))'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isUser
                      ? '1px solid rgba(68, 136, 255, 0.2)'
                      : '1px solid rgba(255, 255, 255, 0.07)',
                    backdropFilter: 'blur(8px)',
                  }}>
                    {!isUser && msg.sender && (
                      <div style={{
                        fontSize: 10,
                        fontWeight: 600,
                        marginBottom: 4,
                        background: 'linear-gradient(90deg, #4488FF, #44CC66)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                        {msg.sender}
                      </div>
                    )}
                    <div style={{
                      fontSize: 13,
                      color: 'rgba(255, 255, 255, 0.88)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.55,
                    }}>
                      {msg.content}
                    </div>
                    <div style={{
                      fontSize: 9,
                      color: 'rgba(255, 255, 255, 0.25)',
                      marginTop: 5,
                      textAlign: isUser ? 'right' : 'left',
                    }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Typing indicator */}
            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  borderRadius: '16px 16px 16px 4px',
                  padding: '12px 18px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, marginRight: 6, background: 'linear-gradient(90deg, #4488FF, #44CC66)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PM</div>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'rgba(68, 136, 255, 0.6)',
                      animation: `typingDot 1.2s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* -- Input Area -- */}
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={chatInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder={sending ? 'PM is thinking...' : 'Type a message...'}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: '10px 14px',
                  color: 'white',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(68,136,255,0.35)';
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  border: 'none',
                  cursor: sending || !input.trim() ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  background: sending || !input.trim()
                    ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(135deg, #4488FF, #44CC66)',
                  opacity: sending || !input.trim() ? 0.35 : 1,
                  transition: TRANSITION,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!sending && input.trim()) {
                    (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                }}
              >
                {sending ? (
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : (
                  <SendIcon />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* spinner keyframe for send button */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
