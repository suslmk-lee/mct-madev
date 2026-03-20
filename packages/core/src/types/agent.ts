export const AgentRole = {
  PM: 'PM',
  DEVELOPER: 'DEVELOPER',
  REVIEWER: 'REVIEWER',
  TESTER: 'TESTER',
  DEVOPS: 'DEVOPS',
} as const;

export type AgentRole = (typeof AgentRole)[keyof typeof AgentRole];

export const AgentVisualState = {
  IDLE: 'IDLE',
  WORKING: 'WORKING',
  COFFEE: 'COFFEE',
  READING: 'READING',
  WALKING: 'WALKING',
  CHATTING: 'CHATTING',
  NAPPING: 'NAPPING',
  GAMING: 'GAMING',
  THINKING: 'THINKING',
} as const;

export type AgentVisualState = (typeof AgentVisualState)[keyof typeof AgentVisualState];

export const IDLE_BEHAVIOR_WEIGHTS: Record<string, number> = {
  COFFEE: 20,
  READING: 25,
  WALKING: 15,
  NAPPING: 10,
  GAMING: 15,
  CHATTING: 15,
};

export interface Agent {
  id: string;
  projectId: string;
  name: string;
  role: AgentRole;
  provider: string;
  model: string;
  systemPrompt?: string;
  visualState: AgentVisualState;
  position: { x: number; y: number; z: number };
  currentTaskId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function pickIdleBehavior(): AgentVisualState {
  const entries = Object.entries(IDLE_BEHAVIOR_WEIGHTS);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let rand = Math.random() * total;
  for (const [state, weight] of entries) {
    rand -= weight;
    if (rand <= 0) return state as AgentVisualState;
  }
  return AgentVisualState.IDLE;
}
