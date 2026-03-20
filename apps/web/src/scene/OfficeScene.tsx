import { OrbitControls } from '@react-three/drei';
import { Floor } from './Floor';
import { Rooms } from './Rooms';
import { Lighting } from './Lighting';
import { DayNightCycle } from './DayNightCycle';
import { AgentCharacter } from './AgentCharacter';
import { useStore } from '../store/useStore';

export function OfficeScene() {
  const agents = useStore((s) => s.agents);

  return (
    <>
      <DayNightCycle />
      <Lighting />
      <OrbitControls
        makeDefault
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={5}
        maxDistance={40}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
      />
      <Floor />
      <Rooms />
      {agents.map((agent) => (
        <AgentCharacter key={agent.id} agent={agent} />
      ))}
    </>
  );
}
