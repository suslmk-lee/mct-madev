import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { AgentRole } from '../store/useStore';

const ROLE_COLORS: Record<AgentRole, string> = {
  PM: '#4488FF',
  DEVELOPER: '#44CC66',
  REVIEWER: '#FF8844',
  TESTER: '#AA66DD',
  DEVOPS: '#DD4444',
};

const STATE_EMOJIS: Record<string, string> = {
  IDLE: 'Standing',
  WORKING: 'Typing away',
  COFFEE: 'Coffee break',
  READING: 'Reading docs',
  WALKING: 'On the move',
  CHATTING: 'In discussion',
  NAPPING: 'Power nap',
  GAMING: 'Quick game',
  THINKING: 'Deep thought',
};

const ROLES: AgentRole[] = ['PM', 'DEVELOPER', 'REVIEWER', 'TESTER', 'DEVOPS'];
const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'kimi', 'minimax', 'glm'];

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4', 'claude-sonnet-4-20250514'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: [],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  minimax: ['abab6.5-chat', 'abab5.5-chat'],
  glm: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
};

const OLLAMA_API = 'http://localhost:11434';

function useOllamaModels(provider: string) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    if (provider !== 'ollama') {
      setModels([]);
      setError(null);
      return;
    }
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

export function AgentDetailPanel() {
  const mode = useStore((s) => s.agentPanelMode);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);

  const agent = agents.find((a) => a.id === selectedAgentId);

  // Show list mode or when agent selected show detail
  if (mode === 'list') return <AgentListView />;
  if (mode === 'add') return <AgentAddForm />;
  if (mode === 'edit' && agent) return <AgentEditForm agent={agent} />;
  if (!agent) return null;

  const agentTask = tasks.find((t) => t.id === agent.currentTaskId || t.assigneeAgentId === agent.id);
  const roleColor = ROLE_COLORS[agent.role];

  return (
    <div
      className="fixed top-14 right-0 z-20 w-72 max-h-[calc(100vh-120px)] overflow-auto"
      style={{
        background: 'rgba(15, 15, 30, 0.92)',
        borderLeft: `2px solid ${roleColor}`,
        borderBottom: `2px solid ${roleColor}`,
        borderBottomLeftRadius: '12px',
        backdropFilter: 'blur(12px)',
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setMode('list')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14 }}
          >
            &larr;
          </button>
          <h2 className="text-sm font-bold text-white">Agent Detail</h2>
        </div>
        <button
          className="text-gray-400 hover:text-white text-lg leading-none cursor-pointer"
          onClick={() => setSelectedAgentId(null)}
          style={{ background: 'none', border: 'none' }}
        >
          &times;
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Name & Role */}
        <div>
          <div className="text-lg font-bold text-white">{agent.name}</div>
          <div
            className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold"
            style={{ backgroundColor: roleColor + '22', color: roleColor, border: `1px solid ${roleColor}44` }}
          >
            {agent.role}
          </div>
        </div>

        {/* State */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current State</div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: agent.visualState === 'WORKING' ? '#44CC66' : agent.visualState === 'IDLE' ? '#888' : '#FFaa33',
                boxShadow: `0 0 6px ${agent.visualState === 'WORKING' ? '#44CC66' : '#FFaa33'}`,
              }}
            />
            <span className="text-sm text-gray-200">
              {agent.visualState} - {STATE_EMOJIS[agent.visualState] ?? agent.visualState}
            </span>
          </div>
        </div>

        {/* Provider / Model */}
        {(agent.provider || agent.model) && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Model</div>
            <div className="text-xs font-mono text-gray-400">
              {agent.provider}/{agent.model}
            </div>
          </div>
        )}

        {/* System Prompt (truncated) */}
        {agent.systemPrompt && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">System Prompt</div>
            <div className="text-xs text-gray-400" style={{ maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {agent.systemPrompt.slice(0, 150)}{agent.systemPrompt.length > 150 ? '...' : ''}
            </div>
          </div>
        )}

        {/* Position */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Position</div>
          <div className="text-xs font-mono text-gray-400">
            x: {agent.position.x.toFixed(1)}, y: {agent.position.y.toFixed(1)}, z: {agent.position.z.toFixed(1)}
          </div>
        </div>

        {/* Current Task */}
        {agentTask && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Task</div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-sm text-white font-medium">{agentTask.title}</div>
              <div className="mt-1.5">
                <TaskStatusBadge status={agentTask.status} />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <ActionBtn label="수정" color="#4488FF" onClick={() => setMode('edit')} />
          <DeleteBtn agentId={agent.id} agentName={agent.name} />
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Agent List View ──

function AgentListView() {
  const agents = useStore((s) => s.agents);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);

  const handleClose = () => { setSelectedAgentId(null); setMode('detail'); };

  return (
    <div
      className="fixed top-14 right-0 z-20 w-80 max-h-[calc(100vh-120px)] overflow-auto"
      style={{
        background: 'rgba(15, 15, 30, 0.92)',
        borderLeft: '2px solid rgba(68,136,255,0.4)',
        borderBottom: '2px solid rgba(68,136,255,0.4)',
        borderBottomLeftRadius: '12px',
        backdropFilter: 'blur(12px)',
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-bold text-white">에이전트 ({agents.length})</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMode('add')}
            style={{
              background: 'rgba(68,136,255,0.15)', border: '1px solid rgba(68,136,255,0.3)',
              borderRadius: 6, padding: '3px 10px', color: '#4488FF', fontSize: 11, cursor: 'pointer',
            }}
          >
            + 추가
          </button>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}
          >
            &times;
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 12px' }}>
        {agents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            에이전트가 없습니다
          </div>
        )}
        {agents.map((a) => {
          const rc = ROLE_COLORS[a.role] ?? '#888';
          return (
            <div
              key={a.id}
              onClick={() => { setSelectedAgentId(a.id); setMode('detail'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', marginBottom: 4, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                transition: 'all 0.15s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
            >
              {/* Status dot */}
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: a.visualState === 'WORKING' ? '#44CC66' : a.visualState === 'IDLE' ? '#888' : '#FFaa33',
                }}
              />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{a.name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: `${rc}22`, color: rc, fontWeight: 500,
                  }}>
                    {a.role}
                  </span>
                  {a.provider && a.model && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                      {a.provider}/{a.model}
                    </span>
                  )}
                </div>
              </div>
              {/* State label */}
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                {a.visualState}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Agent Add Form ──

function AgentAddForm() {
  const setMode = useStore((s) => s.setAgentPanelMode);
  const addAgentApi = useStore((s) => s.addAgentApi);
  const [form, setForm] = useState({ name: '', role: 'DEVELOPER', provider: 'anthropic', model: 'claude-sonnet-4-5', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const ollama = useOllamaModels(form.provider);
  const isOllama = form.provider === 'ollama';
  const models = isOllama ? ollama.models : (PROVIDER_MODELS[form.provider] ?? []);

  // Ollama 모델 로드 완료 시 첫 번째 모델 자동 선택
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
      name: form.name.trim(),
      role: form.role,
      provider: form.provider,
      model: form.model.trim(),
      systemPrompt: form.systemPrompt.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setFeedback({ ok: true, msg: '에이전트 추가 완료' });
      setTimeout(() => setMode('list'), 800);
    } else {
      setFeedback({ ok: false, msg: '추가 실패' });
    }
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
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8,
          background: feedback.ok ? 'rgba(68,204,102,0.1)' : 'rgba(255,68,68,0.1)',
          color: feedback.ok ? '#44CC66' : '#FF4444',
        }}>
          {feedback.ok ? '✓' : '✗'} {feedback.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => setMode('list')} style={cancelBtnStyle}>취소</button>
        <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.model.trim()} style={{
          ...primaryBtnStyle,
          opacity: saving || !form.name.trim() || !form.model.trim() ? 0.5 : 1,
          cursor: saving ? 'wait' : 'pointer',
        }}>
          {saving ? '저장 중...' : '추가'}
        </button>
      </div>
    </PanelShell>
  );
}

// ── Agent Edit Form ──

function AgentEditForm({ agent }: { agent: { id: string; name: string; role: string; provider?: string; model?: string; systemPrompt?: string } }) {
  const setMode = useStore((s) => s.setAgentPanelMode);
  const updateAgentApi = useStore((s) => s.updateAgentApi);
  const [form, setForm] = useState({
    name: agent.name,
    provider: agent.provider ?? 'anthropic',
    model: agent.model ?? '',
    systemPrompt: agent.systemPrompt ?? '',
  });
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
    const ok = await updateAgentApi(agent.id, {
      name: form.name.trim(),
      provider: form.provider,
      model: form.model.trim(),
      systemPrompt: form.systemPrompt.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setFeedback({ ok: true, msg: '수정 완료' });
      setTimeout(() => setMode('detail'), 800);
    } else {
      setFeedback({ ok: false, msg: '수정 실패' });
    }
  };

  return (
    <PanelShell title={`${agent.name} 수정`} onBack={() => setMode('detail')}>
      <FormField label="이름">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
      </FormField>
      <FormField label="역할">
        <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.4)' }}>{agent.role}</div>
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
            {form.model && !models.includes(form.model) && (
              <option value={form.model}>{form.model}</option>
            )}
          </select>
        )}
      </FormField>
      <FormField label="System Prompt">
        <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>

      {feedback && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8,
          background: feedback.ok ? 'rgba(68,204,102,0.1)' : 'rgba(255,68,68,0.1)',
          color: feedback.ok ? '#44CC66' : '#FF4444',
        }}>
          {feedback.ok ? '✓' : '✗'} {feedback.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => setMode('detail')} style={cancelBtnStyle}>취소</button>
        <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </PanelShell>
  );
}

// ── Delete Button (with confirm) ──

function DeleteBtn({ agentId, agentName }: { agentId: string; agentName: string }) {
  const deleteAgentApi = useStore((s) => s.deleteAgentApi);
  const setMode = useStore((s) => s.setAgentPanelMode);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#FF4444' }}>삭제?</span>
        <button
          onClick={async () => {
            setDeleting(true);
            const ok = await deleteAgentApi(agentId);
            setDeleting(false);
            if (ok) {
              setSelectedAgentId(null);
              setMode('list');
            }
          }}
          disabled={deleting}
          style={{ ...dangerBtnStyle, fontSize: 11, padding: '3px 8px' }}
        >
          {deleting ? '...' : '확인'}
        </button>
        <button onClick={() => setConfirming(false)} style={{ ...cancelBtnStyle, fontSize: 11, padding: '3px 8px' }}>
          취소
        </button>
      </div>
    );
  }

  return <ActionBtn label="삭제" color="#FF4444" onClick={() => setConfirming(true)} />;
}

// ── Shared UI helpers ──

function PanelShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed top-14 right-0 z-20 w-80 max-h-[calc(100vh-120px)] overflow-auto"
      style={{
        background: 'rgba(15, 15, 30, 0.92)',
        borderLeft: '2px solid rgba(68,136,255,0.4)',
        borderBottom: '2px solid rgba(68,136,255,0.4)',
        borderBottomLeftRadius: '12px',
        backdropFilter: 'blur(12px)',
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14 }}>
            &larr;
          </button>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#FF4444' }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: `${color}15`, border: `1px solid ${color}40`, color,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    CREATED: { bg: '#555', text: '#ccc' },
    PLANNING: { bg: '#335', text: '#88aaff' },
    REVIEWING: { bg: '#553', text: '#ffaa44' },
    APPROVED: { bg: '#353', text: '#44cc66' },
    IN_PROGRESS: { bg: '#354', text: '#44ddaa' },
    CODE_REVIEW: { bg: '#543', text: '#ffbb55' },
    MERGING: { bg: '#345', text: '#55bbff' },
    DONE: { bg: '#252', text: '#44cc66' },
    REJECTED: { bg: '#522', text: '#ff4444' },
    BLOCKED: { bg: '#532', text: '#ff6644' },
    FAILED: { bg: '#511', text: '#ff3333' },
  };
  const colors = colorMap[status] ?? { bg: '#333', text: '#999' };
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  colorScheme: 'dark',
  appearance: 'auto',
};

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
