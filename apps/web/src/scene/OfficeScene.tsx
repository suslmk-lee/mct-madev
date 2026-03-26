import { Floor } from './Floor';
import { Rooms } from './Rooms';
import { Lighting } from './Lighting';
import { DayNightCycle } from './DayNightCycle';
import { AgentCharacter } from './AgentCharacter';
import { CameraSystem } from './CameraSystem';
import { useStore } from '../store/useStore';

export function OfficeScene() {
  const agents = useStore((s) => s.agents);

  return (
    <>
      <DayNightCycle />
      <Lighting />
      <CameraSystem />
      <Floor />
      <Rooms />
      {agents.map((agent) => (
        <AgentCharacter key={agent.id} agent={agent} />
      ))}
    </>
  );
}
