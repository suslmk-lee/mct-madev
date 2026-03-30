import type { Project } from './project.js';
import type { Agent } from './agent.js';

/** Portable snapshot of a project + its agents (no tasks, no messages). */
export interface ProjectTemplate {
  /** Schema version for forward compatibility */
  version: '1';
  exportedAt: string;
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
  agents: Array<Omit<Agent, 'id' | 'projectId' | 'currentTaskId' | 'createdAt' | 'updatedAt' | 'visualState' | 'position'>>;
}
