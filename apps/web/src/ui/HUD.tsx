import { useStore } from '../store/useStore';

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
    </div>
  );
}
