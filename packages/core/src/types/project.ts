export type ProjectStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

/** Goal hierarchy for a project — informs agents of the "why" behind every task */
export interface ProjectGoals {
  /** Top-level mission statement, e.g. "Build the #1 AI note-taking app to $1M MRR" */
  mission?: string;
  /** Current strategy or focus area */
  strategy?: string;
  /** Key results / OKRs — short bullet strings */
  okrs?: string[];
}

export type TeamPreset = 'fullstack' | 'frontend' | 'backend' | 'minimal';

export interface TeamRoleDef {
  role: string;
  count: number;
}

export const TEAM_PRESETS: Record<TeamPreset, TeamRoleDef[]> = {
  fullstack: [
    { role: 'PM', count: 1 },
    { role: 'DEVELOPER', count: 2 },
    { role: 'REVIEWER', count: 1 },
    { role: 'TESTER', count: 1 },
    { role: 'DEVOPS', count: 1 },
  ],
  frontend: [
    { role: 'PM', count: 1 },
    { role: 'DEVELOPER', count: 3 },
    { role: 'REVIEWER', count: 1 },
  ],
  backend: [
    { role: 'PM', count: 1 },
    { role: 'DEVELOPER', count: 2 },
    { role: 'TESTER', count: 1 },
    { role: 'DEVOPS', count: 1 },
  ],
  minimal: [
    { role: 'PM', count: 1 },
    { role: 'DEVELOPER', count: 1 },
  ],
};

export interface Project {
  id: string;
  name: string;
  description?: string;
  repoPath?: string;
  goals?: ProjectGoals;
  config: ProjectConfig;
  createdAt: string;
  updatedAt: string;
  status?: ProjectStatus;
}

export interface ProjectConfig {
  defaultProvider: string;
  defaultModel: string;
  workflowsDir?: string;
  gitEnabled: boolean;
  maxConcurrentTasks: number;
}
