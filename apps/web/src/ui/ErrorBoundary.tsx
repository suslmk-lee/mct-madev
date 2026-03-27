import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[MCT-MADEV] Render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(10,10,26,0.95)',
          color: 'rgba(255,255,255,0.7)',
          gap: 16,
          zIndex: 9999,
        }}>
          <div style={{ fontSize: 32 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>렌더링 오류가 발생했습니다</div>
          <div style={{ fontSize: 12, color: 'rgba(255,100,100,0.8)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid rgba(68,136,255,0.4)',
              background: 'rgba(68,136,255,0.15)',
              color: '#88bbff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            재시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
