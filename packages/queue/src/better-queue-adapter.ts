import BetterQueue from 'better-queue';
import { randomUUID } from 'node:crypto';
import type { IQueue, QueueOptions, QueueStats } from './types.js';

interface InternalJob<T> {
  id: string;
  data: T;
}

export class BetterQueueAdapter<T = unknown> implements IQueue<T> {
  private queue: BetterQueue<InternalJob<T>>;
  private stats: QueueStats = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
  };
  private completeHandlers: Array<(jobId: string, result: unknown) => void> = [];
  private failedHandlers: Array<(jobId: string, error: Error) => void> = [];

  constructor(options: QueueOptions = {}) {
    const { concurrency = 1, maxRetries = 0, retryDelay = 0 } = options;

    this.queue = new BetterQueue<InternalJob<T>>(
      (job: InternalJob<T>, cb: BetterQueue.ProcessFunctionCb<unknown>) => {
        if (!this.processHandler) {
          cb(new Error('No process handler registered'), undefined);
          return;
        }
        this.stats.active++;
        this.stats.pending = Math.max(0, this.stats.pending - 1);

        this.processHandler(job.data)
          .then((result) => {
            this.stats.active = Math.max(0, this.stats.active - 1);
            this.stats.completed++;
            for (const handler of this.completeHandlers) {
              handler(job.id, result);
            }
            cb(null, result);
          })
          .catch((error: unknown) => {
            this.stats.active = Math.max(0, this.stats.active - 1);
            this.stats.failed++;
            const err = error instanceof Error ? error : new Error(String(error));
            for (const handler of this.failedHandlers) {
              handler(job.id, err);
            }
            cb(err, undefined);
          });
      },
      {
        concurrent: concurrency,
        maxRetries,
        retryDelay,
        id: ((job: InternalJob<T>, cb: (error: null, id: string) => void) => {
          cb(null, job.id);
        }) as unknown as keyof InternalJob<T>,
      },
    );
  }

  private processHandler: ((job: T) => Promise<void>) | null = null;

  async enqueue(job: T): Promise<string> {
    const id = randomUUID();
    this.stats.pending++;
    return new Promise<string>((resolve, reject) => {
      this.queue
        .push({ id, data: job })
        .on('finish', () => resolve(id))
        .on('failed', (err: Error) => reject(err));
    });
  }

  onProcess(handler: (job: T) => Promise<void>): void {
    this.processHandler = handler;
  }

  onComplete(handler: (jobId: string, result: unknown) => void): void {
    this.completeHandlers.push(handler);
  }

  onFailed(handler: (jobId: string, error: Error) => void): void {
    this.failedHandlers.push(handler);
  }

  async pause(): Promise<void> {
    this.queue.pause();
  }

  async resume(): Promise<void> {
    this.queue.resume();
  }

  async close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.destroy(() => {
        resolve();
      });
    });
  }

  async getStats(): Promise<QueueStats> {
    return { ...this.stats };
  }
}
