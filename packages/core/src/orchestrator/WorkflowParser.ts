import YAML from 'yaml';
import type { WorkflowDefinition, WorkflowStage, WorkflowAgentDef } from '../types/workflow.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Parses and validates YAML workflow definitions.
 */
export class WorkflowParser {
  /**
   * Parse a YAML string into a WorkflowDefinition.
   * Throws if the YAML is malformed or the structure is invalid.
   */
  parse(yamlString: string): WorkflowDefinition {
    const raw = YAML.parse(yamlString);
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid YAML: expected an object at root');
    }

    const definition: WorkflowDefinition = {
      version: String(raw.version ?? '1'),
      name: String(raw.name ?? ''),
      description: raw.description ? String(raw.description) : undefined,
      agents: this.parseAgents(raw.agents),
      stages: this.parseStages(raw.stages),
    };

    const validation = this.validate(definition);
    if (!validation.valid) {
      const msgs = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`Invalid workflow definition: ${msgs}`);
    }

    return definition;
  }

  private parseAgents(raw: unknown): WorkflowAgentDef[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((a: Record<string, unknown>) => ({
      id: String(a.id ?? ''),
      role: String(a.role ?? ''),
      provider: String(a.provider ?? ''),
      model: String(a.model ?? ''),
      systemPrompt: a.systemPrompt ? String(a.systemPrompt) : undefined,
    }));
  }

  private parseStages(raw: unknown): WorkflowStage[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: Record<string, unknown>) => ({
      id: String(s.id ?? ''),
      agent: String(s.agent ?? ''),
      prompt: String(s.prompt ?? ''),
      dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : undefined,
      outputs: Array.isArray(s.outputs) ? s.outputs.map(String) : undefined,
      timeout: typeof s.timeout === 'number' ? s.timeout : undefined,
      retries: typeof s.retries === 'number' ? s.retries : undefined,
    }));
  }

  /**
   * Validate a WorkflowDefinition for completeness and correctness.
   */
  validate(definition: WorkflowDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required top-level fields
    if (!definition.name) {
      errors.push({ field: 'name', message: 'Workflow name is required' });
    }
    if (!definition.agents || definition.agents.length === 0) {
      errors.push({ field: 'agents', message: 'At least one agent is required' });
    }
    if (!definition.stages || definition.stages.length === 0) {
      errors.push({ field: 'stages', message: 'At least one stage is required' });
    }

    // Build agent ID set
    const agentIds = new Set(definition.agents.map((a) => a.id));
    const stageIds = new Set(definition.stages.map((s) => s.id));

    // Validate agents
    for (const agent of definition.agents) {
      if (!agent.id) {
        errors.push({ field: `agents`, message: 'Agent id is required' });
      }
      if (!agent.role) {
        errors.push({ field: `agents.${agent.id}.role`, message: 'Agent role is required' });
      }
      if (!agent.provider) {
        errors.push({
          field: `agents.${agent.id}.provider`,
          message: 'Agent provider is required',
        });
      }
      if (!agent.model) {
        errors.push({ field: `agents.${agent.id}.model`, message: 'Agent model is required' });
      }
    }

    // Validate stages
    for (const stage of definition.stages) {
      if (!stage.id) {
        errors.push({ field: 'stages', message: 'Stage id is required' });
      }
      if (!stage.prompt) {
        errors.push({ field: `stages.${stage.id}.prompt`, message: 'Stage prompt is required' });
      }

      // Check agent reference
      if (stage.agent && !agentIds.has(stage.agent)) {
        errors.push({
          field: `stages.${stage.id}.agent`,
          message: `References unknown agent "${stage.agent}"`,
        });
      }

      // Check dependsOn references
      if (stage.dependsOn) {
        for (const depId of stage.dependsOn) {
          if (!stageIds.has(depId)) {
            errors.push({
              field: `stages.${stage.id}.dependsOn`,
              message: `References unknown stage "${depId}"`,
            });
          }
        }
      }
    }

    // Check for circular dependencies among stages
    if (this.hasCircularDeps(definition.stages)) {
      errors.push({
        field: 'stages',
        message: 'Circular dependency detected among stages',
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private hasCircularDeps(stages: WorkflowStage[]): boolean {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const stage of stages) {
      color.set(stage.id, WHITE);
      adjList.set(stage.id, stage.dependsOn ?? []);
    }

    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      for (const dep of adjList.get(id) ?? []) {
        const c = color.get(dep);
        if (c === GRAY) return true;
        if (c === WHITE && visit(dep)) return true;
      }
      color.set(id, BLACK);
      return false;
    };

    for (const id of color.keys()) {
      if (color.get(id) === WHITE && visit(id)) return true;
    }
    return false;
  }
}
