export interface WorkflowDefinition {
  version: string;
  name: string;
  description?: string;
  agents: WorkflowAgentDef[];
  stages: WorkflowStage[];
}

export interface WorkflowAgentDef {
  id: string;
  role: string;
  provider: string;
  model: string;
  systemPrompt?: string;
}

export interface WorkflowStage {
  id: string;
  agent: string;
  prompt: string;
  dependsOn?: string[];
  outputs?: string[];
  timeout?: number;
  retries?: number;
}

export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  definition: WorkflowDefinition;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStageId?: string;
  results: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
