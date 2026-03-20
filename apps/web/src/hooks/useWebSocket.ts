import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

const WS_URL = `ws://${window.location.hostname}:${window.location.port || '3000'}/ws`;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setConnected, setAgents, updateAgent, removeAgent, setTasks, updateTask, setCurrentHour, addChatMessage, addLogEntry } =
    useStore();
  const currentProjectId = useStore((s) => s.currentProjectId);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttempt.current = 0;

        // Subscribe to current project if one is set
        const projectId = useStore.getState().currentProjectId;
        if (projectId) {
          ws.send(JSON.stringify({ type: 'subscribe', projectId }));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      scheduleReconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
      RECONNECT_MAX_MS,
    );
    reconnectAttempt.current += 1;
    reconnectTimer.current = setTimeout(connect, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  const handleMessage = useCallback(
    (msg: { type: string; payload?: unknown }) => {
      const p = msg.payload as Record<string, unknown> | undefined;
      switch (msg.type) {
        case 'agents:sync':
          if (Array.isArray(msg.payload)) setAgents(msg.payload as never);
          break;
        case 'agent:update':
          if (p?.id) {
            updateAgent(p.id as string, p as never);
            // Log agent state changes (only WORKING state transitions)
            if (p.visualState === 'WORKING') {
              addLogEntry({ level: 'info', message: `${p.name ?? p.id} started working` });
            } else if (p.visualState === 'IDLE') {
              // Check if transitioning from WORKING → IDLE
              const prev = useStore.getState().agents.find((a) => a.id === p!.id);
              if (prev?.visualState === 'WORKING') {
                addLogEntry({ level: 'info', message: `${p.name ?? prev.name ?? p.id} finished work` });
              }
            }
          }
          break;
        case 'tasks:sync':
          if (Array.isArray(msg.payload)) {
            setTasks(
              (msg.payload as Record<string, unknown>[]).map((t) => ({
                id: t.id as string,
                title: t.title as string,
                status: t.status as string,
                assigneeAgentId: t.assigneeAgentId as string | undefined,
                description: t.description as string | undefined,
                result: t.result as string | undefined,
                error: t.error as string | undefined,
                parentTaskId: t.parentTaskId as string | undefined,
              })) as never,
            );
          }
          break;
        case 'task:update':
          if (p?.id) {
            const taskTitle = (p.title as string) || useStore.getState().tasks.find((t) => t.id === p!.id)?.title || 'Task';
            const status = p.status as string | undefined;

            updateTask(p.id as string, {
              ...(p.title && { title: p.title as string }),
              ...(p.status && { status: p.status as string }),
              ...(p.assigneeAgentId !== undefined && { assigneeAgentId: p.assigneeAgentId as string }),
              ...(p.description !== undefined && { description: p.description as string }),
              ...(p.result !== undefined && { result: p.result as string }),
              ...(p.error !== undefined && { error: p.error as string }),
              ...(p.parentTaskId !== undefined && { parentTaskId: p.parentTaskId as string }),
            } as never);

            // Log task status changes
            if (status === 'CREATED') {
              addLogEntry({ level: 'info', message: `Task created: ${taskTitle}` });
            } else if (status === 'IN_PROGRESS') {
              const agent = p.assigneeAgentId
                ? useStore.getState().agents.find((a) => a.id === p!.assigneeAgentId)
                : undefined;
              addLogEntry({
                level: 'info',
                message: `${taskTitle} started`,
                detail: agent ? `Assigned to ${agent.name}` : undefined,
              });
            } else if (status === 'DONE') {
              const result = p.result as string | undefined;
              addLogEntry({
                level: 'success',
                message: `${taskTitle} completed`,
                detail: result ? result.slice(0, 200) : undefined,
              });
            } else if (status === 'FAILED') {
              const error = p.error as string | undefined;
              addLogEntry({
                level: 'error',
                message: `${taskTitle} failed`,
                detail: error || undefined,
              });
            }
          }
          break;
        case 'time:update':
          if (typeof p?.hour === 'number') setCurrentHour(p.hour as number);
          break;
        case 'chat:message':
          if (p?.content) {
            addChatMessage({
              role: (p.role as 'user' | 'assistant') ?? 'assistant',
              content: p.content as string,
              sender: p.sender as string | undefined,
              timestamp: (p.timestamp as string) ?? new Date().toISOString(),
            });
          }
          break;
        case 'agent:deleted':
          if (p?.id) removeAgent(p.id as string);
          break;
        case 'project:status_changed':
          if (p?.newStatus) {
            useStore.getState().projectStatus !== p.newStatus &&
              useStore.setState({ projectStatus: p.newStatus as 'ACTIVE' | 'SUSPENDED' | 'CLOSED' });
            const statusLabel = p.newStatus === 'ACTIVE' ? '프로젝트 재개' : p.newStatus === 'SUSPENDED' ? '프로젝트 일시중지' : '프로젝트 종료';
            addLogEntry({ level: 'info', message: statusLabel });
            // Refresh projects list
            useStore.getState().loadProjects();
          }
          break;
        case 'subscribed':
          // Subscription confirmed
          break;
        default:
          break;
      }
    },
    [setAgents, updateAgent, removeAgent, setTasks, updateTask, setCurrentHour, addChatMessage, addLogEntry],
  );

  const send = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Subscribe when project changes
  useEffect(() => {
    if (currentProjectId && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', projectId: currentProjectId }));
    }
  }, [currentProjectId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update KST time every minute
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const kstHour = (now.getUTCHours() + 9) % 24;
      setCurrentHour(kstHour);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [setCurrentHour]);

  return { send, connected: useStore((s) => s.connected) };
}
