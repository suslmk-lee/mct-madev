export interface IQueue<T = unknown> {
  enqueue(job: T): Promise<string>;
  onProcess(handler: (job: T) => Promise<void>): void;
  onComplete(handler: (jobId: string, result: unknown) => void): void;
  onFailed(handler: (jobId: string, error: Error) => void): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  getStats(): Promise<QueueStats>;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
}

export interface QueueOptions {
  /** Number of concurrent workers (default: 1) */
  concurrency?: number;
  /** Maximum number of retries on failure (default: 0) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 0) */
  retryDelay?: number;
}
