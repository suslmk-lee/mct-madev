import type { Response } from 'express';
import { logger } from './logger.js';

/**
 * Send a sanitized error response. Internal details are logged server-side only —
 * never exposed to the client.
 */
export function sendError(
  res: Response,
  status: number,
  message: string,
  err?: unknown,
): void {
  if (err !== undefined) {
    logger.error({ err: String(err) }, message);
  }
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
}
