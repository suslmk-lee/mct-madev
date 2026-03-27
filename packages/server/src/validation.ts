/** Shared validation constants and helpers for route handlers */

export const VALID_PROVIDERS = [
  'anthropic', 'openai', 'google', 'ollama', 'kimi', 'minimax', 'glm', 'openai-compatible',
] as const;

export const VALID_ROLES = [
  'PM', 'DEVELOPER', 'REVIEWER', 'TESTER', 'DEVOPS',
] as const;

export const NAME_MAX_LENGTH = 100;
export const SYSTEM_PROMPT_MAX_LENGTH = 8_000;
export const TASK_PRIORITY_MIN = 0;
export const TASK_PRIORITY_MAX = 10;
export const WS_PROJECT_ID_MAX_LENGTH = 100;

export function isValidProvider(p: unknown): p is string {
  return typeof p === 'string' && (VALID_PROVIDERS as readonly string[]).includes(p);
}

export function isValidRole(r: unknown): r is string {
  return typeof r === 'string' && (VALID_ROLES as readonly string[]).includes(r);
}

export function isValidPriority(p: unknown): boolean {
  const n = Number(p);
  return Number.isInteger(n) && n >= TASK_PRIORITY_MIN && n <= TASK_PRIORITY_MAX;
}
