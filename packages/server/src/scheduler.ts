/**
 * HeartbeatScheduler — wakes agents on their cron schedule and processes
 * CREATED/BLOCKED tasks assigned to them.
 *
 * Architecture:
 * - On each cron tick, the scheduler calls the provided `onHeartbeat` callback
 *   with the agent that fired. The callback (set up in start.ts) runs task execution.
 * - Uses node-cron per-agent schedules; re-syncs schedules periodically to pick up changes.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { ServerDatabase } from './database.js';
import type { Agent } from '@mct-madev/core';
import { logger } from './logger.js';

export type HeartbeatCallback = (agent: Agent) => Promise<void>;

export class HeartbeatScheduler {
  private db: ServerDatabase;
  private onHeartbeat: HeartbeatCallback;
  /** map of agentId → scheduled task */
  private jobs = new Map<string, ScheduledTask>();
  /** re-sync interval (checks for new/removed agent schedules) */
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: ServerDatabase, onHeartbeat: HeartbeatCallback) {
    this.db = db;
    this.onHeartbeat = onHeartbeat;
  }

  /** Start the scheduler. Syncs agent schedules immediately, then every 60 s. */
  async start(): Promise<void> {
    await this.sync();
    this.syncTimer = setInterval(() => {
      this.sync().catch((err) => logger.error({ err: String(err) }, 'Heartbeat scheduler sync failed'));
    }, 60_000);
    logger.info('HeartbeatScheduler started');
  }

  /** Stop all scheduled jobs and the sync timer. */
  stop(): void {
    for (const [agentId, job] of this.jobs) {
      job.stop();
      this.jobs.delete(agentId);
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    logger.info('HeartbeatScheduler stopped');
  }

  /** Sync cron schedules: add new, remove stale, update changed. */
  private async sync(): Promise<void> {
    const projects = await this.db.listProjects();
    const currentAgentIds = new Set<string>();

    for (const project of projects) {
      const agents = await this.db.listAgents(project.id);
      for (const agent of agents) {
        currentAgentIds.add(agent.id);

        if (!agent.heartbeatCron) {
          // Remove job if previously scheduled
          if (this.jobs.has(agent.id)) {
            this.jobs.get(agent.id)!.stop();
            this.jobs.delete(agent.id);
            logger.info({ agentId: agent.id, agentName: agent.name }, 'Heartbeat schedule removed');
          }
          continue;
        }

        // Validate cron expression
        if (!cron.validate(agent.heartbeatCron)) {
          logger.warn({ agentId: agent.id, cron: agent.heartbeatCron }, 'Invalid heartbeat cron expression — skipping');
          continue;
        }

        const existing = this.jobs.get(agent.id);
        if (existing) {
          // Check if expression changed by comparing stored expression
          const storedCron = (existing as any)._options?.scheduled !== undefined
            ? (existing as any).cronExpression
            : undefined;
          if (storedCron === agent.heartbeatCron) continue; // unchanged
          existing.stop();
          this.jobs.delete(agent.id);
        }

        // Schedule new job
        const agentSnapshot = { ...agent }; // capture value
        const job = cron.schedule(agent.heartbeatCron, () => {
          logger.info({ agentId: agentSnapshot.id, agentName: agentSnapshot.name, cron: agentSnapshot.heartbeatCron }, 'Agent heartbeat fired');
          this.onHeartbeat(agentSnapshot).catch((err) =>
            logger.error({ err: String(err), agentId: agentSnapshot.id }, 'Heartbeat callback error'),
          );
        });
        this.jobs.set(agent.id, job);
        logger.info({ agentId: agent.id, agentName: agent.name, cron: agent.heartbeatCron }, 'Heartbeat schedule registered');
      }
    }

    // Remove jobs for deleted agents
    for (const agentId of this.jobs.keys()) {
      if (!currentAgentIds.has(agentId)) {
        this.jobs.get(agentId)!.stop();
        this.jobs.delete(agentId);
      }
    }
  }
}
