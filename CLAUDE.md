# MCT-MADEV

Multi-Agent Orchestration System with 3D Office UI.

## Quick Start

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

## Monorepo Structure

- `packages/core` - Types, TaskStateMachine, DAG, Orchestrator, WorkflowParser, PMAgent
- `packages/gateway` - Multi-model gateway (Anthropic, OpenAI, Google, Ollama, Kimi, MiniMax, GLM)
- `packages/db` - SQLite (sql.js) database adapter with full CRUD
- `packages/queue` - Queue abstraction (better-queue adapter)
- `packages/git` - Git worktree manager
- `packages/server` - Express API + WebSocket server
- `packages/cli` - CLI entry point (`mct-madev start/init/status/stop`)
- `apps/web` - React Three Fiber 3D office UI

## Build

```bash
pnpm build          # Build all packages
pnpm -r test        # Run all tests
```

## Conventions

- TypeScript strict mode everywhere
- ESM only (no CommonJS)
- Biome for linting/formatting
- Backend/DB timestamps in UTC, UI display in KST
- Package inter-dependencies use `workspace:*`
