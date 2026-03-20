import { useEffect, useRef } from 'react';
import { useStore, type AgentVisualState, type AgentRole } from '../store/useStore';

// ── Idle behavior weights ──
const IDLE_BEHAVIORS: { state: AgentVisualState; weight: number }[] = [
  { state: 'COFFEE', weight: 14 },
  { state: 'READING', weight: 14 },
  { state: 'CHATTING', weight: 10 },
  { state: 'NAPPING', weight: 6 },
  { state: 'GAMING', weight: 8 },
  { state: 'THINKING', weight: 10 },
  { state: 'WALKING', weight: 38 },
];
const TOTAL_WEIGHT = IDLE_BEHAVIORS.reduce((s, b) => s + b.weight, 0);

function pickIdleBehavior(): AgentVisualState {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const { state, weight } of IDLE_BEHAVIORS) {
    rand -= weight;
    if (rand <= 0) return state;
  }
  return 'IDLE';
}

// ── Room / Zone definitions ──
// Matching Rooms.tsx world positions exactly
type Zone = 'CEO' | 'PM' | 'DEV' | 'WAR' | 'BREAK';

interface ZoneDef {
  cx: number; cz: number; hw: number; hd: number;
  // Points of interest inside the room (furniture-free walking spots)
  pois: { x: number; z: number }[];
}

const ZONES: Record<Zone, ZoneDef> = {
  CEO: {
    cx: -8, cz: -7, hw: 2, hd: 1.5,
    pois: [{ x: -9, z: -7.5 }, { x: -7, z: -6.5 }, { x: -8.5, z: -6 }],
  },
  PM: {
    cx: 0, cz: -7, hw: 2.5, hd: 1.5,
    pois: [{ x: -1.5, z: -7.5 }, { x: 1.5, z: -7.5 }, { x: 0, z: -6 }, { x: -0.5, z: -8 }],
  },
  DEV: {
    cx: -1.5, cz: 1, hw: 4.2, hd: 2.5,
    pois: [
      { x: -4, z: 0.5 }, { x: -2, z: -0.5 }, { x: 0, z: 0.5 },
      { x: 2, z: -0.5 }, { x: -3, z: 2.5 }, { x: 1, z: 2.5 },
      { x: -1, z: 3 }, { x: 3, z: 1.5 },
    ],
  },
  WAR: {
    cx: 8, cz: -2, hw: 2, hd: 2.5,
    pois: [{ x: 7, z: -3 }, { x: 9, z: -1 }, { x: 7.5, z: 0 }, { x: 8.5, z: -3.5 }],
  },
  BREAK: {
    cx: -4, cz: 7, hw: 3.5, hd: 1.5,
    pois: [
      { x: -6, z: 7 }, { x: -3, z: 7.5 }, { x: -1, z: 6.5 },
      { x: -5, z: 6 }, { x: -2, z: 8 },
    ],
  },
};

// Which zone each agent role "belongs to" (home room)
const ROLE_HOME: Record<AgentRole, Zone> = {
  PM: 'PM',
  DEVELOPER: 'DEV',
  REVIEWER: 'WAR',
  TESTER: 'WAR',
  DEVOPS: 'BREAK',
};

// ── Corridor waypoints connecting rooms ──
// Agents walk through these when moving between rooms to avoid wall clipping
interface Corridor {
  from: Zone;
  to: Zone;
  waypoints: { x: number; z: number }[]; // intermediate path points
}

const CORRIDORS: Corridor[] = [
  // CEO <-> PM  (both at z≈-7, gap between x=-5.5 and x=-3)
  { from: 'CEO', to: 'PM', waypoints: [{ x: -5.5, z: -7 }, { x: -4.2, z: -6.5 }, { x: -3, z: -7 }] },
  // PM <-> DEV  (PM front z=-5, DEV back z=-2, corridor in between)
  { from: 'PM', to: 'DEV', waypoints: [{ x: 0, z: -5 }, { x: -0.5, z: -3.5 }, { x: -1, z: -2 }] },
  // DEV <-> WAR  (DEV right x=3.5, WAR left x=5.5)
  { from: 'DEV', to: 'WAR', waypoints: [{ x: 3.5, z: -0.5 }, { x: 4.5, z: -1.5 }, { x: 5.5, z: -2 }] },
  // DEV <-> BREAK  (DEV front z=4, BREAK back z=5)
  { from: 'DEV', to: 'BREAK', waypoints: [{ x: -3, z: 4 }, { x: -3.5, z: 4.8 }, { x: -4, z: 5.5 }] },
  // CEO <-> DEV  (via PM corridor area)
  { from: 'CEO', to: 'DEV', waypoints: [{ x: -5.5, z: -6.5 }, { x: -4, z: -5 }, { x: -3.5, z: -3 }, { x: -3, z: -2 }] },
  // PM <-> WAR  (via DEV east side)
  { from: 'PM', to: 'WAR', waypoints: [{ x: 1.5, z: -5 }, { x: 3, z: -3.5 }, { x: 4.5, z: -2.5 }, { x: 5.5, z: -2 }] },
  // PM <-> BREAK  (via DEV south)
  { from: 'PM', to: 'BREAK', waypoints: [{ x: 0, z: -5 }, { x: -1, z: -2.5 }, { x: -2, z: 1 }, { x: -3, z: 4 }, { x: -4, z: 5.5 }] },
  // WAR <-> BREAK  (via DEV)
  { from: 'WAR', to: 'BREAK', waypoints: [{ x: 5.5, z: -1 }, { x: 3, z: 1 }, { x: 0, z: 3 }, { x: -3, z: 4.5 }, { x: -4, z: 5.5 }] },
  // CEO <-> BREAK  (long path)
  { from: 'CEO', to: 'BREAK', waypoints: [{ x: -6, z: -5 }, { x: -5.5, z: -3 }, { x: -5, z: 0 }, { x: -5, z: 3 }, { x: -5, z: 5.5 }] },
  // CEO <-> WAR  (longest path)
  { from: 'CEO', to: 'WAR', waypoints: [{ x: -5.5, z: -6 }, { x: -3, z: -5 }, { x: 0, z: -4 }, { x: 3, z: -3 }, { x: 5.5, z: -2.5 }] },
];

// Build lookup: find corridor waypoints between two zones
function findPath(from: Zone, to: Zone): { x: number; z: number }[] {
  for (const c of CORRIDORS) {
    if (c.from === from && c.to === to) return [...c.waypoints];
    if (c.from === to && c.to === from) return [...c.waypoints].reverse();
  }
  return []; // Should not happen for connected zones
}

// Random position inside a zone (from POIs or random within bounds)
function randomZonePos(zone: Zone): { x: number; z: number } {
  const z = ZONES[zone];
  // 70% chance pick a POI, 30% random in bounds
  if (Math.random() < 0.7 && z.pois.length > 0) {
    const poi = z.pois[Math.floor(Math.random() * z.pois.length)];
    // Add slight randomness
    return { x: poi.x + (Math.random() - 0.5) * 0.6, z: poi.z + (Math.random() - 0.5) * 0.6 };
  }
  return {
    x: z.cx + (Math.random() - 0.5) * 2 * z.hw,
    z: z.cz + (Math.random() - 0.5) * 2 * z.hd,
  };
}

// Determine which zone a position is in (best match)
function positionToZone(x: number, z: number): Zone {
  let bestZone: Zone = 'DEV';
  let bestDist = Infinity;
  for (const [name, def] of Object.entries(ZONES) as [Zone, ZoneDef][]) {
    const dx = x - def.cx;
    const dz = z - def.cz;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) { bestDist = dist; bestZone = name; }
  }
  return bestZone;
}

// Pick a destination zone for walking
function pickDestinationZone(currentZone: Zone, homeZone: Zone): Zone {
  const zones: Zone[] = ['CEO', 'PM', 'DEV', 'WAR', 'BREAK'];

  // Weighted selection: home room 30%, current room neighbors 40%, any other 30%
  const roll = Math.random();
  if (roll < 0.25) {
    // Stay in current room — walk around
    return currentZone;
  }
  if (roll < 0.5) {
    // Go home
    return homeZone;
  }
  // Random room (excluding current)
  const others = zones.filter((z) => z !== currentZone);
  return others[Math.floor(Math.random() * others.length)];
}

// Build a complete walk path: current position → corridor waypoints → destination spot
function buildWalkPath(
  fromPos: { x: number; z: number },
  fromZone: Zone,
  toZone: Zone,
): { x: number; z: number }[] {
  if (fromZone === toZone) {
    // Just wander within the same room — 1-3 spots
    const count = 1 + Math.floor(Math.random() * 3);
    const path: { x: number; z: number }[] = [];
    for (let i = 0; i < count; i++) path.push(randomZonePos(toZone));
    return path;
  }

  // Cross-room path: corridor + destination
  const corridorPts = findPath(fromZone, toZone);
  const dest = randomZonePos(toZone);
  return [...corridorPts, dest];
}

// ── Timing ──
const WALK_STEP_MS = 2500;   // Time between waypoints (lerp convergence ~2.5s)
const MIN_IDLE_MS = 5_000;   // Min idle time in a non-walking state
const MAX_IDLE_MS = 14_000;

function randomIdleInterval(): number {
  return MIN_IDLE_MS + Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS);
}

// ── Agent walking state (per agent, not in store) ──
interface WalkState {
  path: { x: number; z: number }[];
  stepIndex: number;
  currentZone: Zone;
}

// ── Hook ──
export function useIdleBehavior() {
  const agents = useStore((s) => s.agents);
  const updateAgent = useStore((s) => s.updateAgent);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const walkStates = useRef<Map<string, WalkState>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;

    for (const agent of agents) {
      const isWorking = agent.visualState === 'WORKING';

      // Clear timers and walk state when agent starts working
      if (isWorking) {
        const existing = timers.get(agent.id);
        if (existing) { clearTimeout(existing); timers.delete(agent.id); }
        walkStates.current.delete(agent.id);
        continue;
      }

      // Already managed — skip
      if (timers.has(agent.id)) continue;

      const homeZone = ROLE_HOME[agent.role] ?? 'DEV';

      // Initialize current zone from position
      if (!walkStates.current.has(agent.id)) {
        walkStates.current.set(agent.id, {
          path: [],
          stepIndex: 0,
          currentZone: positionToZone(agent.position.x, agent.position.z),
        });
      }

      // Kick off the behavior loop
      const scheduleNext = () => {
        const current = useStore.getState().agents.find((a) => a.id === agent.id);
        if (!current || current.visualState === 'WORKING') return;

        const ws = walkStates.current.get(agent.id)!;

        // Check if we're mid-walk
        if (current.visualState === 'WALKING' && ws.path.length > 0 && ws.stepIndex < ws.path.length) {
          // Advance to next waypoint
          const nextPt = ws.path[ws.stepIndex];
          ws.stepIndex++;
          updateAgent(agent.id, { position: { x: nextPt.x, y: 0, z: nextPt.z } });

          // Schedule next step or end walk
          if (ws.stepIndex < ws.path.length) {
            timers.set(agent.id, setTimeout(scheduleNext, WALK_STEP_MS));
          } else {
            // Walk complete — update zone, pick next idle behavior
            ws.currentZone = positionToZone(nextPt.x, nextPt.z);
            ws.path = [];
            ws.stepIndex = 0;

            // Brief pause then pick new behavior
            timers.set(agent.id, setTimeout(() => {
              timers.delete(agent.id);
              const c = useStore.getState().agents.find((a) => a.id === agent.id);
              if (!c || c.visualState === 'WORKING') return;

              // Pick context-appropriate idle state
              const zone = walkStates.current.get(agent.id)?.currentZone ?? homeZone;
              const newState = pickContextBehavior(zone);
              updateAgent(agent.id, { visualState: newState });
              scheduleNextIdle();
            }, 800 + Math.random() * 1200));
          }
          return;
        }

        // Not walking — pick new behavior
        const newState = pickIdleBehavior();
        if (newState === 'WALKING') {
          // Start a walk
          const destZone = pickDestinationZone(ws.currentZone, homeZone);
          const path = buildWalkPath(
            { x: current.position.x, z: current.position.z },
            ws.currentZone,
            destZone,
          );
          ws.path = path;
          ws.stepIndex = 0;
          updateAgent(agent.id, { visualState: 'WALKING' });

          if (path.length > 0) {
            // Set first waypoint immediately
            const first = path[0];
            ws.stepIndex = 1;
            updateAgent(agent.id, { position: { x: first.x, y: 0, z: first.z } });
            timers.set(agent.id, setTimeout(scheduleNext, WALK_STEP_MS));
          } else {
            timers.set(agent.id, setTimeout(scheduleNext, 2000));
          }
        } else {
          // Non-walking idle — stay put, pick context behavior
          const zone = ws.currentZone;
          const behavior = newState === 'COFFEE' && zone !== 'BREAK' ? pickNonCoffeeBehavior() : newState;
          updateAgent(agent.id, { visualState: behavior });
          scheduleNextIdle();
        }
      };

      const scheduleNextIdle = () => {
        const delay = randomIdleInterval();
        timers.set(agent.id, setTimeout(() => {
          timers.delete(agent.id);
          scheduleNext();
        }, delay));
      };

      // Initial kick
      if (agent.visualState === 'IDLE') {
        updateAgent(agent.id, { visualState: pickIdleBehavior() });
      }
      scheduleNextIdle();
    }

    // Cleanup removed agents
    for (const [id, timer] of timers) {
      if (!agents.find((a) => a.id === id)) {
        clearTimeout(timer);
        timers.delete(id);
        walkStates.current.delete(id);
      }
    }

    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [agents, updateAgent]);
}

// ── Context-aware behavior ──
// Pick a behavior that makes sense for the current zone
function pickContextBehavior(zone: Zone): AgentVisualState {
  switch (zone) {
    case 'BREAK':
      return pickWeighted([
        ['COFFEE', 35], ['NAPPING', 20], ['GAMING', 20], ['CHATTING', 15], ['READING', 10],
      ]);
    case 'WAR':
      return pickWeighted([
        ['CHATTING', 35], ['THINKING', 25], ['READING', 25], ['COFFEE', 15],
      ]);
    case 'CEO':
    case 'PM':
      return pickWeighted([
        ['THINKING', 30], ['READING', 25], ['CHATTING', 20], ['COFFEE', 15], ['NAPPING', 10],
      ]);
    case 'DEV':
    default:
      return pickWeighted([
        ['READING', 25], ['THINKING', 25], ['GAMING', 15], ['COFFEE', 15], ['CHATTING', 10], ['NAPPING', 10],
      ]);
  }
}

function pickNonCoffeeBehavior(): AgentVisualState {
  return pickWeighted([
    ['READING', 25], ['THINKING', 25], ['CHATTING', 20], ['GAMING', 15], ['NAPPING', 15],
  ]);
}

function pickWeighted(items: [AgentVisualState, number][]): AgentVisualState {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let rand = Math.random() * total;
  for (const [state, weight] of items) {
    rand -= weight;
    if (rand <= 0) return state;
  }
  return items[0][0];
}
