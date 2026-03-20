import type { Agent } from '../types/agent.js';

interface Position {
  x: number;
  y: number;
  z: number;
}

/** Default positions for each role, with multiple slots per role */
const ROLE_POSITIONS: Record<string, Position[]> = {
  PM: [
    { x: 0, y: 0, z: -6 },
    { x: 2, y: 0, z: -6 },
  ],
  DEVELOPER: [
    { x: -3, y: 0, z: 1 },
    { x: 0, y: 0, z: 2 },
    { x: -3, y: 0, z: 4 },
    { x: 0, y: 0, z: 5 },
  ],
  REVIEWER: [
    { x: 5, y: 0, z: -2 },
    { x: 7, y: 0, z: -2 },
  ],
  TESTER: [
    { x: 5, y: 0, z: 2 },
    { x: 7, y: 0, z: 2 },
  ],
  DEVOPS: [
    { x: -5, y: 0, z: 6 },
    { x: -7, y: 0, z: 6 },
  ],
};

const DEFAULT_POSITION: Position = { x: 0, y: 0, z: 0 };

/**
 * Assign a non-overlapping position based on role and existing agents.
 */
export function assignPosition(role: string, existingAgents: Agent[]): Position {
  const slots = ROLE_POSITIONS[role] ?? [DEFAULT_POSITION];
  const usedPositions = new Set(
    existingAgents.map((a) => `${a.position.x},${a.position.y},${a.position.z}`),
  );

  for (const pos of slots) {
    const key = `${pos.x},${pos.y},${pos.z}`;
    if (!usedPositions.has(key)) {
      return { ...pos };
    }
  }

  // All slots taken: offset from the last slot
  const base = slots[slots.length - 1];
  const offset = existingAgents.filter((a) => a.role === role).length;
  return { x: base.x + offset * 2, y: base.y, z: base.z };
}
