export interface Project {
  id: string;
  name: string;
  description?: string;
  repoPath?: string;
  config: ProjectConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  defaultProvider: string;
  defaultModel: string;
  workflowsDir?: string;
  gitEnabled: boolean;
  maxConcurrentTasks: number;
}
