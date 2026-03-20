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

export function AgentDetailPanel() {
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);

  const agent = agents.find((a) => a.id === selectedAgentId);

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
        <h2 className="text-sm font-bold text-white">Agent Detail</h2>
        <button
          className="text-gray-400 hover:text-white text-lg leading-none cursor-pointer"
          onClick={() => setSelectedAgentId(null)}
        >
          x
        </button>
      </div>

      {/* Content */}
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
                backgroundColor:
                  agent.visualState === 'WORKING'
                    ? '#44CC66'
                    : agent.visualState === 'IDLE'
                      ? '#888'
                      : '#FFaa33',
                boxShadow: `0 0 6px ${agent.visualState === 'WORKING' ? '#44CC66' : '#FFaa33'}`,
              }}
            />
            <span className="text-sm text-gray-200">
              {agent.visualState} - {STATE_EMOJIS[agent.visualState] ?? agent.visualState}
            </span>
          </div>
        </div>

        {/* Position */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Position</div>
          <div className="text-xs font-mono text-gray-400">
            x: {agent.position.x.toFixed(1)}, y: {agent.position.y.toFixed(1)}, z:{' '}
            {agent.position.z.toFixed(1)}
          </div>
        </div>

        {/* Current Task */}
        {agentTask && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Task</div>
            <div
              className="rounded-lg p-3"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="text-sm text-white font-medium">{agentTask.title}</div>
              <div className="mt-1.5">
                <TaskStatusBadge status={agentTask.status} />
              </div>
            </div>
          </div>
        )}
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
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}
