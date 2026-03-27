import { useState } from 'react';
import { useStore, type ProjectStatus } from '../store/useStore';

const TEAM_PRESETS = [
  { id: 'fullstack', label: '풀스택 팀', desc: 'PM + Dev x2 + Reviewer + Tester + DevOps', count: 6 },
  { id: 'frontend', label: '프론트엔드 팀', desc: 'PM + FE Dev x3 + Reviewer', count: 5 },
  { id: 'backend', label: '백엔드 팀', desc: 'PM + BE Dev x2 + Tester + DevOps', count: 5 },
  { id: 'minimal', label: '최소 팀', desc: 'PM + Dev', count: 2 },
] as const;

const STATUS_COLORS: Record<ProjectStatus, string> = {
  ACTIVE: '#44CC66',
  SUSPENDED: '#ffaa44',
  CLOSED: '#888888',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: '활성',
  SUSPENDED: '일시중지',
  CLOSED: '종료',
};

export function ProjectModal() {
  const open = useStore((s) => s.projectModalOpen);
  const mode = useStore((s) => s.projectModalMode);
  const setModal = useStore((s) => s.setProjectModalOpen);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const projectStatus = useStore((s) => s.projectStatus);
  const loadProject = useStore((s) => s.loadProject);
  const loadProjects = useStore((s) => s.loadProjects);
  const createProject = useStore((s) => s.createProject);
  const suspendProject = useStore((s) => s.suspendProject);
  const closeProject = useStore((s) => s.closeProject);
  const resumeProject = useStore((s) => s.resumeProject);

  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [desc, setDesc] = useState('');
  const [preset, setPreset] = useState('fullstack');
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setFeedback(null);
    const result = await createProject({
      name: name.trim(),
      repoPath: repoPath.trim() || undefined,
      description: desc.trim() || undefined,
      teamPreset: preset,
    });
    setCreating(false);
    if (result && 'id' in result) {
      setFeedback({ type: 'success', message: `프로젝트 '${name.trim()}' 생성 완료` });
      setName('');
      setRepoPath('');
      setDesc('');
    } else if (result && 'error' in result) {
      setFeedback({ type: 'error', message: result.error });
    } else {
      setFeedback({ type: 'error', message: '프로젝트 생성 실패. 서버 연결을 확인하세요.' });
    }
  };

  const handleSuspend = async () => {
    setActionLoading('suspend');
    await suspendProject();
    setActionLoading(null);
  };

  const handleClose = async () => {
    setActionLoading('close');
    await closeProject();
    setActionLoading(null);
  };

  const handleResume = async (id: string) => {
    setActionLoading(`resume-${id}`);
    await resumeProject(id);
    setActionLoading(null);
  };

  const handleSwitch = async (id: string) => {
    setActionLoading(`switch-${id}`);
    await loadProject(id);
    await loadProjects();
    setActionLoading(null);
    setModal(false);
  };

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const otherProjects = projects.filter((p) => p.id !== currentProjectId);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={() => setModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: mode === 'create' ? 480 : 520,
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'rgba(12, 16, 32, 0.95)',
          border: '1px solid rgba(68, 136, 255, 0.25)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          padding: 0,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {mode === 'create' && (
              <button
                onClick={() => setModal(true, 'list')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}
              >
                &larr;
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>
              {mode === 'create' ? '새 프로젝트 생성' : '프로젝트 관리'}
            </h2>
          </div>
          <button
            onClick={() => setModal(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        {mode === 'list' ? (
          <div style={{ padding: '16px 24px 24px' }}>
            {/* Current Project */}
            {currentProject && (
              <div style={{
                background: 'rgba(68, 136, 255, 0.08)',
                border: '1px solid rgba(68, 136, 255, 0.2)',
                borderRadius: 12, padding: 16, marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{currentProject.name}</span>
                    <span style={{
                      marginLeft: 8, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                      background: `${STATUS_COLORS[projectStatus ?? 'ACTIVE']}22`,
                      color: STATUS_COLORS[projectStatus ?? 'ACTIVE'],
                    }}>
                      {STATUS_LABELS[projectStatus ?? 'ACTIVE']}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>현재 프로젝트</span>
                </div>
                {currentProject.repoPath && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                    {currentProject.repoPath}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(projectStatus === 'ACTIVE' || !projectStatus) && (
                    <>
                      <ActionButton
                        label="일시중지"
                        color="#ffaa44"
                        loading={actionLoading === 'suspend'}
                        onClick={handleSuspend}
                      />
                      <ActionButton
                        label="종료"
                        color="#FF4444"
                        loading={actionLoading === 'close'}
                        onClick={handleClose}
                      />
                    </>
                  )}
                  {projectStatus === 'SUSPENDED' && (
                    <>
                      <ActionButton
                        label="재개"
                        color="#44CC66"
                        loading={actionLoading === `resume-${currentProject.id}`}
                        onClick={() => handleResume(currentProject.id)}
                      />
                      <ActionButton
                        label="종료"
                        color="#FF4444"
                        loading={actionLoading === 'close'}
                        onClick={handleClose}
                      />
                    </>
                  )}
                  {projectStatus === 'CLOSED' && (
                    <ActionButton
                      label="재개"
                      color="#44CC66"
                      loading={actionLoading === `resume-${currentProject.id}`}
                      onClick={() => handleResume(currentProject.id)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Other Projects */}
            {otherProjects.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>다른 프로젝트</div>
                {otherProjects.map((p) => (
                  <div key={p.id} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                      <span style={{
                        marginLeft: 8, padding: '2px 6px', borderRadius: 8, fontSize: 10,
                        background: `${STATUS_COLORS[p.status]}22`,
                        color: STATUS_COLORS[p.status],
                      }}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      {p.repoPath && (
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                          {p.repoPath}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.status === 'ACTIVE' && (
                        <ActionButton label="전환" color="#4488FF" loading={actionLoading === `switch-${p.id}`} onClick={() => handleSwitch(p.id)} small />
                      )}
                      {p.status === 'SUSPENDED' && (
                        <ActionButton label="재개" color="#44CC66" loading={actionLoading === `resume-${p.id}`} onClick={() => handleResume(p.id)} small />
                      )}
                      {p.status === 'CLOSED' && (
                        <ActionButton label="재개" color="#44CC66" loading={actionLoading === `resume-${p.id}`} onClick={() => handleResume(p.id)} small />
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* New Project Button */}
            <button
              onClick={() => setModal(true, 'create')}
              style={{
                marginTop: 16, width: '100%', padding: '12px 0',
                background: 'linear-gradient(135deg, rgba(68,136,255,0.15), rgba(68,204,102,0.1))',
                border: '1px dashed rgba(68,136,255,0.3)',
                borderRadius: 10, color: '#4488FF', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(68,136,255,0.25), rgba(68,204,102,0.15))'; }}
              onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(68,136,255,0.15), rgba(68,204,102,0.1))'; }}
            >
              + 새 프로젝트
            </button>
          </div>
        ) : (
          /* Create Mode */
          <div style={{ padding: '16px 24px 24px' }}>
            {/* Name */}
            <FieldLabel label="프로젝트 이름" required />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-web-app"
              style={inputStyle}
            />

            {/* Workspace Path */}
            <FieldLabel label="워크스페이스 경로" />
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="비워두면 ~/mct-madev-projects/{이름} 자동 생성"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />

            {/* Description */}
            <FieldLabel label="설명" />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="프로젝트 설명 (선택)"
              style={inputStyle}
            />

            {/* Team Preset */}
            <FieldLabel label="팀 구성" required />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {TEAM_PRESETS.map((tp) => (
                <label
                  key={tp.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    background: preset === tp.id ? 'rgba(68,136,255,0.12)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${preset === tp.id ? 'rgba(68,136,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={preset === tp.id}
                    onChange={() => setPreset(tp.id)}
                    style={{ accentColor: '#4488FF' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>
                      {tp.label}
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        ({tp.count}명)
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {tp.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Feedback */}
            {feedback && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
                background: feedback.type === 'success' ? 'rgba(68,204,102,0.12)' : 'rgba(255,68,68,0.12)',
                border: `1px solid ${feedback.type === 'success' ? 'rgba(68,204,102,0.3)' : 'rgba(255,68,68,0.3)'}`,
                color: feedback.type === 'success' ? '#44CC66' : '#FF4444',
              }}>
                {feedback.type === 'success' ? '✓ ' : '✗ '}{feedback.message}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModal(true, 'list')}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                style={{
                  padding: '8px 24px', borderRadius: 8,
                  background: name.trim() && !creating ? '#4488FF' : 'rgba(68,136,255,0.3)',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 500,
                  cursor: name.trim() && !creating ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                {creating ? '생성 중...' : '프로젝트 생성'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, marginTop: 12 }}>
      {label}
      {required && <span style={{ color: '#FF4444', marginLeft: 2 }}>*</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

function ActionButton({ label, color, loading, onClick, small }: {
  label: string; color: string; loading: boolean; onClick: () => void; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: small ? '4px 12px' : '6px 16px',
        borderRadius: 6,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        color,
        fontSize: small ? 11 : 12,
        fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {loading ? '...' : label}
    </button>
  );
}
