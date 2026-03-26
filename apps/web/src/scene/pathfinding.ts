/**
 * Grid-based A* pathfinding for the office scene (XZ plane).
 * Obstacles: desks, meeting table, couches.
 * Walls are decorative/transparent — not marked as obstacles.
 */

/* ------------------------------------------------------------------ */
/*  Grid config                                                         */
/* ------------------------------------------------------------------ */

const CELL  = 0.5;       // world units per cell
const MIN_X = -16;
const MAX_X =  16;
const MIN_Z = -14;
const MAX_Z =  14;
const COLS  = Math.round((MAX_X - MIN_X) / CELL); // 64
const ROWS  = Math.round((MAX_Z - MIN_Z) / CELL); // 56

function worldToGrid(wx: number, wz: number): [c: number, r: number] {
  return [
    Math.max(0, Math.min(COLS - 1, Math.round((wx - MIN_X) / CELL))),
    Math.max(0, Math.min(ROWS - 1, Math.round((wz - MIN_Z) / CELL))),
  ];
}

function gridToWorld(c: number, r: number): [x: number, z: number] {
  return [c * CELL + MIN_X, r * CELL + MIN_Z];
}

/* ------------------------------------------------------------------ */
/*  Obstacle rectangles [centerX, centerZ, halfW, halfD]               */
/* ------------------------------------------------------------------ */

// Desk geometry: boxGeometry args=[1.2, 0.08, 0.6] → half = [0.6, 0.3]
// Buffer: +0.25 → effective half = [0.85, 0.55]
const OBSTACLES: [cx: number, cz: number, hw: number, hd: number][] = [
  // CEO Room desks (room center: [-8, 0, -7])
  [-8,   -7,   0.85, 0.55],

  // PM Hub desks (room center: [0, 0, -7])
  [-1.2, -7,   0.85, 0.55],
  [ 1.2, -7,   0.85, 0.55],

  // Dev Zone desks (room center: [-1.5, 0, 1])
  [-4.5,  0,   0.85, 0.55],
  [-2.5,  0,   0.85, 0.55],
  [-0.5,  0,   0.85, 0.55],
  [ 1.5,  0,   0.85, 0.55],
  [-3.5,  2.5, 0.85, 0.55],
  [-1.5,  2.5, 0.85, 0.55],

  // War Room meeting table (room center: [8, 0, -2])
  // boxGeometry args=[2.5, 0.1, 1.2] → half=[1.25, 0.6] + buffer 0.3
  [ 8,   -2,   1.55, 0.9],

  // Break Room couches (room center: [-4, 0, 7])
  // boxGeometry args=[1.6, 0.3, 0.7] → half=[0.8, 0.35] + buffer 0.3
  [-6,    7,   1.1,  0.65],
  [-3,    7.5, 1.1,  0.65],

  // Coffee machine (small, but in a corner)
  [-1,    5.8, 0.45, 0.4],
];

/* ------------------------------------------------------------------ */
/*  Build obstacle grid (runs once at module load)                     */
/* ------------------------------------------------------------------ */

const obstacleGrid = new Uint8Array(COLS * ROWS);

for (const [cx, cz, hw, hd] of OBSTACLES) {
  const [c0, r0] = worldToGrid(cx - hw, cz - hd);
  const [c1, r1] = worldToGrid(cx + hw, cz + hd);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      obstacleGrid[r * COLS + c] = 1;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  A* search                                                          */
/* ------------------------------------------------------------------ */

const DIRS: [dc: number, dr: number][] = [
  [ 1,  0], [-1,  0], [ 0,  1], [ 0, -1],
  [ 1,  1], [ 1, -1], [-1,  1], [-1, -1],
];

interface ANode {
  c: number; r: number;
  g: number; f: number;
  parent: ANode | null;
}

export function findPath(
  fromX: number, fromZ: number,
  toX:   number, toZ:   number,
): { x: number; z: number }[] {
  const [sc, sr] = worldToGrid(fromX, fromZ);
  const [ec, er] = worldToGrid(toX, toZ);

  if (sc === ec && sr === er) return [{ x: toX, z: toZ }];

  // If start is inside an obstacle, clear it (agent already there)
  obstacleGrid[sr * COLS + sc] = 0;

  const heuristic = (c: number, r: number) =>
    Math.sqrt((c - ec) ** 2 + (r - er) ** 2);

  const open: ANode[] = [{ c: sc, r: sr, g: 0, f: heuristic(sc, sr), parent: null }];
  const gScore = new Float32Array(COLS * ROWS).fill(Infinity);
  const closed  = new Uint8Array(COLS * ROWS);
  gScore[sr * COLS + sc] = 0;

  let goal: ANode | null = null;
  let iterations = 0;

  while (open.length > 0 && iterations++ < 3000) {
    // Find lowest-f node (simple linear scan — grid is small enough)
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const idx = cur.r * COLS + cur.c;
    if (closed[idx]) continue;
    closed[idx] = 1;

    if (cur.c === ec && cur.r === er) { goal = cur; break; }

    for (const [dc, dr] of DIRS) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;

      const nIdx = nr * COLS + nc;
      if (closed[nIdx] || obstacleGrid[nIdx]) continue;

      // Prevent diagonal corner-cutting through obstacles
      const diag = dc !== 0 && dr !== 0;
      if (diag && (obstacleGrid[cur.r * COLS + nc] || obstacleGrid[nr * COLS + cur.c])) continue;

      const ng = cur.g + (diag ? 1.414 : 1);
      if (ng < gScore[nIdx]) {
        gScore[nIdx] = ng;
        open.push({ c: nc, r: nr, g: ng, f: ng + heuristic(nc, nr), parent: cur });
      }
    }
  }

  // Reconstruct grid path
  if (!goal) return [{ x: toX, z: toZ }]; // No path — go direct

  const raw: { x: number; z: number }[] = [];
  let n: ANode | null = goal;
  while (n) {
    const [wx, wz] = gridToWorld(n.c, n.r);
    raw.unshift({ x: wx, z: wz });
    n = n.parent;
  }

  // Remove start (agent is already there)
  if (raw.length > 1) raw.shift();

  // Exact target at end (avoid grid snapping)
  if (raw.length > 0) {
    raw[raw.length - 1] = { x: toX, z: toZ };
  }

  // Line-of-sight string-pulling
  return stringPull(raw, fromX, fromZ);
}

/* ------------------------------------------------------------------ */
/*  Line-of-sight check (Bresenham's line on obstacle grid)           */
/* ------------------------------------------------------------------ */

function hasLOS(x0: number, z0: number, x1: number, z1: number): boolean {
  const [c0, r0] = worldToGrid(x0, z0);
  const [c1, r1] = worldToGrid(x1, z1);

  let c = c0, r = r0;
  const dc = Math.abs(c1 - c0);
  const dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;

  for (let step = 0; step < dc + dr + 2; step++) {
    if (obstacleGrid[r * COLS + c]) return false;
    if (c === c1 && r === r1) break;
    const e2 = err * 2;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  String-pulling (greedy waypoint reduction)                        */
/* ------------------------------------------------------------------ */

function stringPull(
  path: { x: number; z: number }[],
  fromX: number,
  fromZ: number,
): { x: number; z: number }[] {
  if (path.length <= 1) return path;

  const result: { x: number; z: number }[] = [];
  let cx = fromX, cz = fromZ;
  let i = 0;

  while (i < path.length) {
    // Find furthest waypoint with line-of-sight from current position
    let furthest = i;
    for (let j = path.length - 1; j > i; j--) {
      if (hasLOS(cx, cz, path[j].x, path[j].z)) {
        furthest = j;
        break;
      }
    }
    result.push(path[furthest]);
    cx = path[furthest].x;
    cz = path[furthest].z;
    i = furthest + 1;
  }

  return result;
}
