import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { AgentRole, AgentVisualState } from '../store/useStore';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<AgentRole, string> = {
  PM:        '#4488FF',
  DEVELOPER: '#44CC66',
  REVIEWER:  '#FF8844',
  TESTER:    '#AA66DD',
  DEVOPS:    '#DD4444',
};

const ROLE_ICONS: Record<AgentRole, string> = {
  PM:        '📋',
  DEVELOPER: '💻',
  REVIEWER:  '🔍',
  TESTER:    '🧪',
  DEVOPS:    '⚙️',
};

const STATE_LABELS: Record<string, string> = {
  IDLE:     'Idle',
  WORKING:  'Working',
  COFFEE:   'Coffee Break',
  READING:  'Reading Docs',
  WALKING:  'Moving',
  CHATTING: 'In Discussion',
  NAPPING:  'Power Nap',
  GAMING:   'Gaming',
  THINKING: 'Thinking',
};

const STATE_COLOR = (state: AgentVisualState) => {
  if (state === 'WORKING') return '#44CC66';
  if (state === 'THINKING') return '#88aaff';
  if (state === 'IDLE') return '#666';
  return '#FFaa33';
};

const ROLES: AgentRole[] = ['PM', 'DEVELOPER', 'REVIEWER', 'TESTER', 'DEVOPS'];
const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'kimi', 'minimax', 'glm'];

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4', 'claude-sonnet-4-20250514'],
  openai:    ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini'],
  google:    ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama:    [],
  kimi:      ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  minimax:   ['abab6.5-chat', 'abab5.5-chat'],
  glm:       ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
};

const OLLAMA_API = 'http://localhost:11434';

/* Activity feed lines per role */
const ACTIVITY_LINES: Record<AgentRole, string[]> = {
  PM: [
    '> analyzing sprint backlog...',
    '> updating project roadmap',
    '> reviewing team velocity',
    '> drafting acceptance criteria',
    '> scheduling stand-up meetings',
    '> prioritizing task queue',
    '> syncing stakeholder feedback',
  ],
  DEVELOPER: [
    '> parsing requirements...',
    '> generating code diff',
    '> running unit tests',
    '> resolving merge conflicts',
    '> optimizing hot path',
    '> writing type definitions',
    '> calling LLM API...',
    '> applying code patches',
  ],
  REVIEWER: [
    '> scanning code changes...',
    '> checking style guidelines',
    '> running static analysis',
    '> reviewing test coverage',
    '> adding inline comments',
    '> verifying edge cases',
    '> approving pull request',
  ],
  TESTER: [
    '> building test matrix...',
    '> executing integration tests',
    '> logging regression results',
    '> verifying acceptance criteria',
    '> recording test artifacts',
    '> fuzzing input parameters',
    '> checking error paths',
  ],
  DEVOPS: [
    '> checking deployment status...',
    '> scaling container replicas',
    '> rotating API credentials',
    '> monitoring CPU utilization',
    '> pushing Docker image',
    '> updating Helm chart',
    '> verifying health endpoints',
  ],
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

function useOllamaModels(provider: string) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    if (provider !== 'ollama') { setModels([]); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${OLLAMA_API}/api/tags`);
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await res.json();
      const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      setModels(names.length > 0 ? names : []);
      if (names.length === 0) setError('로컬 모델 없음');
    } catch {
      setModels([]);
      setError('Ollama 연결 실패 (localhost:11434)');
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => { fetchModels(); }, [fetchModels]);
  return { models, loading, error, refetch: fetchModels };
}

/* ------------------------------------------------------------------ */
/*  Sub-components for the immersive detail view                        */
/* ------------------------------------------------------------------ */

/** Animated terminal-style activity feed */
function ActivityFeed({ role }: { role: AgentRole }) {
  const lines = ACTIVITY_LINES[role] ?? ACTIVITY_LINES.DEVELOPER;
  const [visible, setVisible] = useState<string[]>([]);
  const [cursor, setCursor] = useState(true);
  const lineRef = useRef(0);

  useEffect(() => {
    // Seed 2 initial lines
    setVisible([lines[0], lines[1]]);
    lineRef.current = 2;

    const lineTimer = setInterval(() => {
      const next = lines[lineRef.current % lines.length];
      lineRef.current++;
      setVisible((prev) => {
        const updated = [...prev, next];
        return updated.slice(-5); // keep last 5 lines
      });
    }, 2200);

    const cursorTimer = setInterval(() => setCursor((c) => !c), 530);

    return () => { clearInterval(lineTimer); clearInterval(cursorTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(68,204,102,0.2)',
      borderRadius: 6,
      padding: '8px 10px',
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      <div style={{ color: 'rgba(68,204,102,0.5)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
        ACTIVITY FEED
      </div>
      {visible.map((line, i) => (
        <div
          key={`${line}-${i}`}
          style={{
            color: i === visible.length - 1 ? '#88ffbb' : 'rgba(68,204,102,0.5)',
            lineHeight: 1.7,
            transition: 'color 0.3s',
          }}
        >
          {line}{i === visible.length - 1 && <span style={{ opacity: cursor ? 1 : 0 }}>█</span>}
        </div>
      ))}
    </div>
  );
}

/** Task status pipeline visualization */
const PIPELINE_STEPS = ['CREATED', 'PLANNING', 'APPROVED', 'IN_PROGRESS', 'CODE_REVIEW', 'MERGING', 'DONE'];
const PIPELINE_LABELS: Record<string, string> = {
  CREATED: 'New', PLANNING: 'Plan', APPROVED: 'OK', IN_PROGRESS: 'Dev',
  CODE_REVIEW: 'Review', MERGING: 'Merge', DONE: 'Done',
};

function TaskPipeline({ status }: { status: string }) {
  const activeIdx = PIPELINE_STEPS.indexOf(status);
  const isDone = status === 'DONE';
  const isFailed = ['REJECTED', 'BLOCKED', 'FAILED'].includes(status);

  if (isFailed) {
    return (
      <div style={{
        padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)',
        color: '#FF4444', textAlign: 'center',
      }}>
        {status}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {PIPELINE_STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx || isDone;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div
              title={step}
              style={{
                flex: 1,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 3,
                fontSize: 9,
                fontWeight: isActive ? 700 : 400,
                background: isActive
                  ? 'rgba(68,136,255,0.35)'
                  : isPast
                    ? 'rgba(68,204,102,0.2)'
                    : 'rgba(255,255,255,0.04)',
                border: isActive
                  ? '1px solid rgba(68,136,255,0.7)'
                  : isPast
                    ? '1px solid rgba(68,204,102,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                color: isActive
                  ? '#88bbff'
                  : isPast
                    ? 'rgba(68,204,102,0.7)'
                    : 'rgba(255,255,255,0.2)',
                boxShadow: isActive ? '0 0 6px rgba(68,136,255,0.4)' : 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {PIPELINE_LABELS[step]}
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{
                width: 4,
                height: 1,
                background: isPast ? 'rgba(68,204,102,0.4)' : 'rgba(255,255,255,0.08)',
                flexShrink: 0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Camera follow toggle button */
function FollowBtn({ agentId }: { agentId: string }) {
  const followAgentId = useStore((s) => s.followAgentId);
  const setFollowAgentId = useStore((s) => s.setFollowAgentId);
  const isFollowing = followAgentId === agentId;

  return (
    <button
      onClick={() => setFollowAgentId(isFollowing ? null : agentId)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
        background: isFollowing ? 'rgba(68,136,255,0.25)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isFollowing ? 'rgba(68,136,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
        color: isFollowing ? '#88bbff' : 'rgba(255,255,255,0.5)',
        transition: 'all 0.15s',
        boxShadow: isFollowing ? '0 0 8px rgba(68,136,255,0.3)' : 'none',
      }}
    >
      <span style={{ fontSize: 13 }}>📍</span>
      {isFollowing ? 'Following' : 'Follow Cam'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export function AgentDetailPanel() {
  const mode = useStore((s) => s.agentPanelMode);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);

  const agent = agents.find((a) => a.id === selectedAgentId);

  if (mode === 'list') return <AgentListView />;
  if (mode === 'add') return <AgentAddForm />;
  if (mode === 'edit' && agent) return <AgentEditForm agent={agent} />;
  if (!agent) return null;

  const agentTask = tasks.find((t) => t.id === agent.currentTaskId || t.assigneeAgentId === agent.id);
  const roleColor = ROLE_COLORS[agent.role];
  const stateColor = STATE_COLOR(agent.visualState);
  const isActive = agent.visualState === 'WORKING' || agent.visualState === 'THINKING';

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        right: 0,
        zIndex: 20,
        width: 340,
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        background: 'rgba(10, 12, 28, 0.95)',
        borderLeft: `2px solid ${roleColor}55`,
        borderBottom: `2px solid ${roleColor}55`,
        borderBottomLeftRadius: 14,
        backdropFilter: 'blur(16px)',
        animation: 'slideInRight 0.2s ease-out',
        boxShadow: `-4px 4px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(${hexToRgb(roleColor)},0.03)`,
      }}
    >
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
        borderRadius: 'inherit',
      }} />

      {/* ── Header ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '14px 16px 12px',
        background: `linear-gradient(135deg, ${roleColor}22 0%, rgba(10,12,28,0) 70%)`,
        borderBottom: `1px solid ${roleColor}25`,
      }}>
        {/* Corner bracket TL */}
        <div style={{ position: 'absolute', top: 8, left: 8, width: 10, height: 10, borderTop: `2px solid ${roleColor}80`, borderLeft: `2px solid ${roleColor}80` }} />
        {/* Corner bracket TR */}
        <div style={{ position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderTop: `2px solid ${roleColor}80`, borderRight: `2px solid ${roleColor}80` }} />

        {/* Close button */}
        <button
          onClick={() => setSelectedAgentId(null)}
          style={{
            position: 'absolute', top: 8, right: 20,
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16,
            lineHeight: 1, padding: 2,
          }}
        >
          ×
        </button>

        {/* Back + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => setMode('list')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >
            ←
          </button>
          <span style={{ fontSize: 10, letterSpacing: 2, color: `${roleColor}99`, fontWeight: 600 }}>
            AGENT PROFILE
          </span>
        </div>

        {/* Avatar row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Role avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: `${roleColor}18`,
            border: `2px solid ${roleColor}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
            boxShadow: `0 0 16px ${roleColor}33, inset 0 0 12px ${roleColor}11`,
          }}>
            {ROLE_ICONS[agent.role]}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {agent.name}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: `${roleColor}22`, color: roleColor, border: `1px solid ${roleColor}44`,
                letterSpacing: 1,
              }}>
                {agent.role}
              </span>
            </div>
          </div>
        </div>

        {/* Status row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, marginTop: 10,
          padding: '5px 8px',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: stateColor,
            boxShadow: `0 0 ${isActive ? 8 : 4}px ${stateColor}`,
            animation: isActive ? 'statusPulse 1.5s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#ddd', fontWeight: 500 }}>
            {STATE_LABELS[agent.visualState] ?? agent.visualState}
          </span>
          {agent.provider && agent.model && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
              color: `${roleColor}99`, background: `${roleColor}10`,
              border: `1px solid ${roleColor}22`, borderRadius: 4, padding: '1px 6px',
              maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {agent.provider}/{agent.model}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ position: 'relative', zIndex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Activity feed for active states */}
        {isActive && <ActivityFeed role={agent.role} />}

        {/* Current Task */}
        {agentTask && (
          <div>
            <SectionLabel>Current Task</SectionLabel>
            <div style={{
              padding: '9px 11px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 13, color: '#e8e8e8', fontWeight: 500, marginBottom: 8, lineHeight: 1.3 }}>
                {agentTask.title}
              </div>
              <TaskPipeline status={agentTask.status} />
              {agentTask.description && (
                <div style={{
                  marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)',
                  lineHeight: 1.5, maxHeight: 44, overflow: 'hidden',
                }}>
                  {agentTask.description}
                </div>
              )}
              {agentTask.result && (
                <div style={{
                  marginTop: 6, fontSize: 11, fontFamily: 'monospace',
                  color: 'rgba(68,204,102,0.6)',
                  background: 'rgba(68,204,102,0.05)', borderRadius: 4, padding: '4px 7px',
                  maxHeight: 48, overflow: 'hidden',
                }}>
                  {agentTask.result.slice(0, 120)}{agentTask.result.length > 120 ? '...' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* System Prompt */}
        {agent.systemPrompt && (
          <div>
            <SectionLabel>System Prompt</SectionLabel>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6,
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 6, maxHeight: 72, overflow: 'hidden',
            }}>
              {agent.systemPrompt.slice(0, 200)}{agent.systemPrompt.length > 200 ? '...' : ''}
            </div>
          </div>
        )}

        {/* Position */}
        <div>
          <SectionLabel>Position</SectionLabel>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)',
            padding: '5px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            x:{agent.position.x.toFixed(1)} &nbsp;y:{agent.position.y.toFixed(1)} &nbsp;z:{agent.position.z.toFixed(1)}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex', gap: 6, paddingTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <FollowBtn agentId={agent.id} />
          <div style={{ flex: 1 }} />
          <ActionBtn label="수정" color="#4488FF" onClick={() => setMode('edit')} />
          <DeleteBtn agentId={agent.id} agentName={agent.name} />
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent List View                                                     */
/* ------------------------------------------------------------------ */

function AgentListView() {
  const agents = useStore((s) => s.agents);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);

  const handleClose = () => { setSelectedAgentId(null); setMode('detail'); };

  return (
    <div
      style={{
        position: 'fixed', top: 56, right: 0, zIndex: 20, width: 320,
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        background: 'rgba(10, 12, 28, 0.95)',
        borderLeft: '2px solid rgba(68,136,255,0.3)',
        borderBottom: '2px solid rgba(68,136,255,0.3)',
        borderBottomLeftRadius: 14,
        backdropFilter: 'blur(16px)',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(68,136,255,0.7)', fontWeight: 600 }}>
          AGENTS ({agents.length})
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMode('add')}
            style={{
              background: 'rgba(68,136,255,0.12)', border: '1px solid rgba(68,136,255,0.3)',
              borderRadius: 6, padding: '3px 10px', color: '#4488FF', fontSize: 11, cursor: 'pointer',
            }}
          >
            + 추가
          </button>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 10px' }}>
        {agents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 28, color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
            에이전트가 없습니다
          </div>
        )}
        {agents.map((a) => {
          const rc = ROLE_COLORS[a.role] ?? '#888';
          const sc = STATE_COLOR(a.visualState);
          return (
            <div
              key={a.id}
              onClick={() => { setSelectedAgentId(a.id); setMode('detail'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', marginBottom: 3, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                transition: 'all 0.12s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = `${rc}30`; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.04)'; }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{ROLE_ICONS[a.role]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{a.name}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${rc}20`, color: rc, fontWeight: 600, letterSpacing: 0.5 }}>
                    {a.role}
                  </span>
                  {a.provider && a.model && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                      {a.model}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc, boxShadow: `0 0 4px ${sc}`, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{a.visualState}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Add Form                                                      */
/* ------------------------------------------------------------------ */

function AgentAddForm() {
  const setMode = useStore((s) => s.setAgentPanelMode);
  const addAgentApi = useStore((s) => s.addAgentApi);
  const [form, setForm] = useState({ name: '', role: 'DEVELOPER', provider: 'anthropic', model: 'claude-sonnet-4-5', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const ollama = useOllamaModels(form.provider);
  const isOllama = form.provider === 'ollama';
  const models = isOllama ? ollama.models : (PROVIDER_MODELS[form.provider] ?? []);

  useEffect(() => {
    if (isOllama && ollama.models.length > 0 && !ollama.models.includes(form.model)) {
      setForm((prev) => ({ ...prev, model: ollama.models[0] }));
    }
  }, [isOllama, ollama.models, form.model]);

  const handleProviderChange = (provider: string) => {
    const firstModel = provider === 'ollama' ? '' : ((PROVIDER_MODELS[provider] ?? [])[0] ?? '');
    setForm({ ...form, provider, model: firstModel });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.model.trim()) return;
    setSaving(true);
    setFeedback(null);
    const ok = await addAgentApi({
      name: form.name.trim(), role: form.role, provider: form.provider,
      model: form.model.trim(), systemPrompt: form.systemPrompt.trim() || undefined,
    });
    setSaving(false);
    if (ok) { setFeedback({ ok: true, msg: '에이전트 추가 완료' }); setTimeout(() => setMode('list'), 800); }
    else setFeedback({ ok: false, msg: '추가 실패' });
  };

  return (
    <PanelShell title="에이전트 추가" onBack={() => setMode('list')}>
      <FormField label="이름" required>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Agent Name" style={inputStyle} />
      </FormField>
      <FormField label="역할" required>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={selectStyle}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </FormField>
      <FormField label="Provider" required>
        <select value={form.provider} onChange={(e) => handleProviderChange(e.target.value)} style={selectStyle}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </FormField>
      <FormField label={isOllama ? `Model (${ollama.loading ? '로딩...' : `${models.length}개`})` : 'Model'} required>
        {isOllama && ollama.error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ ...inputStyle, flex: 1, color: 'rgba(255,100,100,0.7)', fontSize: 11 }}>{ollama.error}</div>
            <button onClick={ollama.refetch} style={{ ...cancelBtnStyle, fontSize: 11, padding: '6px 10px', flexShrink: 0 }}>재시도</button>
          </div>
        ) : (
          <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} disabled={isOllama && ollama.loading} style={selectStyle}>
            {isOllama && ollama.loading && <option value="">불러오는 중...</option>}
            {isOllama && !ollama.loading && models.length === 0 && <option value="">모델 없음</option>}
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </FormField>
      <FormField label="System Prompt">
        <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} placeholder="(선택사항)" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      {feedback && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8, background: feedback.ok ? 'rgba(68,204,102,0.1)' : 'rgba(255,68,68,0.1)', color: feedback.ok ? '#44CC66' : '#FF4444' }}>
          {feedback.ok ? '✓' : '✗'} {feedback.msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => setMode('list')} style={cancelBtnStyle}>취소</button>
        <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.model.trim()} style={{ ...primaryBtnStyle, opacity: saving || !form.name.trim() || !form.model.trim() ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '추가'}
        </button>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Edit Form                                                     */
/* ------------------------------------------------------------------ */

function AgentEditForm({ agent }: { agent: { id: string; name: string; role: string; provider?: string; model?: string; systemPrompt?: string } }) {
  const setMode = useStore((s) => s.setAgentPanelMode);
  const updateAgentApi = useStore((s) => s.updateAgentApi);
  const [form, setForm] = useState({ name: agent.name, provider: agent.provider ?? 'anthropic', model: agent.model ?? '', systemPrompt: agent.systemPrompt ?? '' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const ollama = useOllamaModels(form.provider);
  const isOllama = form.provider === 'ollama';
  const models = isOllama ? ollama.models : (PROVIDER_MODELS[form.provider] ?? []);

  useEffect(() => {
    if (isOllama && ollama.models.length > 0 && !ollama.models.includes(form.model)) {
      setForm((prev) => ({ ...prev, model: ollama.models[0] }));
    }
  }, [isOllama, ollama.models, form.model]);

  const handleProviderChange = (provider: string) => {
    const firstModel = provider === 'ollama' ? '' : ((PROVIDER_MODELS[provider] ?? [])[0] ?? '');
    setForm({ ...form, provider, model: firstModel });
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const ok = await updateAgentApi(agent.id, { name: form.name.trim(), provider: form.provider, model: form.model.trim(), systemPrompt: form.systemPrompt.trim() || undefined });
    setSaving(false);
    if (ok) { setFeedback({ ok: true, msg: '수정 완료' }); setTimeout(() => setMode('detail'), 800); }
    else setFeedback({ ok: false, msg: '수정 실패' });
  };

  return (
    <PanelShell title={`${agent.name} 수정`} onBack={() => setMode('detail')}>
      <FormField label="이름">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
      </FormField>
      <FormField label="역할">
        <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.35)' }}>{agent.role}</div>
      </FormField>
      <FormField label="Provider">
        <select value={form.provider} onChange={(e) => handleProviderChange(e.target.value)} style={selectStyle}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </FormField>
      <FormField label={isOllama ? `Model (${ollama.loading ? '로딩...' : `${models.length}개`})` : 'Model'}>
        {isOllama && ollama.error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ ...inputStyle, flex: 1, color: 'rgba(255,100,100,0.7)', fontSize: 11 }}>{ollama.error}</div>
            <button onClick={ollama.refetch} style={{ ...cancelBtnStyle, fontSize: 11, padding: '6px 10px', flexShrink: 0 }}>재시도</button>
          </div>
        ) : (
          <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} disabled={isOllama && ollama.loading} style={selectStyle}>
            {isOllama && ollama.loading && <option value="">불러오는 중...</option>}
            {isOllama && !ollama.loading && models.length === 0 && <option value="">모델 없음</option>}
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
            {form.model && !models.includes(form.model) && <option value={form.model}>{form.model}</option>}
          </select>
        )}
      </FormField>
      <FormField label="System Prompt">
        <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      {feedback && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8, background: feedback.ok ? 'rgba(68,204,102,0.1)' : 'rgba(255,68,68,0.1)', color: feedback.ok ? '#44CC66' : '#FF4444' }}>
          {feedback.ok ? '✓' : '✗'} {feedback.msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => setMode('detail')} style={cancelBtnStyle}>취소</button>
        <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Button                                                       */
/* ------------------------------------------------------------------ */

function DeleteBtn({ agentId, agentName }: { agentId: string; agentName: string }) {
  const deleteAgentApi = useStore((s) => s.deleteAgentApi);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#FF4444' }}>{agentName} 삭제?</span>
        <button
          onClick={async () => {
            setDeleting(true);
            const ok = await deleteAgentApi(agentId);
            setDeleting(false);
            if (ok) { setSelectedAgentId(null); setMode('list'); }
          }}
          disabled={deleting}
          style={{ ...dangerBtnStyle, fontSize: 11, padding: '3px 8px' }}
        >
          {deleting ? '...' : '확인'}
        </button>
        <button onClick={() => setConfirming(false)} style={{ ...cancelBtnStyle, fontSize: 11, padding: '3px 8px' }}>취소</button>
      </div>
    );
  }
  return <ActionBtn label="삭제" color="#FF4444" onClick={() => setConfirming(true)} />;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginBottom: 5 }}>
      {children}
    </div>
  );
}

function PanelShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', top: 56, right: 0, zIndex: 20, width: 320,
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        background: 'rgba(10, 12, 28, 0.95)',
        borderLeft: '2px solid rgba(68,136,255,0.3)',
        borderBottom: '2px solid rgba(68,136,255,0.3)',
        borderBottomLeftRadius: 14,
        backdropFilter: 'blur(16px)',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: 0 }}>←</button>
        <span style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(68,136,255,0.7)', fontWeight: 600 }}>{title.toUpperCase()}</span>
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#FF4444' }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
      background: `${color}15`, border: `1px solid ${color}40`, color, transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, colorScheme: 'dark', appearance: 'auto' };
const cancelBtnStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  background: '#4488FF', border: 'none', color: '#fff',
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.4)', color: '#FF4444',
};

/* ------------------------------------------------------------------ */
/*  Utility                                                             */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
