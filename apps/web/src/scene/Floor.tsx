import { useRef } from 'react';
import * as THREE from 'three';

export function Floor() {
  const gridRef = useRef<THREE.GridHelper>(null);

  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 24]} />
        <meshStandardMaterial color="#2a2a3e" roughness={0.8} />
      </mesh>

      {/* Grid overlay */}
      <gridHelper
        ref={gridRef}
        args={[30, 30, '#3a3a5e', '#2e2e48']}
        position={[0, 0.01, 0]}
      />
    </group>
  );
}
