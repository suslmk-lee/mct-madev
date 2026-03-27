import { useStore } from '../store/useStore';
import { useState, useEffect } from 'react';

interface ProviderStatus {
  name: string;
  active: boolean;
}

export function HUD() {
  const connected = useStore((s) => s.connected);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const currentHour = useStore((s) => s.currentHour);
  const projectName = useStore((s) => s.currentProjectName);
  const repoPath = useStore((s) => s.currentRepoPath);
  const projectStatus = useStore((s) => s.projectStatus);
  const setModal = useStore((s) => s.setProjectModalOpen);
  const loadProjects = useStore((s) => s.loadProjects);
  const setAgentPanelMode = useStore((s) => s.setAgentPanelMode);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const cameraPreset = useStore((s) => s.cameraPreset);
  const setCameraPreset = useStore((s) => s.setCameraPreset);
  const apiError = useStore((s) => s.apiError);
  const setApiError = useStore((s) => s.setApiError);

  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  const fetchProviders = () => {
    fetch('/api/providers')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.providers) setProviders(d.providers); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchProviders();
    const id = setInterval(fetchProviders, 60_000);
    return () => clearInterval(id);
  }, []);

  const statusColor = projectStatus === 'ACTIVE' ? '#44CC66' : projectStatus === 'SUSPENDED' ? '#ffaa44' : projectStatus === 'CLOSED' ? '#888' : '#44CC66';
  const statusLabel = projectStatus === 'SUSPENDED' ? '일시중지' : projectStatus === 'CLOSED' ? '종료' : '';

  const activeTasks = tasks.filter(
    (t) => !['DONE', 'REJECTED', 'FAILED'].includes(t.status),
  ).length;
  const doneTasks = tasks.filter((t) => t.status === 'DONE').length;

  // Format time as HH:00 KST
  const timeStr = `${String(currentHour % 24).padStart(2, '0')}:${String(
    new Date().getMinutes(),
  ).padStart(2, '0')} KST`;

  return (
    <div className="fixed top-0 left-0 right-0 z-10 pointer-events-none">
      {apiError && (
        <div style={{
          background: 'rgba(200,60,60,0.92)',
          color: '#fff',
          fontSize: 12,
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'auto',
        }}>
          <span>⚠ {apiError}</span>
          <button onClick={() => setApiError(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-3">
        {/* Left: Project info */}
        <div className="pointer-events-auto flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-wide text-white">
            MCT-MADEV
          </h1>
          <button
            onClick={() => { loadProjects(); setModal(true, 'list'); }}
            className="text-xs font-medium"
            style={{
              background: 'rgba(68,136,255,0.12)',
              border: '1px solid rgba(68,136,255,0.25)',
              borderRadius: 6,
              padding: '3px 10px',
              color: '#88bbff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => { (e.target as HTMLElement).style.background = 'rgba(68,136,255,0.22)'; }}
            onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'rgba(68,136,255,0.12)'; }}
          >
            {projectName ?? 'Project'}
            {statusLabel && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: `${statusColor}22`, color: statusColor, fontWeight: 500,
              }}>
                {statusLabel}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                backgroundColor: connected ? '#44CC66' : '#FF4444',
                boxShadow: connected
                  ? '0 0 6px #44CC66'
                  : '0 0 6px #FF4444',
              }}
            />
            <span style={{ color: connected ? '#44CC66' : '#FF4444' }}>
              {connected ? 'Connected' : 'Offline'}
            </span>
          </div>
          {repoPath && (
            <span
              className="text-xs font-mono truncate max-w-[300px]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
              title={repoPath}
            >
              {repoPath}
            </span>
          )}
        </div>

        {/* Center: Time */}
        <div className="pointer-events-auto text-center">
          <div className="text-sm font-mono text-blue-300 tracking-widest">
            {timeStr}
          </div>
        </div>

        {/* Right: Agents + Task summary */}
        <div className="pointer-events-auto flex gap-4 text-xs items-center">
          <button
            onClick={() => { setSelectedAgentId(null); setAgentPanelMode('list'); }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'rgba(68,136,255,0.08)', border: '1px solid rgba(68,136,255,0.2)',
              borderRadius: 8, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(68,136,255,0.18)'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(68,136,255,0.08)'; }}
          >
            <span className="text-blue-400 font-bold text-base">{agents.length}</span>
            <span className="text-gray-500">Agents</span>
          </button>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex flex-col items-center">
            <span className="text-yellow-400 font-bold text-base">{activeTasks}</span>
            <span className="text-gray-500">Active</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-green-400 font-bold text-base">{doneTasks}</span>
            <span className="text-gray-500">Done</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-gray-300 font-bold text-base">{tasks.length}</span>
            <span className="text-gray-500">Total</span>
          </div>
          {providers.filter((p) => p.active).length > 0 && (
            <>
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />
              <div className="flex gap-1.5 items-center">
                {providers.filter((p) => p.active).map((p) => (
                  <span
                    key={p.name}
                    title={`${p.name} API key active`}
                    style={{
                      fontSize: 9, padding: '2px 5px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(68,204,102,0.12)', color: '#44CC66',
                      border: '1px solid rgba(68,204,102,0.3)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {p.name.slice(0, 3).toUpperCase()} ✓
                  </span>
                ))}
                <button
                  onClick={fetchProviders}
                  title="Refresh provider status"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 10, padding: '0 2px', lineHeight: 1 }}
                >
                  ↻
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Subtle top border glow */}
      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(68,136,255,0.4), rgba(68,204,102,0.4), rgba(255,136,68,0.4), transparent)',
        }}
      />

      {/* Camera preset bar - bottom center */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
          display: 'flex',
          gap: 4,
          padding: '4px 6px',
          background: 'rgba(10, 15, 30, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 10,
          borderTop: '1px solid rgba(68, 136, 255, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 0 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(68, 136, 255, 0.15)',
        }}
      >
        {([
          ['overview', '전체'],
          ['ceo', 'CEO'],
          ['pm', 'PM'],
          ['dev', 'Dev'],
          ['warroom', '회의실'],
          ['breakroom', '휴게실'],
        ] as const).map(([key, label]) => {
          const active = cameraPreset === key;
          return (
            <button
              key={key}
              onClick={() => setCameraPreset(key)}
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                color: active ? '#ddeeff' : 'rgba(255,255,255,0.45)',
                background: active
                  ? 'rgba(68,136,255,0.3)'
                  : 'rgba(255,255,255,0.04)',
                boxShadow: active
                  ? '0 0 8px rgba(68,136,255,0.3), inset 0 0 4px rgba(68,136,255,0.15)'
                  : 'none',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseOut={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)';
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
