import { EventEmitter } from 'events';
import type { Task } from '../types/task.js';
import type { Agent } from '../types/agent.js';
import type { Workflow, WorkflowDefinition } from '../types/workflow.js';
import type { ChatMessage, ChatResponse } from '../types/model.js';
import type { ChatOptions, ExtendedChatResponse } from '../skills/types.js';
import type { SystemEvent, TaskStatusPayload, AgentStatePayload, WorkflowStatusPayload } from '../types/events.js';
import { TaskStatus, TaskStateMachine } from '../types/task.js';
import { AgentRole, AgentVisualState } from '../types/agent.js';
import { EventType } from '../types/events.js';
import { TaskDAG } from './TaskDAG.js';
import { assignPosition } from '../utils/positions.js';

/**
 * Database abstraction so Orchestrator doesn't depend on @mct-madev/db directly.
 */
export interface OrchestratorDeps {
  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>;
  getTask: (id: string) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  listTasks: (projectId: string, filters?: { status?: string }) => Promise<Task[]>;
  createAgent: (agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Agent>;
  listAgents: (projectId: string) => Promise<Agent[]>;
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<Agent>;
  createWorkflow: (wf: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Workflow>;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<Workflow>;
}

export type GatewayChatFn = (
  provider: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  options?: ChatOptions,
) => Promise<ChatResponse | ExtendedChatResponse>;

export interface OrchestratorConfig {
  db: OrchestratorDeps;
  chat: GatewayChatFn;
  eventEmitter: EventEmitter;
}

export interface WorkflowStatus {
  workflow: Workflow;
  tasks: Task[];
  agents: Agent[];
  dag: TaskDAG;
}

/**
 * Central orchestration coordinator.
 *
 * Manages workflows by creating tasks from definitions, tracking their
 * dependencies via TaskDAG, assigning them to agents, and executing them
 * through the gateway chat function.
 */
export class Orchestrator {
  private db: OrchestratorDeps;
  private chat: GatewayChatFn;
  private emitter: EventEmitter;
  private stateMachine: TaskStateMachine;
  private dags: Map<string, TaskDAG> = new Map();
  private workflows: Map<string, Workflow> = new Map();

  constructor(config: OrchestratorConfig) {
    this.db = config.db;
    this.chat = config.chat;
    this.emitter = config.eventEmitter;
    this.stateMachine = new TaskStateMachine();
  }

  /**
   * Create a workflow from a definition, instantiating agents and tasks.
   */
  async startWorkflow(projectId: string, workflowDef: WorkflowDefinition): Promise<Workflow> {
    // Create workflow record
    const workflow = await this.db.createWorkflow({
      projectId,
      name: workflowDef.name,
      definition: workflowDef,
      status: 'RUNNING',
      currentStageId: workflowDef.stages[0]?.id,
      results: {},
    });
    this.workflows.set(workflow.id, workflow);

    // Create agents from definition with auto-positioned placement
    const agentMap = new Map<string, Agent>();
    const existingAgents = await this.db.listAgents(projectId);
    const allAgents = [...existingAgents];

    for (const agentDef of workflowDef.agents) {
      const role = agentDef.role as Agent['role'];
      const position = assignPosition(role, allAgents);

      const agent = await this.db.createAgent({
        projectId,
        name: `${agentDef.role}-${agentDef.id}`,
        role,
        provider: agentDef.provider,
        model: agentDef.model,
        systemPrompt: agentDef.systemPrompt,
        visualState: AgentVisualState.IDLE,
        position,
        metadata: { workflowAgentId: agentDef.id },
      });
      agentMap.set(agentDef.id, agent);
      allAgents.push(agent);
    }

    // Create tasks from stages
    const dag = new TaskDAG();
    const stageToTaskId = new Map<string, string>();

    // First pass: create tasks
    for (const stage of workflowDef.stages) {
      const assigneeAgent = agentMap.get(stage.agent);
      const task = await this.db.createTask({
        projectId,
        workflowId: workflow.id,
        title: stage.id,
        description: stage.prompt,
        status: TaskStatus.CREATED,
        assigneeAgentId: assigneeAgent?.id,
        priority: 5,
        dependencies: [],
        metadata: {
          stageId: stage.id,
          outputs: stage.outputs ?? [],
          timeout: stage.timeout,
          retries: stage.retries ?? 0,
        },
      });
      stageToTaskId.set(stage.id, task.id);
      dag.addTask(task);
    }

    // Second pass: wire up dependencies using resolved task IDs
    for (const stage of workflowDef.stages) {
      if (stage.dependsOn) {
        const taskId = stageToTaskId.get(stage.id)!;
        for (const depStageId of stage.dependsOn) {
          const depTaskId = stageToTaskId.get(depStageId);
          if (depTaskId) {
            dag.addDependency(taskId, depTaskId);
          }
        }
      }
    }

    this.dags.set(workflow.id, dag);

    this.emitEvent(EventType.WORKFLOW_STATUS_CHANGED, {
      workflowId: workflow.id,
      previousStatus: 'PENDING',
      newStatus: 'RUNNING',
    } satisfies WorkflowStatusPayload);

    return workflow;
  }

  /**
   * Find ready tasks in the DAG and execute them by assigning to agents.
   */
  async processNextTasks(projectId: string): Promise<Task[]> {
    const processed: Task[] = [];

    for (const [workflowId, dag] of this.dags) {
      const workflow = this.workflows.get(workflowId);
      if (!workflow || workflow.projectId !== projectId) continue;
      if (workflow.status !== 'RUNNING') continue;

      const readyTasks = dag.getReadyTasks();
      for (const task of readyTasks) {
        if (task.status !== TaskStatus.CREATED) continue;

        try {
          const executed = await this.executeTask(task, dag);
          processed.push(executed);
        } catch (error) {
          await this.handleTaskFailed(
            task.id,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      // Check if workflow is complete
      if (dag.isComplete()) {
        await this.completeWorkflow(workflowId);
      }
    }

    return processed;
  }

  /**
   * Handle successful task completion.
   */
  async handleTaskComplete(taskId: string, result: string): Promise<Task> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const previousStatus = task.status;
    // Transition through the pipeline to DONE
    let updated = this.advanceToDone(task);
    updated = { ...updated, result };
    updated = await this.db.updateTask(taskId, {
      status: updated.status,
      result,
      updatedAt: new Date().toISOString(),
    });

    // Update DAG
    if (task.workflowId) {
      const dag = this.dags.get(task.workflowId);
      if (dag) dag.updateTask(updated);
    }

    // Free up the agent
    if (task.assigneeAgentId) {
      await this.updateAgentState(task.assigneeAgentId, AgentVisualState.IDLE);
    }

    this.emitEvent(EventType.TASK_STATUS_CHANGED, {
      taskId,
      previousStatus,
      newStatus: updated.status,
      agentId: task.assigneeAgentId,
    } satisfies TaskStatusPayload);

    return updated;
  }

  /**
   * Handle task failure.
   */
  async handleTaskFailed(taskId: string, error: string): Promise<Task> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const previousStatus = task.status;
    let newStatus: TaskStatus = TaskStatus.FAILED;
    if (this.stateMachine.canTransition(task.status, TaskStatus.FAILED)) {
      newStatus = TaskStatus.FAILED;
    }

    const updated = await this.db.updateTask(taskId, {
      status: newStatus,
      error,
      updatedAt: new Date().toISOString(),
    });

    // Update DAG
    if (task.workflowId) {
      const dag = this.dags.get(task.workflowId);
      if (dag) dag.updateTask(updated);
    }

    // Free up the agent
    if (task.assigneeAgentId) {
      await this.updateAgentState(task.assigneeAgentId, AgentVisualState.IDLE);
    }

    this.emitEvent(EventType.TASK_STATUS_CHANGED, {
      taskId,
      previousStatus,
      newStatus,
      agentId: task.assigneeAgentId,
    } satisfies TaskStatusPayload);

    return updated;
  }

  /**
   * Get the current status of all workflows for a project.
   */
  async getStatus(projectId: string): Promise<WorkflowStatus[]> {
    const statuses: WorkflowStatus[] = [];

    for (const [workflowId, workflow] of this.workflows) {
      if (workflow.projectId !== projectId) continue;
      const tasks = await this.db.listTasks(projectId);
      const agents = await this.db.listAgents(projectId);
      const dag = this.dags.get(workflowId) ?? new TaskDAG();
      statuses.push({ workflow, tasks, agents, dag });
    }

    return statuses;
  }

  // --- Private helpers ---

  private async executeTask(task: Task, dag: TaskDAG): Promise<Task> {
    // Transition CREATED -> PLANNING -> REVIEWING -> APPROVED -> IN_PROGRESS
    let current = this.stateMachine.transition(
      { ...task, status: TaskStatus.CREATED },
      TaskStatus.PLANNING,
    );
    current = await this.db.updateTask(task.id, { status: current.status });

    this.emitEvent(EventType.TASK_STATUS_CHANGED, {
      taskId: task.id,
      previousStatus: TaskStatus.CREATED,
      newStatus: TaskStatus.PLANNING,
      agentId: task.assigneeAgentId,
    } satisfies TaskStatusPayload);

    // Set agent to WORKING
    if (task.assigneeAgentId) {
      await this.updateAgentState(task.assigneeAgentId, AgentVisualState.WORKING);
    }

    // Transition to REVIEWING -> APPROVED -> IN_PROGRESS
    current = this.stateMachine.transition(current, TaskStatus.REVIEWING);
    current = this.stateMachine.transition(current, TaskStatus.APPROVED);
    current = this.stateMachine.transition(current, TaskStatus.IN_PROGRESS);
    current = await this.db.updateTask(task.id, { status: current.status });

    // Get agent details for the chat call
    const agents = await this.db.listAgents(task.projectId);
    const agent = agents.find((a) => a.id === task.assigneeAgentId);

    if (!agent) {
      throw new Error(`No agent assigned to task ${task.id}`);
    }

    // Execute via gateway chat
    const messages: ChatMessage[] = [
      { role: 'user', content: task.description },
    ];

    const response = await this.chat(
      agent.provider,
      agent.model,
      messages,
      agent.systemPrompt,
    );

    // Transition to CODE_REVIEW -> MERGING -> DONE
    current = this.stateMachine.transition(current, TaskStatus.CODE_REVIEW);
    current = this.stateMachine.transition(current, TaskStatus.MERGING);
    current = this.stateMachine.transition(current, TaskStatus.DONE);

    const finalTask = await this.db.updateTask(task.id, {
      status: TaskStatus.DONE,
      result: response.content,
      updatedAt: new Date().toISOString(),
    });

    dag.updateTask(finalTask);

    // Free the agent
    if (task.assigneeAgentId) {
      await this.updateAgentState(task.assigneeAgentId, AgentVisualState.IDLE);
    }

    this.emitEvent(EventType.TASK_STATUS_CHANGED, {
      taskId: task.id,
      previousStatus: TaskStatus.IN_PROGRESS,
      newStatus: TaskStatus.DONE,
      agentId: task.assigneeAgentId,
    } satisfies TaskStatusPayload);

    return finalTask;
  }

  /**
   * Advance a task directly to DONE, transitioning through intermediate states.
   * Used by handleTaskComplete when the work is already done externally.
   */
  private advanceToDone(task: Task): Task {
    const path: TaskStatus[] = [
      TaskStatus.PLANNING,
      TaskStatus.REVIEWING,
      TaskStatus.APPROVED,
      TaskStatus.IN_PROGRESS,
      TaskStatus.CODE_REVIEW,
      TaskStatus.MERGING,
      TaskStatus.DONE,
    ];

    let current = task;
    const startIdx = path.indexOf(current.status as TaskStatus);
    const remaining = startIdx >= 0 ? path.slice(startIdx + 1) : path;

    for (const nextStatus of remaining) {
      if (this.stateMachine.canTransition(current.status, nextStatus)) {
        current = this.stateMachine.transition(current, nextStatus);
      }
      if (current.status === TaskStatus.DONE) break;
    }

    return current;
  }

  private async completeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const previousStatus = workflow.status;
    const updated = await this.db.updateWorkflow(workflowId, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    });
    this.workflows.set(workflowId, updated);

    this.emitEvent(EventType.WORKFLOW_STATUS_CHANGED, {
      workflowId,
      previousStatus,
      newStatus: 'COMPLETED',
    } satisfies WorkflowStatusPayload);
  }

  private async updateAgentState(
    agentId: string,
    newState: Agent['visualState'],
  ): Promise<void> {
    const agents = await this.db.listAgents('');
    // We don't know the agent's previous state without fetching, so use a simple approach
    await this.db.updateAgent(agentId, {
      visualState: newState,
      updatedAt: new Date().toISOString(),
    });

    this.emitEvent(EventType.AGENT_STATE_CHANGED, {
      agentId,
      previousState: '', // Not tracked here for simplicity
      newState,
    } satisfies AgentStatePayload);
  }

  private emitEvent<T>(type: EventType, payload: T): void {
    const event: SystemEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.emitter.emit(type, event);
    this.emitter.emit('*', event);
  }
}
