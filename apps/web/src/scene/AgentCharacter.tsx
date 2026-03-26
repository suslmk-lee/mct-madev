import { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentState, AgentRole, AgentVisualState } from '../store/useStore';
import { useStore } from '../store/useStore';
import { findPath } from './pathfinding';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<AgentRole, string> = {
  PM:        '#4488FF',
  DEVELOPER: '#44CC66',
  REVIEWER:  '#FF8844',
  TESTER:    '#AA66DD',
  DEVOPS:    '#DD4444',
};

/** Deterministic skin tone from agent id */
const SKIN_TONES = ['#FFD5B8', '#F5C5A0', '#D4956A', '#C07848', '#8B5E3C'];

/** Role-specific hair colors */
const ROLE_HAIR_COLORS: Record<AgentRole, string> = {
  PM:        '#2A1A0A',  // dark brown
  DEVELOPER: '#1A1A3A',  // dark blue-black
  REVIEWER:  '#C8A060',  // blonde
  TESTER:    '#8A2010',  // auburn red
  DEVOPS:    '#111111',  // near black
};

function hashId(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ------------------------------------------------------------------ */
/*  Hair styles per role                                                */
/* ------------------------------------------------------------------ */

function HairStyle({ role, color }: { role: AgentRole; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.8} />;

  switch (role) {
    case 'PM':
      // 3 upward spikes – authoritative
      return (
        <group position={[0, 0.225, 0]}>
          <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.1, 0.2, 0.1]} />{mat}</mesh>
          <mesh position={[-0.12, 0.07, 0]}><boxGeometry args={[0.09, 0.14, 0.09]} />{mat}</mesh>
          <mesh position={[0.12, 0.07, 0]}><boxGeometry args={[0.09, 0.14, 0.09]} />{mat}</mesh>
        </group>
      );

    case 'DEVELOPER':
      // Flat top + side falls – classic dev look
      return (
        <group position={[0, 0.225, 0]}>
          {/* Top flat layer */}
          <mesh position={[0, 0.05, 0]}><boxGeometry args={[0.44, 0.08, 0.44]} />{mat}</mesh>
          {/* Side falls */}
          <mesh position={[-0.22, -0.05, 0]}><boxGeometry args={[0.05, 0.18, 0.4]} />{mat}</mesh>
          <mesh position={[0.22, -0.05, 0]}><boxGeometry args={[0.05, 0.18, 0.4]} />{mat}</mesh>
          {/* Back fall */}
          <mesh position={[0, -0.05, -0.22]}><boxGeometry args={[0.42, 0.18, 0.05]} />{mat}</mesh>
        </group>
      );

    case 'REVIEWER':
      // Neat side-parted blocks
      return (
        <group position={[0, 0.225, 0]}>
          <mesh position={[0.04, 0.05, 0]}><boxGeometry args={[0.38, 0.08, 0.44]} />{mat}</mesh>
          <mesh position={[-0.21, 0.0, 0]}><boxGeometry args={[0.06, 0.12, 0.42]} />{mat}</mesh>
          <mesh position={[0, -0.04, -0.22]}><boxGeometry args={[0.42, 0.1, 0.05]} />{mat}</mesh>
        </group>
      );

    case 'TESTER':
      // Curly / afro cluster of cubes
      return (
        <group position={[0, 0.225, 0]}>
          {[[-0.13, 0.1, 0.1], [0.13, 0.1, 0.1], [0, 0.14, 0],
            [-0.13, 0.1, -0.1], [0.13, 0.1, -0.1], [0, 0.08, 0.15],
            [-0.06, 0.12, -0.13], [0.06, 0.12, -0.13]].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]}>
              <boxGeometry args={[0.14, 0.14, 0.14]} />
              {mat}
            </mesh>
          ))}
        </group>
      );

    case 'DEVOPS':
      // Ultra-short buzz cut
      return (
        <group position={[0, 0.225, 0]}>
          <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.44, 0.05, 0.44]} />{mat}</mesh>
        </group>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Role accessories (on body/face)                                    */
/* ------------------------------------------------------------------ */

function RoleAccessory({ role, roleColor }: { role: AgentRole; roleColor: string }) {
  switch (role) {
    case 'PM':
      // Tie – vertical strip on torso
      return (
        <group>
          <mesh position={[0, 1.15, 0.155]}>
            <boxGeometry args={[0.07, 0.42, 0.02]} />
            <meshStandardMaterial color="#FFD700" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.9, 0.155]}>
            <boxGeometry args={[0.1, 0.1, 0.02]} />
            <meshStandardMaterial color="#FFD700" roughness={0.4} />
          </mesh>
        </group>
      );

    case 'DEVELOPER':
      // Hoodie front pocket
      return (
        <mesh position={[0, 0.88, 0.155]}>
          <boxGeometry args={[0.28, 0.14, 0.02]} />
          <meshStandardMaterial color={new THREE.Color(roleColor).multiplyScalar(0.7).getStyle()} roughness={0.7} />
        </mesh>
      );

    case 'REVIEWER':
      // Glasses – two small frames on face
      return (
        <group position={[0, 1.66, 0.235]}>
          <mesh position={[-0.1, 0.04, 0]}>
            <boxGeometry args={[0.1, 0.07, 0.01]} />
            <meshStandardMaterial color="#888" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0.1, 0.04, 0]}>
            <boxGeometry args={[0.1, 0.07, 0.01]} />
            <meshStandardMaterial color="#888" roughness={0.3} metalness={0.5} />
          </mesh>
          {/* Bridge */}
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.06, 0.015, 0.01]} />
            <meshStandardMaterial color="#888" roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      );

    case 'TESTER':
      // Clipboard badge on torso
      return (
        <mesh position={[0.12, 1.2, 0.155]}>
          <boxGeometry args={[0.12, 0.15, 0.015]} />
          <meshStandardMaterial color="#F0F0E0" roughness={0.6} />
        </mesh>
      );

    case 'DEVOPS':
      // Headset – arc over head + earpiece
      return (
        <group position={[0, 1.65, 0]}>
          {/* Headband arc */}
          <mesh position={[0, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.24, 0.025, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#222" roughness={0.3} />
          </mesh>
          {/* Ear cups */}
          <mesh position={[-0.265, 0.06, 0]}>
            <boxGeometry args={[0.04, 0.1, 0.06]} />
            <meshStandardMaterial color="#333" roughness={0.3} />
          </mesh>
          <mesh position={[0.265, 0.06, 0]}>
            <boxGeometry args={[0.04, 0.1, 0.06]} />
            <meshStandardMaterial color="#333" roughness={0.3} />
          </mesh>
          {/* Mic boom */}
          <mesh position={[-0.33, -0.04, 0.1]} rotation={[0, 0.3, -0.4]}>
            <boxGeometry args={[0.015, 0.12, 0.015]} />
            <meshStandardMaterial color="#444" roughness={0.3} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  State accessories (held items / overlays)                          */
/* ------------------------------------------------------------------ */

function StateAccessories({ state, roleColor }: { state: AgentVisualState; roleColor: string }) {
  switch (state) {
    case 'COFFEE':
      return (
        <group position={[0.4, 1.4, 0.25]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.12, 8]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 8]} />
            <meshStandardMaterial color="#4a2a1a" />
          </mesh>
        </group>
      );

    case 'READING':
      return (
        <group position={[0, 1.35, 0.3]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.4, 0.04]} />
            <meshStandardMaterial color={roleColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[0.24, 0.34]} />
            <meshStandardMaterial color="#f8f8f0" />
          </mesh>
        </group>
      );

    case 'THINKING':
      return (
        <group position={[0.3, 2.1, 0]}>
          <Html center distanceFactor={8} zIndexRange={[10, 0]}>
            <div style={{ fontSize: '18px', animation: 'pulse 1.5s infinite', pointerEvents: 'none' }}>
              ???
            </div>
          </Html>
        </group>
      );

    case 'NAPPING':
      return (
        <group position={[0.3, 1.9, 0]}>
          <Html center distanceFactor={8} zIndexRange={[10, 0]}>
            <div
              style={{
                fontSize: '16px',
                color: '#88aaff',
                fontWeight: 'bold',
                animation: 'float 2s infinite',
                pointerEvents: 'none',
              }}
            >
              Zzz
            </div>
          </Html>
        </group>
      );

    case 'GAMING':
      return (
        <group position={[0, 1.35, 0.3]}>
          <mesh castShadow>
            <boxGeometry args={[0.25, 0.1, 0.15]} />
            <meshStandardMaterial color="#333" roughness={0.3} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Arm animation helper                                                */
/* ------------------------------------------------------------------ */

function animateArms(
  state: AgentVisualState,
  t: number,
  left: THREE.Mesh | null,
  right: THREE.Mesh | null,
) {
  if (!left || !right) return;

  switch (state) {
    case 'WORKING':
      left.position.y = 1.1 + Math.sin(t * 8) * 0.06;
      right.position.y = 1.1 + Math.sin(t * 8 + Math.PI) * 0.06;
      left.position.z = 0.15;
      right.position.z = 0.15;
      break;
    case 'COFFEE':
      right.position.y = 1.3;
      right.position.z = 0.2;
      left.position.y = 1.1;
      left.position.z = 0;
      break;
    case 'READING':
      left.position.y = 1.25;
      left.position.z = 0.2;
      right.position.y = 1.25;
      right.position.z = 0.2;
      break;
    case 'CHATTING':
      left.position.y = 1.1 + Math.sin(t * 3) * 0.15;
      right.position.y = 1.1 + Math.cos(t * 3) * 0.15;
      left.position.z = 0.1;
      right.position.z = 0.1;
      break;
    case 'WALKING':
      left.position.y = 1.1 + Math.sin(t * 4) * 0.1;
      right.position.y = 1.1 - Math.sin(t * 4) * 0.1;
      left.position.z = Math.sin(t * 4) * 0.1;
      right.position.z = -Math.sin(t * 4) * 0.1;
      break;
    case 'GAMING':
      left.position.y = 1.2;
      left.position.z = 0.2;
      right.position.y = 1.2;
      right.position.z = 0.2;
      left.rotation.x = Math.sin(t * 6) * 0.05;
      right.rotation.x = Math.cos(t * 6) * 0.05;
      break;
    case 'THINKING':
      right.position.y = 1.3;
      right.position.z = 0.15;
      left.position.y = 1.05;
      left.position.z = 0;
      break;
    case 'NAPPING':
      left.position.y = 1.1;
      right.position.y = 1.1;
      left.position.z = 0;
      right.position.z = 0;
      break;
    default:
      left.position.y = 1.1;
      right.position.y = 1.1;
      left.position.z = 0;
      right.position.z = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

interface AgentCharacterProps {
  agent: AgentState;
}

export function AgentCharacter({ agent }: AgentCharacterProps) {
  const groupRef   = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef  = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const headRef  = useRef<THREE.Group>(null);
  const bodyRef  = useRef<THREE.Group>(null);

  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const selectedAgentId    = useStore((s) => s.selectedAgentId);
  const isSelected = selectedAgentId === agent.id;

  const roleColor = ROLE_COLORS[agent.role];
  const hairColor = ROLE_HAIR_COLORS[agent.role];
  const skinColor = useMemo(
    () => SKIN_TONES[hashId(agent.id) % SKIN_TONES.length],
    [agent.id],
  );

  const targetPos  = useRef(new THREE.Vector3(agent.position.x, agent.position.y, agent.position.z));
  const navPath    = useRef<{ x: number; z: number }[]>([]);
  const navIdx     = useRef(0);
  const isNapping  = agent.visualState === 'NAPPING';

  // Set initial position imperatively — prevents R3F prop reconciliation from snapping
  // the character to agent.position on every store update (which would break path following).
  useLayoutEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(agent.position.x, 0, agent.position.z);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  useEffect(() => {
    const tx = agent.position.x;
    const tz = agent.position.z;
    targetPos.current.set(tx, agent.position.y, tz);

    if (!groupRef.current) return;
    const cx = groupRef.current.position.x;
    const cz = groupRef.current.position.z;

    if (agent.visualState === 'WALKING') {
      // Compute A* path from current visual position (not from agent.position)
      navPath.current = findPath(cx, cz, tx, tz);
      navIdx.current = 0;
    } else {
      navPath.current = [];
      navIdx.current = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.position.x, agent.position.y, agent.position.z]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    // ── Position update ──────────────────────────────────────────────
    if (agent.visualState === 'WALKING' && navPath.current.length > 0) {
      // A* waypoint following at constant walk speed
      const WALK_SPEED = 0.055; // units per frame (~3.3 units/sec @ 60fps)
      const ARRIVE_DIST = 0.18;

      const wp = navPath.current[navIdx.current];
      if (wp) {
        const dx = wp.x - groupRef.current.position.x;
        const dz = wp.z - groupRef.current.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < ARRIVE_DIST) {
          // Snap to waypoint and advance
          groupRef.current.position.x = wp.x;
          groupRef.current.position.z = wp.z;
          navIdx.current = Math.min(navIdx.current + 1, navPath.current.length - 1);
        } else {
          // Move toward waypoint at constant speed
          const inv = WALK_SPEED / dist;
          groupRef.current.position.x += dx * inv;
          groupRef.current.position.z += dz * inv;
        }
      }
    } else {
      // Smooth lerp for idle/non-walking transitions
      const speed = 0.05;
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetPos.current.x, speed);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetPos.current.z, speed);
    }

    if (agent.visualState === 'WALKING') {
      const dx = targetPos.current.x - groupRef.current.position.x;
      const dz = targetPos.current.z - groupRef.current.position.z;
      if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        if (bodyRef.current) {
          let diff = targetAngle - bodyRef.current.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          bodyRef.current.rotation.y += diff * 0.08;
        }
      }
    }

    const bobAmount = isNapping ? 0 : 0.06;
    groupRef.current.position.y = targetPos.current.y + Math.sin(t * 2) * bobAmount;

    animateArms(agent.visualState, t, leftArmRef.current, rightArmRef.current);

    if (leftLegRef.current && rightLegRef.current) {
      if (agent.visualState === 'WALKING') {
        leftLegRef.current.position.z = Math.sin(t * 5) * 0.12;
        rightLegRef.current.position.z = -Math.sin(t * 5) * 0.12;
      } else {
        leftLegRef.current.position.z = THREE.MathUtils.lerp(leftLegRef.current.position.z, 0, 0.1);
        rightLegRef.current.position.z = THREE.MathUtils.lerp(rightLegRef.current.position.z, 0, 0.1);
      }
    }

    if (headRef.current) {
      if (agent.visualState === 'THINKING') {
        headRef.current.rotation.z = Math.sin(t * 1.5) * 0.15;
      } else {
        headRef.current.rotation.z = 0;
      }
    }

    if (bodyRef.current) {
      if (isNapping) {
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, Math.PI / 2, 0.018);
      } else {
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, 0, 0.018);
      }
      if (agent.visualState !== 'WALKING') {
        bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, 0, 0.03);
      }
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); setSelectedAgentId(isSelected ? null : agent.id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.6, 0.75, 24]} />
          <meshBasicMaterial color="#FFD700" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <group ref={bodyRef}>
        {/* ── Head ── */}
        <group ref={headRef} position={[0, 1.65, 0]}>
          {/* Head block */}
          <mesh castShadow>
            <boxGeometry args={[0.45, 0.45, 0.45]} />
            <meshStandardMaterial color={skinColor} roughness={0.65} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.1, 0.04, 0.228]}>
            <boxGeometry args={[0.08, 0.08, 0.01]} />
            <meshStandardMaterial color="#1a1a2a" roughness={0.2} />
          </mesh>
          <mesh position={[0.1, 0.04, 0.228]}>
            <boxGeometry args={[0.08, 0.08, 0.01]} />
            <meshStandardMaterial color="#1a1a2a" roughness={0.2} />
          </mesh>
          {/* Eye shine */}
          <mesh position={[-0.08, 0.06, 0.229]}>
            <boxGeometry args={[0.025, 0.025, 0.005]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.12, 0.06, 0.229]}>
            <boxGeometry args={[0.025, 0.025, 0.005]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {/* Mouth */}
          <mesh position={[0, -0.1, 0.228]}>
            <boxGeometry args={[0.14, 0.03, 0.01]} />
            <meshStandardMaterial color="#cc6666" roughness={0.5} />
          </mesh>

          {/* Hair */}
          <HairStyle role={agent.role} color={hairColor} />

          {/* Role accessory on face (glasses for REVIEWER) */}
          {agent.role === 'REVIEWER' && (
            <RoleAccessory role={agent.role} roleColor={roleColor} />
          )}
        </group>

        {/* ── Torso ── */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.55, 0.65, 0.3]} />
          <meshStandardMaterial color={roleColor} roughness={0.55} />
        </mesh>

        {/* Role badge stripe on shoulder */}
        <mesh position={[-0.28, 1.36, 0.06]}>
          <boxGeometry args={[0.03, 0.06, 0.22]} />
          <meshStandardMaterial
            color={new THREE.Color(roleColor).multiplyScalar(1.4).getStyle()}
            roughness={0.3}
            emissive={roleColor}
            emissiveIntensity={0.25}
          />
        </mesh>

        {/* Role-specific body accessory (tie, pocket, headset, badge) */}
        {agent.role !== 'REVIEWER' && agent.role !== 'DEVOPS' && (
          <RoleAccessory role={agent.role} roleColor={roleColor} />
        )}
        {agent.role === 'DEVOPS' && (
          <RoleAccessory role={agent.role} roleColor={roleColor} />
        )}

        {/* ── Arms ── */}
        <mesh ref={leftArmRef} position={[-0.4, 1.1, 0]} castShadow>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={roleColor} roughness={0.55} />
        </mesh>
        {/* Left hand */}
        <mesh position={[-0.4, 0.78, 0]}>
          <boxGeometry args={[0.16, 0.12, 0.18]} />
          <meshStandardMaterial color={skinColor} roughness={0.65} />
        </mesh>

        <mesh ref={rightArmRef} position={[0.4, 1.1, 0]} castShadow>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={roleColor} roughness={0.55} />
        </mesh>
        {/* Right hand */}
        <mesh position={[0.4, 0.78, 0]}>
          <boxGeometry args={[0.16, 0.12, 0.18]} />
          <meshStandardMaterial color={skinColor} roughness={0.65} />
        </mesh>

        {/* ── Legs ── */}
        <mesh ref={leftLegRef} position={[-0.14, 0.35, 0]} castShadow>
          <boxGeometry args={[0.22, 0.7, 0.24]} />
          <meshStandardMaterial color="#223" roughness={0.75} />
        </mesh>
        <mesh ref={rightLegRef} position={[0.14, 0.35, 0]} castShadow>
          <boxGeometry args={[0.22, 0.7, 0.24]} />
          <meshStandardMaterial color="#223" roughness={0.75} />
        </mesh>
        {/* Shoes */}
        <mesh position={[-0.14, 0.02, 0.04]}>
          <boxGeometry args={[0.22, 0.06, 0.3]} />
          <meshStandardMaterial color="#111" roughness={0.5} />
        </mesh>
        <mesh position={[0.14, 0.02, 0.04]}>
          <boxGeometry args={[0.22, 0.06, 0.3]} />
          <meshStandardMaterial color="#111" roughness={0.5} />
        </mesh>

        {/* State accessories (coffee cup, book, Zzz, etc.) */}
        <StateAccessories state={agent.visualState} roleColor={roleColor} />
      </group>

      {/* Name tag (HTML overlay) */}
      <Html position={[0, 2.2, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div
          style={{
            background: 'rgba(10, 10, 26, 0.88)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'Inter, system-ui, sans-serif',
            whiteSpace: 'nowrap',
            border: `1px solid ${roleColor}`,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600 }}>{agent.name}</div>
          <div style={{ fontSize: '9px', opacity: 0.7, color: roleColor }}>{agent.visualState}</div>
        </div>
      </Html>
    </group>
  );
}
