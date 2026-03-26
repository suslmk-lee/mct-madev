import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

/* ------------------------------------------------------------------ */
/*  Camera Presets                                                     */
/* ------------------------------------------------------------------ */

interface CameraPresetConfig {
  target: [number, number, number];
  distance: number; // camera distance from target
}

const PRESETS: Record<string, CameraPresetConfig> = {
  overview: { target: [0, 0, 0], distance: 38 },
  ceo:       { target: [-8, 0, -7], distance: 18 },
  pm:        { target: [0, 0, -7], distance: 18 },
  dev:       { target: [-1.5, 0, 1], distance: 22 },
  warroom:   { target: [8, 0, -2], distance: 18 },
  breakroom: { target: [-4, 0, 7], distance: 20 },
};

/** Isometric-like offset direction (normalized [1,1,1]) */
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();

const LERP_FACTOR = 0.04;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CameraSystem() {
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const cameraPreset = useStore((s) => s.cameraPreset) ?? 'overview';
  const followAgentId = useStore((s) => s.followAgentId) ?? null;
  const agents = useStore((s) => s.agents);

  const _targetVec = useMemo(() => new THREE.Vector3(), []);
  const _posVec = useMemo(() => new THREE.Vector3(), []);

  const { camera } = useThree();

  // Ensure camera looks at origin on mount
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      camera.lookAt(0, 0, 0);
      initialized.current = true;
    }
  }, [camera]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    let desiredTarget: [number, number, number];
    let desiredDistance: number;

    if (followAgentId) {
      const agent = agents.find((a) => a.id === followAgentId);
      if (agent) {
        desiredTarget = [agent.position.x, 0, agent.position.z];
        desiredDistance = 16;
      } else {
        const preset = PRESETS[cameraPreset] ?? PRESETS.overview;
        desiredTarget = preset.target;
        desiredDistance = preset.distance;
      }
    } else {
      const preset = PRESETS[cameraPreset] ?? PRESETS.overview;
      desiredTarget = preset.target;
      desiredDistance = preset.distance;
    }

    // Smooth lerp OrbitControls target
    _targetVec.set(...desiredTarget);
    const ct = (controls as unknown as { target: THREE.Vector3 }).target;
    ct.lerp(_targetVec, LERP_FACTOR);

    // Smooth lerp camera position (keep isometric offset from target)
    _posVec.copy(ct).addScaledVector(ISO_DIR, desiredDistance);
    camera.position.lerp(_posVec, LERP_FACTOR);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate={false}
      enableDamping
      dampingFactor={0.08}
      enablePan
      minDistance={8}
      maxDistance={60}
      minPolarAngle={0.4}
      maxPolarAngle={Math.PI / 2.5}
      target={[0, 0, 0]}
    />
  );
}
