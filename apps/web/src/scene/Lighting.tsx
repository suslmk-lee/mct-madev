import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export function Lighting() {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const currentHour = useStore((s) => s.currentHour);

  useFrame(() => {
    if (!dirLightRef.current || !ambientRef.current) return;

    // Compute day factor: 1.0 during day (07-21), 0.0 at night, with smooth transitions
    const dayFactor = getDayFactor(currentHour);

    // Ambient light: brighter during day
    const ambientIntensity = THREE.MathUtils.lerp(0.15, 0.6, dayFactor);
    ambientRef.current.intensity = ambientIntensity;

    // Ambient color: warm during day, blue at night
    const ambColor = new THREE.Color().lerpColors(
      new THREE.Color('#1a1a4a'), // night blue
      new THREE.Color('#fff5e6'), // day warm
      dayFactor,
    );
    ambientRef.current.color = ambColor;

    // Directional light (sun)
    const sunIntensity = THREE.MathUtils.lerp(0.1, 1.2, dayFactor);
    dirLightRef.current.intensity = sunIntensity;

    // Sun position based on hour
    const sunAngle = ((currentHour - 6) / 12) * Math.PI; // 6am = horizon, 12pm = top
    const sunX = Math.cos(sunAngle) * 15;
    const sunY = Math.max(Math.sin(sunAngle) * 20, 2);
    dirLightRef.current.position.set(sunX, sunY, -5);
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight
        ref={dirLightRef}
        castShadow
        intensity={1}
        position={[10, 15, -5]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />

      {/* Room point lights - always on, simulating indoor lighting */}
      {/* CEO Room */}
      <pointLight position={[-8, 2.2, -7]} intensity={0.8} color="#FFE4B5" distance={6} />
      {/* PM Hub */}
      <pointLight position={[0, 2, -7]} intensity={0.7} color="#B5D5FF" distance={7} />
      {/* Dev Zone */}
      <pointLight position={[-1.5, 1.8, 1]} intensity={0.9} color="#B5FFD5" distance={10} />
      {/* War Room */}
      <pointLight position={[8, 2, -2]} intensity={0.7} color="#FFD5B5" distance={7} />
      {/* Break Room */}
      <pointLight position={[-4, 1.6, 7]} intensity={0.6} color="#FFB5E6" distance={8} />
    </>
  );
}

function getDayFactor(hour: number): number {
  // Smooth day/night curve
  if (hour >= 8 && hour <= 19) return 1;
  if (hour >= 21 || hour <= 6) return 0;
  // Transitions
  if (hour > 6 && hour < 8) return (hour - 6) / 2; // dawn
  if (hour > 19 && hour < 21) return 1 - (hour - 19) / 2; // dusk
  return 0.5;
}
