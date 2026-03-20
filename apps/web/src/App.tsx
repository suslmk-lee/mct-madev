import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OfficeScene } from './scene/OfficeScene';
import { HUD } from './ui/HUD';
import { AgentDetailPanel } from './ui/AgentDetailPanel';
import { TaskList } from './ui/TaskList';
import { ChatPanel } from './ui/ChatPanel';
import { StatusLog } from './ui/StatusLog';
import { useWebSocket } from './hooks/useWebSocket';
import { useIdleBehavior } from './hooks/useIdleBehavior';
import { useStore } from './store/useStore';

export function App() {
  useWebSocket();
  useIdleBehavior();
  const loadProject = useStore((s) => s.loadProject);

  // On mount: fetch project list, load first project (or fall back to demo)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('API unavailable');
        const data = await res.json();
        const projects = data.data as Array<{ id: string }>;
        if (projects.length > 0) {
          await loadProject(projects[0].id);
          return;
        }
      } catch {
        // API unavailable
      }
      // Fallback: load demo data
      await loadProject('__demo__');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [15, 20, 15], fov: 50 }}
        gl={{ antialias: true, toneMapping: 3 /* ACESFilmic */ }}
        onPointerMissed={() => {
          // Deselect agent when clicking empty space
          // (handled by store if needed)
        }}
      >
        <OfficeScene />
      </Canvas>
      <HUD />
      <StatusLog />
      <AgentDetailPanel />
      <TaskList />
      <ChatPanel />

      {/* Global animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
