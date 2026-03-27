/**
 * Minimal structured logger — outputs JSON lines to stderr.
 * Drop-in for pino without an external dependency.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function getLevel(): Level {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (LEVELS[env as Level] !== undefined ? env : 'info') as Level;
}

function write(level: Level, obj: Record<string, unknown>, msg?: string): void {
  const configuredLevel = getLevel();
  if (LEVELS[level] < LEVELS[configuredLevel]) return;
  const entry = { level, time: Date.now(), msg: msg ?? '', ...obj };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (obj: Record<string, unknown> | string, msg?: string) =>
    typeof obj === 'string' ? write('debug', {}, obj) : write('debug', obj, msg),
  info: (obj: Record<string, unknown> | string, msg?: string) =>
    typeof obj === 'string' ? write('info', {}, obj) : write('info', obj, msg),
  warn: (obj: Record<string, unknown> | string, msg?: string) =>
    typeof obj === 'string' ? write('warn', {}, obj) : write('warn', obj, msg),
  error: (obj: Record<string, unknown> | string, msg?: string) =>
    typeof obj === 'string' ? write('error', {}, obj) : write('error', obj, msg),
};
