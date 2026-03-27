import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OfficeScene } from './scene/OfficeScene';
import { HUD } from './ui/HUD';
import { AgentDetailPanel } from './ui/AgentDetailPanel';
import { TaskList } from './ui/TaskList';
import { ChatPanel } from './ui/ChatPanel';
import { StatusLog } from './ui/StatusLog';
import { ProjectModal } from './ui/ProjectModal';
import { FilePanel } from './ui/FilePanel';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useWebSocket } from './hooks/useWebSocket';
import { useIdleBehavior } from './hooks/useIdleBehavior';
import { useStore } from './store/useStore';

export function App() {
  useWebSocket();
  useIdleBehavior();
  const loadProject = useStore((s) => s.loadProject);
  const loadProjects = useStore((s) => s.loadProjects);

  // On mount: fetch project list, load first project (or fall back to demo)
  useEffect(() => {
    (async () => {
      try {
        await loadProjects();
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('API unavailable');
        const data = await res.json();
        const projects = data.data as Array<{ id: string; status?: string }>;
        // Load first ACTIVE project, or first available
        const active = projects.find((p) => p.status === 'ACTIVE') ?? projects[0];
        if (active) {
          await loadProject(active.id);
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
      <ErrorBoundary fallback={
        <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a1a', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          3D 씬을 불러올 수 없습니다.
        </div>
      }>
        <Canvas
          shadows
          camera={{ position: [25, 22, 25], fov: 30, near: 0.1, far: 500 }}
          gl={{ antialias: true, toneMapping: 3 /* ACESFilmic */ }}
          onPointerMissed={() => {
            // Deselect agent when clicking empty space
            // (handled by store if needed)
          }}
        >
          <OfficeScene />
        </Canvas>
      </ErrorBoundary>
      <ErrorBoundary>
        <HUD />
        <StatusLog />
        <AgentDetailPanel />
        <TaskList />
        <ChatPanel />
        <ProjectModal />
        <FilePanel />
      </ErrorBoundary>

      {/* Global animation keyframes + dark select */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        select option {
          background: #1a1a2e;
          color: #fff;
        }
        select option:checked {
          background: #2a2a4e;
        }
      `}</style>
    </div>
  );
}
