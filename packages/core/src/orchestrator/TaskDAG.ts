import type { Task } from '../types/task.js';
import { TaskStatus } from '../types/task.js';

/**
 * Directed Acyclic Graph for managing task dependencies.
 * Nodes are tasks, edges represent "depends on" relationships.
 */
export class TaskDAG {
  private tasks: Map<string, Task> = new Map();
  /** taskId -> set of task IDs it depends on */
  private dependencies: Map<string, Set<string>> = new Map();
  /** taskId -> set of task IDs that depend on it */
  private dependents: Map<string, Set<string>> = new Map();

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
    if (!this.dependencies.has(task.id)) {
      this.dependencies.set(task.id, new Set());
    }
    if (!this.dependents.has(task.id)) {
      this.dependents.set(task.id, new Set());
    }

    // Auto-add dependencies declared in the task itself
    for (const depId of task.dependencies) {
      this.addDependency(task.id, depId);
    }
  }

  addDependency(taskId: string, dependsOnTaskId: string): void {
    if (!this.dependencies.has(taskId)) {
      this.dependencies.set(taskId, new Set());
    }
    if (!this.dependents.has(dependsOnTaskId)) {
      this.dependents.set(dependsOnTaskId, new Set());
    }

    this.dependencies.get(taskId)!.add(dependsOnTaskId);
    this.dependents.get(dependsOnTaskId)!.add(taskId);
  }

  /**
   * Returns tasks whose dependencies are all DONE and that are not yet started.
   * A task is "ready" if its status is CREATED or APPROVED and all deps are DONE.
   */
  getReadyTasks(): Task[] {
    const ready: Task[] = [];
    for (const [taskId, task] of this.tasks) {
      if (task.status === TaskStatus.DONE || task.status === TaskStatus.IN_PROGRESS) {
        continue;
      }
      const deps = this.dependencies.get(taskId) ?? new Set();
      const allDepsDone = [...deps].every((depId) => {
        const depTask = this.tasks.get(depId);
        return depTask?.status === TaskStatus.DONE;
      });
      if (allDepsDone) {
        ready.push(task);
      }
    }
    return ready;
  }

  /** Returns true when every task in the DAG has status DONE. */
  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status !== TaskStatus.DONE) return false;
    }
    return this.tasks.size > 0;
  }

  /** Detect cycles using DFS coloring (white/gray/black). */
  hasCycle(): boolean {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.tasks.keys()) color.set(id, WHITE);
    // Also include dependency-only nodes that may not have a task entry
    for (const id of this.dependencies.keys()) {
      if (!color.has(id)) color.set(id, WHITE);
    }

    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      const deps = this.dependencies.get(id) ?? new Set();
      for (const depId of deps) {
        const c = color.get(depId) ?? WHITE;
        if (c === GRAY) return true; // back edge → cycle
        if (c === WHITE && visit(depId)) return true;
      }
      color.set(id, BLACK);
      return false;
    };

    for (const id of color.keys()) {
      if (color.get(id) === WHITE && visit(id)) return true;
    }
    return false;
  }

  /** Kahn's algorithm for topological sort. Returns task IDs in execution order. */
  getTopologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    for (const id of this.tasks.keys()) {
      inDegree.set(id, 0);
    }
    for (const [taskId, deps] of this.dependencies) {
      if (this.tasks.has(taskId)) {
        inDegree.set(taskId, deps.size);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      const deps = this.dependents.get(current) ?? new Set();
      for (const depId of deps) {
        if (!inDegree.has(depId)) continue;
        const newDeg = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) queue.push(depId);
      }
    }

    return order;
  }

  /** Get tasks that directly depend on the given taskId. */
  getDependents(taskId: string): Task[] {
    const depIds = this.dependents.get(taskId) ?? new Set();
    const result: Task[] = [];
    for (const id of depIds) {
      const task = this.tasks.get(id);
      if (task) result.push(task);
    }
    return result;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  updateTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getAllTasks(): Task[] {
    return [...this.tasks.values()];
  }
}
