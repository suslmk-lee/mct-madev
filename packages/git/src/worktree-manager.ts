import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import type { WorktreeInfo } from './types.js';

const execFile = promisify(execFileCb);

export class WorktreeManager {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Execute a git command in the repo directory.
   */
  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile('git', args, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.trim();
    } catch (err: unknown) {
      const error = err as Error & { stderr?: string };
      const message = error.stderr?.trim() || error.message;
      throw new Error(`git ${args[0]} failed: ${message}`);
    }
  }

  /**
   * Check if repoPath is a valid git repository.
   */
  async isGitRepo(): Promise<boolean> {
    try {
      const result = await this.exec(['rev-parse', '--is-inside-work-tree']);
      return result === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Create a new worktree for an agent working on a task.
   * The worktree is placed at `<repoPath>/../.worktrees/<branch>`.
   */
  async createWorktree(
    branch: string,
    agentId: string,
    taskId: string,
  ): Promise<WorktreeInfo> {
    const worktreeDir = join(this.repoPath, '..', '.worktrees', branch);

    // Check if branch already exists
    let branchExists = false;
    try {
      await this.exec(['rev-parse', '--verify', branch]);
      branchExists = true;
    } catch {
      branchExists = false;
    }

    if (branchExists) {
      await this.exec(['worktree', 'add', worktreeDir, branch]);
    } else {
      await this.exec(['worktree', 'add', '-b', branch, worktreeDir]);
    }

    return {
      path: worktreeDir,
      branch,
      agentId,
      taskId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Remove a worktree by its path.
   */
  async removeWorktree(worktreePath: string): Promise<void> {
    // Verify the path exists before attempting removal
    try {
      await access(worktreePath);
    } catch {
      throw new Error(`Worktree path does not exist: ${worktreePath}`);
    }

    await this.exec(['worktree', 'remove', worktreePath, '--force']);
  }

  /**
   * List all current worktrees with parsed details.
   */
  async listWorktrees(): Promise<
    Array<{ path: string; branch: string; head: string; bare: boolean }>
  > {
    const output = await this.exec(['worktree', 'list', '--porcelain']);

    if (!output) {
      return [];
    }

    const worktrees: Array<{
      path: string;
      branch: string;
      head: string;
      bare: boolean;
    }> = [];

    const blocks = output.split('\n\n').filter(Boolean);

    for (const block of blocks) {
      const lines = block.split('\n');
      let path = '';
      let head = '';
      let branch = '';
      let bare = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          // branch refs/heads/main → main
          branch = line.slice('branch '.length).replace('refs/heads/', '');
        } else if (line === 'bare') {
          bare = true;
        }
      }

      if (path) {
        worktrees.push({ path, branch, head, bare });
      }
    }

    return worktrees;
  }

  /**
   * Merge a worktree branch into a target branch, then clean up the worktree.
   */
  async mergeWorktree(
    worktreePath: string,
    targetBranch: string,
  ): Promise<void> {
    // Find which branch the worktree is on
    const worktrees = await this.listWorktrees();
    const worktree = worktrees.find((wt) => wt.path === worktreePath);

    if (!worktree) {
      throw new Error(`Worktree not found at path: ${worktreePath}`);
    }

    if (!worktree.branch) {
      throw new Error(`Worktree at ${worktreePath} has no associated branch`);
    }

    const sourceBranch = worktree.branch;

    // Switch to target branch in main repo and merge
    await this.exec(['checkout', targetBranch]);
    try {
      await this.exec(['merge', sourceBranch, '--no-ff', '-m', `Merge ${sourceBranch} into ${targetBranch}`]);
    } catch (err) {
      // If merge fails, abort and rethrow
      try {
        await this.exec(['merge', '--abort']);
      } catch {
        // ignore abort errors
      }
      throw err;
    }

    // Clean up: remove worktree then delete branch
    await this.exec(['worktree', 'remove', worktreePath, '--force']);
    await this.exec(['branch', '-d', sourceBranch]);
  }
}
