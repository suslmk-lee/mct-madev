import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { TaskStatus } from '../store/useStore';

const API_BASE = '/api';

const STATUS_COLORS: Record<TaskStatus, string> = {
  CREATED: '#888888',
  PLANNING: '#6688CC',
  REVIEWING: '#CC8844',
  APPROVED: '#44AA66',
  IN_PROGRESS: '#44BBAA',
  CODE_REVIEW: '#CCAA44',
  MERGING: '#4488CC',
  DONE: '#44CC66',
  REJECTED: '#CC4444',
  BLOCKED: '#CC6644',
  FAILED: '#CC3333',
};

const STATUS_ICONS: Record<string, string> = {
  CREATED: '\u25CB',    // ○
  PLANNING: '\u25CE',   // ◎
  REVIEWING: '\u25C9',  // ◉
  APPROVED: '\u2713',   // ✓
  IN_PROGRESS: '\u21BB', // ↻
  CODE_REVIEW: '\u2687', // ⚇
  MERGING: '\u21C4',    // ⇄
  DONE: '\u2714',       // ✔
  REJECTED: '\u2718',   // ✘
  BLOCKED: '\u26D4',    // ⛔
  FAILED: '\u2716',     // ✖
};

type FilterMode = 'active' | 'all' | 'done';

export function TaskList() {
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterMode>(() => {
    const saved = localStorage.getItem('mct-task-filter');
    return (saved as FilterMode) || 'active';
  });

  const handleFilterChange = (f: FilterMode) => {
    setFilter(f);
    localStorage.setItem('mct-task-filter', f);
  };
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const completedStatuses = ['DONE', 'REJECTED', 'FAILED'];

  // Separate root tasks from subtasks
  const rootTasks = tasks.filter((t) => !t.parentTaskId);
  const subtaskMap = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const existing = subtaskMap.get(t.parentTaskId) ?? [];
      existing.push(t);
      subtaskMap.set(t.parentTaskId, existing);
    }
  }

  const activeTasks = tasks.filter((t) => !completedStatuses.includes(t.status));
  const doneTasks = tasks.filter((t) => completedStatuses.includes(t.status));

  const filteredRootTasks = filter === 'active'
    ? rootTasks.filter((t) => {
        // Show root task if it has any active subtask, or is itself active
        const subs = subtaskMap.get(t.id) ?? [];
        const hasActiveSub = subs.some((s) => !completedStatuses.includes(s.status));
        return !completedStatuses.includes(t.status) || hasActiveSub;
      })
    : filter === 'done'
      ? rootTasks.filter((t) => {
          const subs = subtaskMap.get(t.id) ?? [];
          const allSubsDone = subs.length === 0 || subs.every((s) => completedStatuses.includes(s.status));
          return completedStatuses.includes(t.status) && allSubsDone;
        })
      : rootTasks;

  // If no root tasks, show flat list
  const showFlat = rootTasks.length === 0 && tasks.length > 0;
  const flatFiltered = filter === 'active'
    ? activeTasks
    : filter === 'done'
      ? doneTasks
      : tasks;

  const statusOrder: Record<string, number> = {
    IN_PROGRESS: 0, CODE_REVIEW: 1, REVIEWING: 2, PLANNING: 3,
    APPROVED: 4, MERGING: 5, CREATED: 6, BLOCKED: 7, DONE: 8, REJECTED: 9, FAILED: 10,
  };

  const sortByStatus = <T extends { status: string }>(arr: T[]) =>
    [...arr].sort((a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5));

  const sortedRoots = sortByStatus(filteredRootTasks);
  const sortedFlat = sortByStatus(flatFiltered);

  // Progress bar for a task group
  const getProgress = (taskId: string) => {
    const subs = subtaskMap.get(taskId) ?? [];
    if (subs.length === 0) return null;
    const done = subs.filter((s) => s.status === 'DONE').length;
    const failed = subs.filter((s) => s.status === 'FAILED').length;
    const inProgress = subs.filter((s) => s.status === 'IN_PROGRESS').length;
    return { total: subs.length, done, failed, inProgress };
  };

  const truncate = (s: string | undefined, max: number) => {
    if (!s) return '';
    return s.length > max ? s.slice(0, max) + '...' : s;
  };

  const renderTaskCard = (task: typeof tasks[0], isSubtask = false) => {
    const assignee = agents.find((a) => a.id === task.assigneeAgentId);
    const statusColor = STATUS_COLORS[task.status];
    const isDone = completedStatuses.includes(task.status);
    const isFailed = task.status === 'FAILED';
    const isActive = task.status === 'IN_PROGRESS';
    const progress = !isSubtask ? getProgress(task.id) : null;
    const isExpanded = expandedTaskId === task.id;
    const hasDetail = task.result || task.error;

    return (
      <div
        key={task.id}
        className="flex-shrink-0 rounded-lg"
        style={{
          width: isSubtask ? 200 : 260,
          background: isActive
            ? 'rgba(68, 187, 170, 0.06)'
            : isFailed
              ? 'rgba(204, 51, 51, 0.06)'
              : 'rgba(255,255,255,0.03)',
          border: `1px solid ${statusColor}${isActive ? '55' : '33'}`,
          opacity: isDone && !isFailed ? 0.6 : 1,
          cursor: hasDetail ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
        }}
        onClick={() => hasDetail && setExpandedTaskId(isExpanded ? null : task.id)}
      >
        {/* Header */}
        <div style={{ padding: '10px 12px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
            <span style={{ color: statusColor, fontSize: 13, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
              {STATUS_ICONS[task.status] ?? '\u25CF'}
            </span>
            <div style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {task.title}
            </div>
          </div>

          {/* Status + Assignee row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              backgroundColor: statusColor + '22',
              color: statusColor,
              border: `1px solid ${statusColor}44`,
            }}>
              {task.status}
            </span>
            {assignee && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {assignee.name.split('(')[0].trim()}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar for parent tasks */}
        {progress && (
          <div style={{ padding: '4px 12px 6px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 9,
              color: 'rgba(255,255,255,0.35)',
              marginBottom: 3,
            }}>
              <span>{progress.done}/{progress.total} done</span>
              {progress.failed > 0 && <span style={{ color: '#CC3333' }}>{progress.failed} failed</span>}
              {progress.inProgress > 0 && <span style={{ color: '#44BBAA' }}>{progress.inProgress} running</span>}
            </div>
            <div style={{
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              display: 'flex',
            }}>
              <div style={{
                width: `${(progress.done / progress.total) * 100}%`,
                background: '#44CC66',
                transition: 'width 0.3s ease',
              }} />
              <div style={{
                width: `${(progress.inProgress / progress.total) * 100}%`,
                background: '#44BBAA',
                transition: 'width 0.3s ease',
              }} />
              <div style={{
                width: `${(progress.failed / progress.total) * 100}%`,
                background: '#CC3333',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* Error display */}
        {isFailed && task.error && (
          <div style={{
            padding: '0 12px 8px',
            fontSize: 10,
            color: '#ff6b6b',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: isExpanded ? 10 : 2,
            WebkitBoxOrient: 'vertical' as const,
            wordBreak: 'break-all',
          }}>
            {task.error}
          </div>
        )}

        {/* Result preview (for done tasks) */}
        {task.status === 'DONE' && task.result && (
          <div style={{
            padding: '0 12px 8px',
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: isExpanded ? 10 : 2,
            WebkitBoxOrient: 'vertical' as const,
          }}>
            {truncate(task.result, isExpanded ? 500 : 80)}
          </div>
        )}

        {/* Action buttons */}
        {(isFailed || isActive || task.status === 'CREATED') && (
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            {/* Cancel button for running/pending tasks */}
            {(isActive || task.status === 'CREATED') && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`"${task.title}" 태스크를 취소하시겠습니까? 의존하는 태스크도 함께 취소됩니다.`)) return;
                  fetch(`${API_BASE}/tasks/${task.id}/cancel`, { method: 'POST' }).catch(() => {});
                }}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  background: 'rgba(150,100,50,0.15)', color: '#ffaa66',
                  border: '1px solid rgba(150,100,50,0.35)', transition: 'all 0.15s',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(150,100,50,0.3)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(150,100,50,0.15)'; }}
              >
                취소
              </button>
            )}
            {/* Retry button for failed tasks */}
            {isFailed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetch(`${API_BASE}/tasks/${task.id}/retry`, { method: 'POST' }).catch(() => {});
                }}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  background: 'rgba(204,51,51,0.15)', color: '#ff8888',
                  border: '1px solid rgba(204,51,51,0.35)', transition: 'all 0.15s',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(204,51,51,0.3)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(204,51,51,0.15)'; }}
              >
                재시도
              </button>
            )}
          </div>
        )}

        {/* Expand indicator */}
        {hasDetail && (
          <div style={{
            textAlign: 'center',
            padding: '0 0 4px',
            fontSize: 8,
            color: 'rgba(255,255,255,0.2)',
          }}>
            {isExpanded ? '\u25B2' : '\u25BC'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed bottom-0 left-0 z-10"
      style={{
        right: '0',
        background: 'rgba(10, 10, 26, 0.92)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-5 py-2">
        <button
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: 'none', border: 'none' }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Tasks
          </span>
          <span className="text-[10px] text-gray-500">
            {activeTasks.length > 0 && (
              <span style={{ color: '#44BBAA' }}>{activeTasks.length} active</span>
            )}
            {activeTasks.length > 0 && doneTasks.length > 0 && ' / '}
            {doneTasks.length > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>{doneTasks.length} done</span>
            )}
            {tasks.length > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.2)' }}> / {tasks.length} total</span>
            )}
          </span>
          <span className="text-gray-500 text-xs">{collapsed ? '\u25B2' : '\u25BC'}</span>
        </button>

        {/* Filter tabs */}
        {!collapsed && tasks.length > 0 && (
          <div className="flex gap-1">
            {(['active', 'all', 'done'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                className="px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors"
                style={{
                  background: filter === mode ? 'rgba(68,136,255,0.2)' : 'transparent',
                  color: filter === mode ? '#88bbff' : '#666',
                  border: filter === mode ? '1px solid rgba(68,136,255,0.3)' : '1px solid transparent',
                }}
                onClick={() => handleFilterChange(mode)}
              >
                {mode === 'active' ? 'Active' : mode === 'done' ? 'Done' : 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Task list */}
      {!collapsed && (
        <div
          className="overflow-x-auto overflow-y-auto px-4 pb-3"
          style={{
            maxHeight: expandedTaskId ? '240px' : '160px',
            transition: 'max-height 0.3s ease',
          }}
        >
          {(showFlat ? sortedFlat : sortedRoots).length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-4">
              {filter === 'active' ? 'No active tasks' : filter === 'done' ? 'No completed tasks' : 'No tasks'}
            </div>
          ) : showFlat ? (
            /* Flat list (no parent/child hierarchy) */
            <div className="flex gap-2 min-w-max pb-1">
              {sortedFlat.map((task) => renderTaskCard(task))}
            </div>
          ) : (
            /* Hierarchical: root tasks with expandable subtasks */
            <div className="flex gap-3 min-w-max pb-1">
              {sortedRoots.map((root) => {
                const subs = subtaskMap.get(root.id) ?? [];
                const sortedSubs = sortByStatus(subs);
                const filteredSubs = filter === 'active'
                  ? sortedSubs.filter((s) => !completedStatuses.includes(s.status))
                  : filter === 'done'
                    ? sortedSubs.filter((s) => completedStatuses.includes(s.status))
                    : sortedSubs;

                return (
                  <div key={root.id} className="flex gap-2 items-start">
                    {renderTaskCard(root)}
                    {filteredSubs.length > 0 && (
                      <div className="flex gap-1.5 items-start" style={{ paddingLeft: 2 }}>
                        {/* Connector line */}
                        <div style={{
                          width: 1,
                          alignSelf: 'stretch',
                          background: 'linear-gradient(180deg, rgba(68,136,255,0.3) 0%, rgba(68,136,255,0.05) 100%)',
                          marginRight: 4,
                          borderRadius: 1,
                        }} />
                        <div className="flex gap-1.5 flex-col">
                          {filteredSubs.map((sub) => renderTaskCard(sub, true))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
