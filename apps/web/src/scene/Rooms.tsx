import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Room shell                                                          */
/* ------------------------------------------------------------------ */

interface RoomProps {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  label: string;
  children?: React.ReactNode;
}

function Wall({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.3} roughness={0.6} />
    </mesh>
  );
}

function Room({ position, size, color, label, children }: RoomProps) {
  const [w, h, d] = size;
  const t = 0.12;
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={0.1} />
      </mesh>
      <Wall position={[0, h / 2, -d / 2]} size={[w, h, t]} color={color} />
      <Wall position={[0, h / 2,  d / 2]} size={[w, h, t]} color={color} />
      <Wall position={[-w / 2, h / 2, 0]} size={[t, h, d]} color={color} />
      <Wall position={[ w / 2, h / 2, 0]} size={[t, h, d]} color={color} />
      <Text position={[0, h + 0.3, 0]} fontSize={0.45} color={color} anchorX="center" anchorY="bottom" font={undefined}>
        {label}
      </Text>
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Desk model                                                          */
/* ------------------------------------------------------------------ */

function Desk({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Desktop surface */}
      <RoundedBox args={[1.25, 0.07, 0.65]} radius={0.03} smoothness={3} position={[0, 0.585, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#7a6040" roughness={0.55} metalness={0.05} />
      </RoundedBox>
      {/* Desktop edge strip (darker) */}
      <mesh position={[0, 0.56, 0.32]}>
        <boxGeometry args={[1.25, 0.04, 0.01]} />
        <meshStandardMaterial color="#5a4030" roughness={0.7} />
      </mesh>
      {/* Front legs (metal) */}
      <mesh position={[-0.52, 0.27, 0.26]} castShadow>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0.52, 0.27, 0.26]} castShadow>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Back legs */}
      <mesh position={[-0.52, 0.27, -0.26]} castShadow>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0.52, 0.27, -0.26]} castShadow>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Cross brace */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.9, 0.04, 0.04]} />
        <meshStandardMaterial color="#444" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Small drawer */}
      <RoundedBox args={[0.28, 0.1, 0.58]} radius={0.01} smoothness={2} position={[0.4, 0.52, 0]} castShadow>
        <meshStandardMaterial color="#6a5030" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0.4, 0.52, 0.3]}>
        <cylinderGeometry args={[0.02, 0.02, 0.03, 8]} rotation={[Math.PI / 2, 0, 0] as unknown as THREE.Euler} />
        <meshStandardMaterial color="#bbb" roughness={0.2} metalness={0.9} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Office chair model                                                  */
/* ------------------------------------------------------------------ */

function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat cushion */}
      <RoundedBox args={[0.48, 0.1, 0.48]} radius={0.04} smoothness={3} position={[0, 0.42, 0]} castShadow>
        <meshStandardMaterial color="#2a4a7a" roughness={0.7} />
      </RoundedBox>
      {/* Back rest */}
      <RoundedBox args={[0.44, 0.52, 0.08]} radius={0.04} smoothness={3} position={[0, 0.77, -0.2]} castShadow>
        <meshStandardMaterial color="#2a4a7a" roughness={0.7} />
      </RoundedBox>
      {/* Back support spine */}
      <mesh position={[0, 0.55, -0.22]} castShadow>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Arm rests */}
      <RoundedBox args={[0.06, 0.04, 0.36]} radius={0.02} smoothness={2} position={[-0.26, 0.6, 0.02]} castShadow>
        <meshStandardMaterial color="#1a3060" roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[0.06, 0.04, 0.36]} radius={0.02} smoothness={2} position={[0.26, 0.6, 0.02]} castShadow>
        <meshStandardMaterial color="#1a3060" roughness={0.6} />
      </RoundedBox>
      {/* Arm supports */}
      <mesh position={[-0.26, 0.47, 0.08]}>
        <boxGeometry args={[0.04, 0.28, 0.04]} />
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.8} />
      </mesh>
      <mesh position={[0.26, 0.47, 0.08]}>
        <boxGeometry args={[0.04, 0.28, 0.04]} />
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Pneumatic column */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.38, 8]} />
        <meshStandardMaterial color="#555" roughness={0.2} metalness={0.9} />
      </mesh>
      {/* 5-star base */}
      {[0, 72, 144, 216, 288].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <group key={i}>
            <mesh
              position={[Math.sin(rad) * 0.22, 0.04, Math.cos(rad) * 0.22]}
              rotation={[0, -rad, 0]}
              castShadow
            >
              <boxGeometry args={[0.04, 0.04, 0.44]} />
              <meshStandardMaterial color="#444" roughness={0.2} metalness={0.8} />
            </mesh>
            {/* Caster */}
            <mesh position={[Math.sin(rad) * 0.42, 0.05, Math.cos(rad) * 0.42]}>
              <sphereGeometry args={[0.04, 6, 6]} />
              <meshStandardMaterial color="#222" roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Monitor model                                                       */
/* ------------------------------------------------------------------ */

function Monitor({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Screen bezel */}
      <RoundedBox args={[0.54, 0.38, 0.04]} radius={0.02} smoothness={3} position={[0, 0.88, 0]} castShadow>
        <meshStandardMaterial color="#1a1a2a" roughness={0.3} metalness={0.3} />
      </RoundedBox>
      {/* Screen panel */}
      <mesh position={[0, 0.88, 0.022]}>
        <planeGeometry args={[0.48, 0.32]} />
        <meshStandardMaterial
          color="#1a3a6a"
          emissive="#2a5a9a"
          emissiveIntensity={0.5}
          roughness={0.1}
        />
      </mesh>
      {/* Screen content lines (fake UI) */}
      <mesh position={[-0.1, 0.91, 0.024]}>
        <planeGeometry args={[0.2, 0.02]} />
        <meshStandardMaterial color="#88ccff" emissive="#88ccff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.05, 0.86, 0.024]}>
        <planeGeometry args={[0.28, 0.02]} />
        <meshStandardMaterial color="#66aa88" emissive="#66aa88" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.05, 0.81, 0.024]}>
        <planeGeometry args={[0.22, 0.02]} />
        <meshStandardMaterial color="#aaaaff" emissive="#aaaaff" emissiveIntensity={0.6} />
      </mesh>
      {/* Webcam bump */}
      <mesh position={[0, 1.082, 0.022]}>
        <boxGeometry args={[0.05, 0.025, 0.015]} />
        <meshStandardMaterial color="#111" roughness={0.2} />
      </mesh>
      {/* Status LED */}
      <mesh position={[0.25, 0.72, 0.022]}>
        <boxGeometry args={[0.012, 0.012, 0.005]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={1.2} />
      </mesh>
      {/* Monitor neck */}
      <mesh position={[0, 0.68, -0.04]} castShadow>
        <boxGeometry args={[0.04, 0.14, 0.04]} />
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Monitor arm (horizontal) */}
      <mesh position={[0, 0.64, -0.1]}>
        <boxGeometry args={[0.04, 0.04, 0.12]} />
        <meshStandardMaterial color="#444" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Base */}
      <RoundedBox args={[0.28, 0.04, 0.2]} radius={0.02} smoothness={2} position={[0, 0.62, -0.14]} castShadow>
        <meshStandardMaterial color="#222" roughness={0.3} metalness={0.6} />
      </RoundedBox>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyboard model                                                      */
/* ------------------------------------------------------------------ */

function Keyboard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.36, 0.02, 0.14]} radius={0.01} smoothness={2} position={[0, 0.62, 0.1]} castShadow>
        <meshStandardMaterial color="#2a2a3a" roughness={0.5} />
      </RoundedBox>
      {/* Key rows */}
      {[0, 0.04, 0.08].map((zOff, i) => (
        <mesh key={i} position={[0, 0.632, 0.06 + zOff]}>
          <boxGeometry args={[0.3, 0.005, 0.025]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Meeting table                                                       */
/* ------------------------------------------------------------------ */

function MeetingTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table top */}
      <RoundedBox args={[2.6, 0.08, 1.3]} radius={0.04} smoothness={3} position={[0, 0.58, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a7050" roughness={0.5} metalness={0.05} />
      </RoundedBox>
      {/* Top edge highlight */}
      <mesh position={[0, 0.625, 0]}>
        <boxGeometry args={[2.56, 0.01, 1.26]} />
        <meshStandardMaterial color="#a08860" roughness={0.3} />
      </mesh>
      {/* Two pedestal supports */}
      <mesh position={[-0.8, 0.3, 0]} castShadow>
        <boxGeometry args={[0.12, 0.56, 0.12]} />
        <meshStandardMaterial color="#444" roughness={0.2} metalness={0.8} />
      </mesh>
      <mesh position={[0.8, 0.3, 0]} castShadow>
        <boxGeometry args={[0.12, 0.56, 0.12]} />
        <meshStandardMaterial color="#444" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Base plates */}
      <RoundedBox args={[0.6, 0.04, 0.5]} radius={0.02} smoothness={2} position={[-0.8, 0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.6, 0.04, 0.5]} radius={0.02} smoothness={2} position={[0.8, 0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#333" roughness={0.2} metalness={0.9} />
      </RoundedBox>
      {/* Power strip in center */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.3, 0.02, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Couch model                                                         */
/* ------------------------------------------------------------------ */

function Couch({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Base frame */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.14, 0.72]} />
        <meshStandardMaterial color="#6a3a4a" roughness={0.6} />
      </mesh>
      {/* 3 seat cushions */}
      {[-0.52, 0, 0.52].map((x, i) => (
        <RoundedBox key={i} args={[0.48, 0.16, 0.62]} radius={0.05} smoothness={3} position={[x, 0.3, 0.02]} castShadow>
          <meshStandardMaterial color="#8a4a5a" roughness={0.7} />
        </RoundedBox>
      ))}
      {/* Back rest */}
      <RoundedBox args={[1.64, 0.44, 0.14]} radius={0.05} smoothness={3} position={[0, 0.52, -0.3]} castShadow>
        <meshStandardMaterial color="#7a4050" roughness={0.7} />
      </RoundedBox>
      {/* Arm rests */}
      <RoundedBox args={[0.16, 0.32, 0.72]} radius={0.04} smoothness={3} position={[-0.86, 0.36, 0]} castShadow>
        <meshStandardMaterial color="#7a4050" roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.16, 0.32, 0.72]} radius={0.04} smoothness={3} position={[0.86, 0.36, 0]} castShadow>
        <meshStandardMaterial color="#7a4050" roughness={0.7} />
      </RoundedBox>
      {/* Feet */}
      {[[-0.76, -0.26], [-0.76, 0.26], [0.76, -0.26], [0.76, 0.26]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.05, z]}>
          <cylinderGeometry args={[0.04, 0.04, 0.1, 6]} />
          <meshStandardMaterial color="#4a2a2a" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Coffee machine                                                      */
/* ------------------------------------------------------------------ */

function CoffeeMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Body */}
      <RoundedBox args={[0.38, 0.58, 0.32]} radius={0.03} smoothness={3} position={[0, 0.44, 0]} castShadow>
        <meshStandardMaterial color="#1a1a1a" roughness={0.25} metalness={0.7} />
      </RoundedBox>
      {/* Top panel (accent color) */}
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[0.36, 0.04, 0.3]} />
        <meshStandardMaterial color="#cc3333" roughness={0.3} metalness={0.3} />
      </mesh>
      {/* Water tank (side) */}
      <RoundedBox args={[0.1, 0.3, 0.24]} radius={0.02} smoothness={2} position={[-0.22, 0.5, 0]} castShadow>
        <meshStandardMaterial color="#3a3a4a" roughness={0.4} transparent opacity={0.8} />
      </RoundedBox>
      {/* Cup platform */}
      <mesh position={[0, 0.2, 0.08]}>
        <boxGeometry args={[0.2, 0.02, 0.12]} />
        <meshStandardMaterial color="#333" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Nozzle */}
      <mesh position={[0, 0.36, 0.14]}>
        <cylinderGeometry args={[0.015, 0.02, 0.08, 6]} />
        <meshStandardMaterial color="#666" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Buttons */}
      {[-0.07, 0, 0.07].map((x, i) => (
        <mesh key={i} position={[x, 0.6, 0.16]}>
          <cylinderGeometry args={[0.022, 0.022, 0.01, 8]} />
          <meshStandardMaterial
            color={i === 0 ? '#ff4444' : i === 1 ? '#44ff88' : '#4488ff'}
            emissive={i === 0 ? '#ff4444' : i === 1 ? '#44ff88' : '#4488ff'}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Bookshelf / whiteboard for War Room                                */
/* ------------------------------------------------------------------ */

function Whiteboard({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Frame */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.4, 0.9, 0.06]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Board surface */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[1.3, 0.82]} />
        <meshStandardMaterial color="#f8f8f4" roughness={0.8} />
      </mesh>
      {/* Some drawn lines */}
      <mesh position={[-0.2, 0.1, 0.034]}>
        <boxGeometry args={[0.6, 0.015, 0.002]} />
        <meshStandardMaterial color="#4488ff" roughness={0.5} />
      </mesh>
      <mesh position={[0.1, -0.1, 0.034]}>
        <boxGeometry args={[0.4, 0.015, 0.002]} />
        <meshStandardMaterial color="#ff4444" roughness={0.5} />
      </mesh>
      {/* Tray */}
      <mesh position={[0, -0.48, 0.04]}>
        <boxGeometry args={[1.3, 0.04, 0.05]} />
        <meshStandardMaterial color="#444" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.6, -0.8, 0]}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
        <meshStandardMaterial color="#444" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0.6, -0.8, 0]}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
        <meshStandardMaterial color="#444" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Shelf                                                               */
/* ------------------------------------------------------------------ */

function Shelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Back panel */}
      <mesh position={[0, 0.6, -0.18]} castShadow>
        <boxGeometry args={[0.9, 1.2, 0.04]} />
        <meshStandardMaterial color="#5a4030" roughness={0.7} />
      </mesh>
      {/* Shelves */}
      {[0.1, 0.5, 0.9].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.88, 0.04, 0.34]} />
          <meshStandardMaterial color="#6a5040" roughness={0.6} />
        </mesh>
      ))}
      {/* Books (colored boxes) */}
      {[
        [-0.3, 0.16, 0, '#4488ff', 0.07, 0.1, 0.24],
        [-0.2, 0.16, 0, '#ff6644', 0.06, 0.1, 0.24],
        [-0.1, 0.16, 0, '#44cc66', 0.07, 0.1, 0.24],
        [0.0,  0.16, 0, '#aa44cc', 0.06, 0.1, 0.24],
        [0.1,  0.16, 0, '#ffcc44', 0.07, 0.1, 0.24],
        [-0.2, 0.56, 0, '#cc4488', 0.08, 0.1, 0.24],
        [0.0,  0.56, 0, '#4488cc', 0.07, 0.1, 0.24],
        [0.15, 0.56, 0, '#44aa44', 0.06, 0.1, 0.24],
      ].map(([x, y, z, color, w, h, d], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
          <boxGeometry args={[w as number, h as number, d as number]} />
          <meshStandardMaterial color={color as string} roughness={0.7} />
        </mesh>
      ))}
      {/* Small plant pot */}
      <mesh position={[0.3, 0.14, 0]}>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 8]} />
        <meshStandardMaterial color="#8a5a3a" roughness={0.7} />
      </mesh>
      <mesh position={[0.3, 0.22, 0]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color="#33aa44" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Workstation cluster (desk + chair + monitor + keyboard)            */
/* ------------------------------------------------------------------ */

function Workstation({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  const [x, y, z] = position;
  return (
    <group>
      <Desk position={[x, y, z]} rotation={rotation} />
      <Monitor position={[x, y, z]} rotation={rotation} />
      <Keyboard position={[x, y, z]} rotation={rotation} />
      <Chair position={[x, y + 0, z + (rotation === 0 ? 0.6 : -0.6)]} rotation={rotation} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Full Rooms layout                                                   */
/* ------------------------------------------------------------------ */

export function Rooms() {
  return (
    <group>
      {/* ── CEO Room  (world center: [-8, 0, -7], local x:-2.5~2.5, z:-2~2) ── */}
      <Room position={[-8, 0, -7]} size={[5, 2.5, 4]} color="#FFD700" label="CEO Room">
        <Workstation position={[0, 0, 0]} rotation={0} />
        <Shelf position={[-1.6, 0, -1.3]} />
      </Room>

      {/* ── PM Hub  (world center: [0, 0, -7], local x:-3~3, z:-2~2) ── */}
      <Room position={[0, 0, -7]} size={[6, 2.2, 4]} color="#4488FF" label="PM Hub">
        <Workstation position={[-1.2, 0, 0]} rotation={0} />
        <Workstation position={[ 1.2, 0, 0]} rotation={0} />
        <Whiteboard position={[0, 1.4, -1.92]} rotation={0} />
      </Room>

      {/* ── Dev Zone  (world center: [-1.5, 0, 1], local x:-5~5, z:-3~3) ── */}
      <Room position={[-1.5, 0, 1]} size={[10, 2, 6]} color="#44CC66" label="Dev Zone">
        {/* Back row — facing +z (agents sit in front at z=-0.4) */}
        <Workstation position={[-3, 0, -1]} rotation={0} />
        <Workstation position={[-1, 0, -1]} rotation={0} />
        <Workstation position={[ 1, 0, -1]} rotation={0} />
        <Workstation position={[ 3, 0, -1]} rotation={0} />
        {/* Front row — facing -z (agents sit in front at z=0.9) */}
        <Workstation position={[-2, 0, 1.5]} rotation={Math.PI} />
        <Workstation position={[ 0, 0, 1.5]} rotation={Math.PI} />
      </Room>

      {/* ── War Room  (world center: [8, 0, -2], local x:-2.5~2.5, z:-3~3) ── */}
      <Room position={[8, 0, -2]} size={[5, 2.2, 6]} color="#FF8844" label="War Room">
        <MeetingTable position={[0, 0, 0]} />
        <Chair position={[-1.8, 0,  0]}  rotation={Math.PI / 2} />
        <Chair position={[ 1.8, 0,  0]}  rotation={-Math.PI / 2} />
        <Chair position={[0,    0, -1.5]} rotation={0} />
        <Chair position={[0,    0,  1.5]} rotation={Math.PI} />
        <Whiteboard position={[0, 1.4, -2.92]} rotation={0} />
      </Room>

      {/* ── Break Room  (world center: [-4, 0, 7], local x:-4~4, z:-2~2) ── */}
      <Room position={[-4, 0, 7]} size={[8, 1.8, 4]} color="#CC44CC" label="Break Room">
        <Couch position={[-2, 0, 0]} rotation={0} />
        <Couch position={[ 1, 0, 0.5]} rotation={Math.PI / 6} />
        <CoffeeMachine position={[3, 0, -1.2]} />
        {/* Small round side table */}
        <group position={[-0.5, 0, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.04, 8]} />
            <meshStandardMaterial color="#5a4030" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.4, 6]} />
            <meshStandardMaterial color="#444" roughness={0.3} metalness={0.7} />
          </mesh>
        </group>
      </Room>
    </group>
  );
}
