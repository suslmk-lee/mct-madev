import { create } from 'zustand';

export type AgentVisualState =
  | 'IDLE'
  | 'WORKING'
  | 'COFFEE'
  | 'READING'
  | 'WALKING'
  | 'CHATTING'
  | 'NAPPING'
  | 'GAMING'
  | 'THINKING';

export type AgentRole = 'PM' | 'DEVELOPER' | 'REVIEWER' | 'TESTER' | 'DEVOPS';

export type TaskStatus =
  | 'CREATED'
  | 'PLANNING'
  | 'REVIEWING'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'CODE_REVIEW'
  | 'MERGING'
  | 'DONE'
  | 'REJECTED'
  | 'BLOCKED'
  | 'FAILED';

export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  visualState: AgentVisualState;
  position: { x: number; y: number; z: number };
  currentTaskId?: string;
}

export interface TaskState {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeAgentId?: string;
  description?: string;
  result?: string;
  error?: string;
  parentTaskId?: string;
}

export type LogLevel = 'info' | 'success' | 'error' | 'warn';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  detail?: string;
  timestamp: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sender?: string;
  timestamp: string;
}

interface AppStore {
  // Connection
  connected: boolean;
  setConnected: (v: boolean) => void;

  // Project
  currentProjectId: string | null;
  currentProjectName: string | null;
  currentRepoPath: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // Agents
  agents: AgentState[];
  setAgents: (agents: AgentState[]) => void;
  updateAgent: (id: string, updates: Partial<AgentState>) => void;
  removeAgent: (id: string) => void;

  // Tasks
  tasks: TaskState[];
  setTasks: (tasks: TaskState[]) => void;
  updateTask: (id: string, updates: Partial<TaskState>) => void;

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;

  // Status Log
  logEntries: LogEntry[];
  addLogEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLog: () => void;
  logOpen: boolean;
  setLogOpen: (v: boolean) => void;
  logUnread: number;
  resetLogUnread: () => void;

  // UI
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;

  // Time
  currentHour: number;
  setCurrentHour: (h: number) => void;

  // Data loading
  loadProject: (projectId: string) => Promise<void>;
}

// Default demo agents placed in their respective rooms
const defaultAgents: AgentState[] = [
  { id: 'agent-pm', name: 'Alice (PM)', role: 'PM', visualState: 'WORKING', position: { x: 0, y: 0, z: -6 } },
  { id: 'agent-dev1', name: 'Bob (Dev)', role: 'DEVELOPER', visualState: 'WORKING', position: { x: -3, y: 0, z: 1 } },
  { id: 'agent-dev2', name: 'Charlie (Dev)', role: 'DEVELOPER', visualState: 'THINKING', position: { x: 0, y: 0, z: 2 } },
  { id: 'agent-rev', name: 'Diana (Review)', role: 'REVIEWER', visualState: 'READING', position: { x: 5, y: 0, z: -2 } },
  { id: 'agent-test', name: 'Eve (Test)', role: 'TESTER', visualState: 'IDLE', position: { x: 5, y: 0, z: 2 } },
  { id: 'agent-ops', name: 'Frank (DevOps)', role: 'DEVOPS', visualState: 'COFFEE', position: { x: -5, y: 0, z: 6 } },
];

const defaultTasks: TaskState[] = [
  { id: 'task-1', title: 'Setup CI/CD Pipeline', status: 'DONE', assigneeAgentId: 'agent-ops' },
  { id: 'task-2', title: 'Implement Auth Module', status: 'IN_PROGRESS', assigneeAgentId: 'agent-dev1' },
  { id: 'task-3', title: 'Design API Schema', status: 'CODE_REVIEW', assigneeAgentId: 'agent-dev2' },
  { id: 'task-4', title: 'Write Integration Tests', status: 'PLANNING', assigneeAgentId: 'agent-test' },
  { id: 'task-5', title: 'Review PR #42', status: 'REVIEWING', assigneeAgentId: 'agent-rev' },
  { id: 'task-6', title: 'Sprint Planning', status: 'APPROVED', assigneeAgentId: 'agent-pm' },
];

const API_BASE = '/api';

export const useStore = create<AppStore>((set) => ({
  connected: false,
  setConnected: (v) => set({ connected: v }),

  currentProjectId: null,
  currentProjectName: null,
  currentRepoPath: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  removeAgent: (id) => set((state) => ({ agents: state.agents.filter((a) => a.id !== id) })),

  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  updateTask: (id, updates) =>
    set((state) => {
      const exists = state.tasks.some((t) => t.id === id);
      if (exists) {
        return { tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) };
      }
      // Upsert: add new task if it doesn't exist
      return { tasks: [...state.tasks, { id, title: '', status: 'CREATED' as TaskStatus, ...updates }] };
    }),

  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  setChatMessages: (msgs) => set({ chatMessages: msgs }),
  chatOpen: false,
  setChatOpen: (v) => set({ chatOpen: v }),

  logEntries: [],
  addLogEntry: (entry) =>
    set((state) => {
      const newEntry: LogEntry = {
        ...entry,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      const entries = [...state.logEntries, newEntry].slice(-200); // keep last 200
      return {
        logEntries: entries,
        logUnread: state.logOpen ? 0 : state.logUnread + 1,
      };
    }),
  clearLog: () => set({ logEntries: [], logUnread: 0 }),
  logOpen: false,
  setLogOpen: (v) => set((state) => ({ logOpen: v, logUnread: v ? 0 : state.logUnread })),
  logUnread: 0,
  resetLogUnread: () => set({ logUnread: 0 }),

  selectedAgentId: null,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  currentHour: new Date().getUTCHours() + 9, // KST
  setCurrentHour: (h) => set({ currentHour: h }),

  loadProject: async (projectId: string) => {
    try {
      const [projectRes, agentsRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}`),
        fetch(`${API_BASE}/projects/${projectId}/agents`),
        fetch(`${API_BASE}/projects/${projectId}/tasks`),
      ]);

      if (!agentsRes.ok || !tasksRes.ok) throw new Error('API error');

      const projectData = projectRes.ok ? await projectRes.json() : null;
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();

      set({
        currentProjectId: projectId,
        currentProjectName: projectData?.data?.name ?? null,
        currentRepoPath: projectData?.data?.repoPath ?? null,
        agents: agentsData.data ?? [],
        tasks: (tasksData.data ?? []).map((t: Record<string, unknown>) => ({
          id: t.id as string,
          title: t.title as string,
          status: t.status as TaskStatus,
          assigneeAgentId: t.assigneeAgentId as string | undefined,
          description: t.description as string | undefined,
          result: t.result as string | undefined,
          error: t.error as string | undefined,
          parentTaskId: t.parentTaskId as string | undefined,
        })),
      });
    } catch {
      // Fallback to demo data if API is unavailable
      set({
        currentProjectId: null,
        currentProjectName: null,
        currentRepoPath: null,
        agents: defaultAgents,
        tasks: defaultTasks,
      });
    }
  },
}));
