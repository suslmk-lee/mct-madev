import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentState, AgentRole, AgentVisualState } from '../store/useStore';
import { useStore } from '../store/useStore';

const ROLE_COLORS: Record<AgentRole, string> = {
  PM: '#4488FF',
  DEVELOPER: '#44CC66',
  REVIEWER: '#FF8844',
  TESTER: '#AA66DD',
  DEVOPS: '#DD4444',
};

const SKIN_COLOR = '#FFD5B8';

interface AgentCharacterProps {
  agent: AgentState;
}

export function AgentCharacter({ agent }: AgentCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);

  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const isSelected = selectedAgentId === agent.id;

  const roleColor = ROLE_COLORS[agent.role];

  const targetPos = useRef(new THREE.Vector3(agent.position.x, agent.position.y, agent.position.z));
  const isNapping = agent.visualState === 'NAPPING';

  // Update target when position changes
  useEffect(() => {
    targetPos.current.set(agent.position.x, agent.position.y, agent.position.z);
  }, [agent.position.x, agent.position.y, agent.position.z]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    // Smoothly lerp to target position
    const speed = agent.visualState === 'WALKING' ? 0.035 : 0.05;
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetPos.current.x, speed);
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetPos.current.z, speed);

    // Face movement direction when walking (smooth turning)
    if (agent.visualState === 'WALKING') {
      const dx = targetPos.current.x - groupRef.current.position.x;
      const dz = targetPos.current.z - groupRef.current.position.z;
      if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        if (bodyRef.current) {
          // Smooth angle interpolation (handles wraparound)
          let diff = targetAngle - bodyRef.current.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          bodyRef.current.rotation.y += diff * 0.08;
        }
      }
    }

    // Idle bob for all states
    const bobAmount = agent.visualState === 'NAPPING' ? 0 : 0.06;
    groupRef.current.position.y = targetPos.current.y + Math.sin(t * 2) * bobAmount;

    // Arm animations based on state
    animateArms(agent.visualState, t, leftArmRef.current, rightArmRef.current);

    // Leg animations for walking
    if (leftLegRef.current && rightLegRef.current) {
      if (agent.visualState === 'WALKING') {
        leftLegRef.current.position.z = Math.sin(t * 5) * 0.12;
        rightLegRef.current.position.z = -Math.sin(t * 5) * 0.12;
      } else {
        leftLegRef.current.position.z = THREE.MathUtils.lerp(leftLegRef.current.position.z, 0, 0.1);
        rightLegRef.current.position.z = THREE.MathUtils.lerp(rightLegRef.current.position.z, 0, 0.1);
      }
    }

    // Head animations
    if (headRef.current) {
      if (agent.visualState === 'THINKING') {
        headRef.current.rotation.z = Math.sin(t * 1.5) * 0.15;
      } else {
        headRef.current.rotation.z = 0;
      }
    }

    // Body rotation
    if (bodyRef.current) {
      if (isNapping) {
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, Math.PI / 2, 0.05);
      } else {
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, 0, 0.05);
      }
      // Reset Y rotation when not walking
      if (agent.visualState !== 'WALKING') {
        bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, 0, 0.03);
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[agent.position.x, agent.position.y, agent.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedAgentId(isSelected ? null : agent.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.6, 0.75, 24]} />
          <meshBasicMaterial color="#FFD700" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <group ref={bodyRef}>
        {/* Head */}
        <group ref={headRef} position={[0, 1.65, 0]}>
          <RoundedBox args={[0.45, 0.45, 0.45]} radius={0.08} smoothness={4} castShadow>
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
          </RoundedBox>
          {/* Eyes */}
          <mesh position={[-0.1, 0.04, 0.23]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0.1, 0.04, 0.23]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          {/* Mouth - simple smile */}
          <mesh position={[0, -0.1, 0.23]}>
            <boxGeometry args={[0.15, 0.03, 0.01]} />
            <meshStandardMaterial color="#cc6666" />
          </mesh>
        </group>

        {/* Body / Torso */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.55, 0.65, 0.3]} />
          <meshStandardMaterial color={roleColor} roughness={0.5} />
        </mesh>

        {/* Left Arm */}
        <mesh ref={leftArmRef} position={[-0.4, 1.1, 0]} castShadow>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={roleColor} roughness={0.5} />
        </mesh>

        {/* Right Arm */}
        <mesh ref={rightArmRef} position={[0.4, 1.1, 0]} castShadow>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={roleColor} roughness={0.5} />
        </mesh>

        {/* Left Leg */}
        <mesh ref={leftLegRef} position={[-0.14, 0.35, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 0.24]} />
          <meshStandardMaterial color="#334" roughness={0.7} />
        </mesh>

        {/* Right Leg */}
        <mesh ref={rightLegRef} position={[0.14, 0.35, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 0.24]} />
          <meshStandardMaterial color="#334" roughness={0.7} />
        </mesh>

        {/* State-specific accessories */}
        <StateAccessories state={agent.visualState} roleColor={roleColor} />
      </group>

      {/* Name tag (HTML overlay) */}
      <Html position={[0, 2.15, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div
          style={{
            background: 'rgba(10, 10, 26, 0.85)',
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

function animateArms(
  state: AgentVisualState,
  t: number,
  left: THREE.Mesh | null,
  right: THREE.Mesh | null,
) {
  if (!left || !right) return;

  switch (state) {
    case 'WORKING':
      // Typing motion
      left.position.y = 1.1 + Math.sin(t * 8) * 0.06;
      right.position.y = 1.1 + Math.sin(t * 8 + Math.PI) * 0.06;
      left.position.z = 0.15;
      right.position.z = 0.15;
      break;
    case 'COFFEE':
      // Holding cup
      right.position.y = 1.3;
      right.position.z = 0.2;
      left.position.y = 1.1;
      left.position.z = 0;
      break;
    case 'READING':
      // Holding book
      left.position.y = 1.25;
      left.position.z = 0.2;
      right.position.y = 1.25;
      right.position.z = 0.2;
      break;
    case 'CHATTING':
      // Gesturing
      left.position.y = 1.1 + Math.sin(t * 3) * 0.15;
      right.position.y = 1.1 + Math.cos(t * 3) * 0.15;
      left.position.z = 0.1;
      right.position.z = 0.1;
      break;
    case 'WALKING':
      // Swinging arms while walking
      left.position.y = 1.1 + Math.sin(t * 4) * 0.1;
      right.position.y = 1.1 - Math.sin(t * 4) * 0.1;
      left.position.z = Math.sin(t * 4) * 0.1;
      right.position.z = -Math.sin(t * 4) * 0.1;
      break;
    case 'GAMING':
      // Holding controller
      left.position.y = 1.2;
      left.position.z = 0.2;
      right.position.y = 1.2;
      right.position.z = 0.2;
      // Thumbs moving
      left.rotation.x = Math.sin(t * 6) * 0.05;
      right.rotation.x = Math.cos(t * 6) * 0.05;
      break;
    case 'NAPPING':
      left.position.y = 1.1;
      right.position.y = 1.1;
      left.position.z = 0;
      right.position.z = 0;
      break;
    case 'THINKING':
      // Hand on chin pose
      right.position.y = 1.3;
      right.position.z = 0.15;
      left.position.y = 1.05;
      left.position.z = 0;
      break;
    default:
      // Reset to default
      left.position.y = 1.1;
      right.position.y = 1.1;
      left.position.z = 0;
      right.position.z = 0;
      break;
  }
}

function StateAccessories({ state, roleColor }: { state: AgentVisualState; roleColor: string }) {
  switch (state) {
    case 'COFFEE':
      return (
        <group position={[0.4, 1.4, 0.25]}>
          {/* Coffee cup */}
          <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.12, 8]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.4} />
          </mesh>
          {/* Coffee inside */}
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 8]} />
            <meshStandardMaterial color="#4a2a1a" />
          </mesh>
        </group>
      );

    case 'READING':
      return (
        <group position={[0, 1.35, 0.3]}>
          {/* Book */}
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
            <div
              style={{
                fontSize: '18px',
                animation: 'pulse 1.5s infinite',
                pointerEvents: 'none',
              }}
            >
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
          {/* Game controller */}
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
