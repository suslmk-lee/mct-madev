import { Text } from '@react-three/drei';

interface RoomProps {
  position: [number, number, number];
  size: [number, number, number]; // width, height, depth
  color: string;
  label: string;
  children?: React.ReactNode;
}

function Wall({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.35} roughness={0.6} />
    </mesh>
  );
}

function Room({ position, size, color, label, children }: RoomProps) {
  const [w, h, d] = size;
  const wallThickness = 0.12;
  const wallHeight = h;

  return (
    <group position={position}>
      {/* Floor tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={0.12} />
      </mesh>

      {/* Back wall */}
      <Wall
        position={[0, wallHeight / 2, -d / 2]}
        size={[w, wallHeight, wallThickness]}
        color={color}
      />
      {/* Front wall */}
      <Wall
        position={[0, wallHeight / 2, d / 2]}
        size={[w, wallHeight, wallThickness]}
        color={color}
      />
      {/* Left wall */}
      <Wall
        position={[-w / 2, wallHeight / 2, 0]}
        size={[wallThickness, wallHeight, d]}
        color={color}
      />
      {/* Right wall */}
      <Wall
        position={[w / 2, wallHeight / 2, 0]}
        size={[wallThickness, wallHeight, d]}
        color={color}
      />

      {/* Room label */}
      <Text
        position={[0, wallHeight + 0.3, 0]}
        fontSize={0.45}
        color={color}
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {label}
      </Text>

      {children}
    </group>
  );
}

/** Simple desk: flat top + 4 legs */
function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.6]} />
        <meshStandardMaterial color="#5c4a3a" roughness={0.7} />
      </mesh>
      {[[-0.5, 0, -0.22] as const, [0.5, 0, -0.22] as const, [-0.5, 0, 0.22] as const, [0.5, 0, 0.22] as const].map(
        ([x, , z], i) => (
          <mesh key={i} position={[x, 0.27, z]} castShadow>
            <boxGeometry args={[0.06, 0.54, 0.06]} />
            <meshStandardMaterial color="#4a3a2a" roughness={0.8} />
          </mesh>
        ),
      )}
    </group>
  );
}

/** Chair: simple seat + back */
function Chair({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
        <meshStandardMaterial color="#3a5a8a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.58, -0.2]} castShadow>
        <boxGeometry args={[0.45, 0.5, 0.06]} />
        <meshStandardMaterial color="#3a5a8a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.34, 6]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}

/** Meeting table: large oval-ish table */
function MeetingTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[2.5, 0.1, 1.2]} />
        <meshStandardMaterial color="#6a5a4a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, 0.54, 8]} />
        <meshStandardMaterial color="#4a3a2a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Couch */
function Couch({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[1.6, 0.3, 0.7]} />
        <meshStandardMaterial color="#8a5a6a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.52, -0.28]} castShadow>
        <boxGeometry args={[1.6, 0.4, 0.14]} />
        <meshStandardMaterial color="#7a4a5a" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Coffee machine */
function CoffeeMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.35]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[0.35, 0.06, 0.3]} />
        <meshStandardMaterial color="#aa3333" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Computer monitor on desk */
function Monitor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.03]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.3} />
      </mesh>
      {/* Screen glow */}
      <mesh position={[0, 0.82, 0.02]}>
        <planeGeometry args={[0.44, 0.29]} />
        <meshStandardMaterial color="#4488cc" emissive="#4488cc" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.63, 0]} castShadow>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}

export function Rooms() {
  return (
    <group>
      {/* CEO Room (top-left, smaller) */}
      <Room position={[-8, 0, -7]} size={[5, 2.5, 4]} color="#FFD700" label="CEO Room">
        <Desk position={[0, 0, 0]} />
        <Monitor position={[0, 0, -0.1]} />
        <Chair position={[0, 0, 0.6]} />
      </Room>

      {/* PM Hub (top-center) */}
      <Room position={[0, 0, -7]} size={[6, 2.2, 4]} color="#4488FF" label="PM Hub">
        <Desk position={[-1.2, 0, 0]} />
        <Monitor position={[-1.2, 0, -0.1]} />
        <Chair position={[-1.2, 0, 0.6]} />
        <Desk position={[1.2, 0, 0]} />
        <Monitor position={[1.2, 0, -0.1]} />
        <Chair position={[1.2, 0, 0.6]} />
      </Room>

      {/* Dev Zone (center, largest) */}
      <Room position={[-1.5, 0, 1]} size={[10, 2, 6]} color="#44CC66" label="Dev Zone">
        <Desk position={[-3, 0, -1]} />
        <Monitor position={[-3, 0, -1.1]} />
        <Chair position={[-3, 0, -0.4]} />
        <Desk position={[-1, 0, -1]} />
        <Monitor position={[-1, 0, -1.1]} />
        <Chair position={[-1, 0, -0.4]} />
        <Desk position={[1, 0, -1]} />
        <Monitor position={[1, 0, -1.1]} />
        <Chair position={[1, 0, -0.4]} />
        <Desk position={[3, 0, -1]} />
        <Monitor position={[3, 0, -1.1]} />
        <Chair position={[3, 0, -0.4]} />
        <Desk position={[-2, 0, 1.5]} />
        <Monitor position={[-2, 0, 1.4]} />
        <Chair position={[-2, 0, 2.1]} />
        <Desk position={[0, 0, 1.5]} />
        <Monitor position={[0, 0, 1.4]} />
        <Chair position={[0, 0, 2.1]} />
      </Room>

      {/* War Room (right side) */}
      <Room position={[8, 0, -2]} size={[5, 2.2, 6]} color="#FF8844" label="War Room">
        <MeetingTable position={[0, 0, 0]} />
        <Chair position={[-1.5, 0, 0]} />
        <Chair position={[1.5, 0, 0]} />
        <Chair position={[0, 0, -1]} />
        <Chair position={[0, 0, 1]} />
      </Room>

      {/* Break Room (bottom) */}
      <Room position={[-4, 0, 7]} size={[8, 1.8, 4]} color="#CC44CC" label="Break Room">
        <Couch position={[-2, 0, 0]} />
        <Couch position={[1, 0, 0.5]} rotation={Math.PI / 6} />
        <CoffeeMachine position={[3, 0, -1.2]} />
      </Room>
    </group>
  );
}
