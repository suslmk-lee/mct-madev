import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

/**
 * DayNightCycle adjusts the scene background/fog color
 * based on the current KST hour.
 */
export function DayNightCycle() {
  const sceneRef = useRef(false);
  const currentHour = useStore((s) => s.currentHour);

  useFrame(({ scene }) => {
    if (!sceneRef.current) {
      scene.fog = new THREE.FogExp2('#0a0a1a', 0.012);
      sceneRef.current = true;
    }

    const dayFactor = getDayFactor(currentHour);

    // Lerp background color
    const bgColor = new THREE.Color().lerpColors(
      new THREE.Color('#0a0a1a'), // night
      new THREE.Color('#87CEEB'), // day sky
      dayFactor * 0.3, // keep it subtle since we're indoors
    );
    scene.background = bgColor;

    // Adjust fog density
    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color = bgColor;
      scene.fog.density = THREE.MathUtils.lerp(0.018, 0.008, dayFactor);
    }
  });

  return null;
}

function getDayFactor(hour: number): number {
  if (hour >= 8 && hour <= 19) return 1;
  if (hour >= 21 || hour <= 6) return 0;
  if (hour > 6 && hour < 8) return (hour - 6) / 2;
  if (hour > 19 && hour < 21) return 1 - (hour - 19) / 2;
  return 0.5;
}
