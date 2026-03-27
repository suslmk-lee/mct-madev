import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useStore } from '../store/useStore';

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  ext?: string;
}

const glassBase: CSSProperties = {
  background: 'rgba(10, 14, 30, 0.88)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const EXT_COLORS: Record<string, string> = {
  '.html': '#e34c26',
  '.css': '#563d7c',
  '.js':  '#f7df1e',
  '.ts':  '#3178c6',
  '.tsx': '#61dafb',
  '.jsx': '#61dafb',
  '.json': '#5c9e31',
  '.md':  '#ffffff',
  '.py':  '#3776ab',
  '.sh':  '#44cc66',
};

function getExtColor(ext?: string): string {
  return ext ? (EXT_COLORS[ext] ?? 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.2)';
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function FilePanel() {
  const currentProjectId = useStore((s) => s.currentProjectId);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${currentProjectId}/files`);
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data.files ?? []);
      setRepoPath(data.repoPath ?? null);
      setTruncated(data.truncated === true);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  // Reload files when panel opens
  useEffect(() => {
    if (open && currentProjectId) {
      loadFiles();
    }
  }, [open, currentProjectId, loadFiles]);

  // Listen for orchestration completion to auto-open panel
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.type === 'orchestration_complete') {
        setOpen(true);
        loadFiles();
      }
    };
    window.addEventListener('mct:event', handler as EventListener);
    return () => window.removeEventListener('mct:event', handler as EventListener);
  }, [loadFiles]);

  const loadFileContent = async (path: string) => {
    if (!currentProjectId) return;
    setSelectedFile(path);
    setContentLoading(true);
    setFileContent(null);
    try {
      const res = await fetch(`/api/projects/${currentProjectId}/files/content?path=${encodeURIComponent(path)}`);
      if (!res.ok) { setFileContent('(읽기 오류)'); return; }
      const data = await res.json();
      setFileContent(data.content ?? '');
    } finally {
      setContentLoading(false);
    }
  };

  const downloadFile = (path: string) => {
    if (!currentProjectId) return;
    window.open(`/api/projects/${currentProjectId}/files/download?path=${encodeURIComponent(path)}`, '_blank');
  };

  const fileItems = files.filter((f) => f.type === 'file');

  // Floating toggle button
  const toggleBtn = (
    <button
      onClick={() => setOpen((v) => !v)}
      title="생성된 파일 보기"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 90,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid rgba(68,136,255,0.4)',
        background: 'rgba(15,20,40,0.85)',
        color: '#88bbff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        transition: 'all 0.2s',
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(68,136,255,0.2)'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,20,40,0.85)'; }}
    >
      📁
      {fileItems.length > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          background: '#4488ff', color: '#fff',
          fontSize: 9, fontWeight: 700, borderRadius: '50%',
          minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 3px',
        }}>
          {fileItems.length}
        </span>
      )}
    </button>
  );

  if (!open) return <>{toggleBtn}</>;

  return (
    <>
      {toggleBtn}
      <div
        style={{
          position: 'fixed',
          bottom: 72,
          right: 20,
          width: selectedFile ? 760 : 320,
          maxHeight: '70vh',
          zIndex: 90,
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.25s',
          ...glassBase,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <span style={{ color: '#88bbff', fontSize: 13, fontWeight: 600 }}>
              📁 생성된 파일
            </span>
            {repoPath && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 2 }}>
                {repoPath}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={loadFiles}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13 }}
              title="새로고침"
            >↻</button>
            <button
              onClick={() => { setOpen(false); setSelectedFile(null); setFileContent(null); }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* File tree */}
          <div style={{ width: 280, flexShrink: 0, overflow: 'auto', borderRight: selectedFile ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            {loading ? (
              <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>로딩 중...</div>
            ) : files.length === 0 ? (
              <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                아직 생성된 파일이 없습니다.<br />
                <span style={{ fontSize: 11, opacity: 0.6 }}>태스크를 실행하면 여기에 파일이 나타납니다.</span>
              </div>
            ) : (
              <div style={{ padding: '6px 0' }}>
                {files.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => f.type === 'file' && loadFileContent(f.path)}
                    style={{
                      padding: '5px 14px',
                      cursor: f.type === 'file' ? 'pointer' : 'default',
                      fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: selectedFile === f.path ? 'rgba(68,136,255,0.15)' : 'transparent',
                      borderLeft: selectedFile === f.path ? '2px solid #4488ff' : '2px solid transparent',
                      transition: 'background 0.12s',
                      userSelect: 'none',
                    }}
                    onMouseOver={(e) => { if (f.type === 'file' && selectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseOut={(e) => { if (selectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {f.type === 'directory' ? (
                      <span style={{ color: '#ffaa44', fontSize: 11 }}>▶</span>
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: getExtColor(f.ext), flexShrink: 0 }} />
                    )}
                    <span style={{ color: f.type === 'directory' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.82)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.type === 'directory' ? f.path.slice(0, -1).split('/').pop() + '/' : f.path.split('/').pop()}
                    </span>
                    {f.type === 'file' && f.size && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                        {formatSize(f.size)}
                      </span>
                    )}
                    {f.type === 'file' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadFile(f.path); }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0 }}
                        title="다운로드"
                      >↓</button>
                    )}
                  </div>
                ))}
                {truncated && (
                  <div style={{ padding: '6px 14px', fontSize: 11, color: 'rgba(255,170,68,0.8)', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
                    ⚠ 500개 이상의 파일이 있습니다. 일부만 표시됩니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File content viewer */}
          {selectedFile && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '8px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              }}>
                <span>{selectedFile}</span>
                <button
                  onClick={() => { setSelectedFile(null); setFileContent(null); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 }}
                >×</button>
              </div>
              {contentLoading ? (
                <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>로딩 중...</div>
              ) : (
                <pre style={{
                  margin: 0, padding: '12px 16px',
                  fontSize: 11, lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.82)',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  flex: 1,
                  overflow: 'auto',
                }}>
                  {fileContent ?? ''}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
