# MCT-MADEV

Multi-Agent Orchestration System with 3D Office UI.

## Quick Start

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

## Monorepo Structure

| Package | Description |
| --- | --- |
| `packages/core` | Types, TaskStateMachine, DAG, Orchestrator, WorkflowParser, PMAgent |
| `packages/gateway` | Multi-model gateway (Anthropic, OpenAI, Google, Ollama, Kimi, MiniMax, GLM) |
| `packages/db` | SQLite (sql.js) database adapter with full CRUD |
| `packages/queue` | Queue abstraction (better-queue adapter) |
| `packages/git` | Git worktree manager |
| `packages/server` | Express API + WebSocket server |
| `packages/cli` | CLI entry point |
| `apps/web` | React Three Fiber 3D office UI |

## Usage Workflow

### 인터랙티브 모드 (권장)

`start` 명령으로 서버를 시작하면 인터랙티브 메뉴가 자동으로 표시됩니다.

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

```
  MCT-MADEV is running!

  API:     http://localhost:3000/api/health
  UI:      http://localhost:3000
  WS:      ws://localhost:3000/ws

  Interactive mode ready. Select an action below.

? What would you like to do? (Use arrow keys)
❯ Add agent
  List agents
  Show agent
  Update agent
  Remove agent
  Exit
```

메뉴에서 작업을 선택하면 인터랙티브 프롬프트가 진행되고, 완료 후 다시 메뉴로 돌아옵니다. `Exit`을 선택하거나 `Ctrl+C`를 누르면 서버가 종료됩니다.

### 개별 커맨드 모드

별도 터미널에서 서버를 띄워두고, 다른 터미널에서 개별 커맨드를 실행할 수도 있습니다.

```bash
# 터미널 1: 서버 시작
node packages/cli/dist/index.js start --no-open

# 터미널 2: 개별 커맨드 실행
node packages/cli/dist/index.js agent add
node packages/cli/dist/index.js agent list
node packages/cli/dist/index.js agent show <id>
node packages/cli/dist/index.js agent update <id>
node packages/cli/dist/index.js agent remove <id>
```

> **Note:** 에이전트는 프로젝트에 종속됩니다. 서버 시작(`start`) 시 기본 프로젝트가 생성되므로, 반드시 서버를 먼저 시작한 뒤 에이전트 명령을 실행하세요.

## CLI Commands

모든 CLI 명령은 빌드 후 아래 형식으로 실행합니다:

```bash
node packages/cli/dist/index.js <command>
```

### Server

| Command | Description |
| --- | --- |
| `start` | 서버 시작 및 대시보드 열기 |
| `start --no-open` | 서버 시작 (브라우저 열지 않음) |
| `start -p 4000` | 포트 지정하여 시작 |
| `init` | 현재 디렉토리에 기본 `mct-madev.yml` 생성 |
| `init -f` | 기존 설정 파일 덮어쓰기 |
| `status` | 서버 상태 확인 |
| `stop` | 서버 중지 |

### Agent Management

에이전트 관리 명령은 **서버가 실행 중인 상태**에서 사용합니다. 모든 서브커맨드에 `-p, --port <port>` 옵션을 지원합니다 (기본: `3000`).

#### `agent add`

인터랙티브 프롬프트로 에이전트를 추가합니다.

```bash
node packages/cli/dist/index.js agent add
```

```
? Select project: my-project (id: abc-123)
? Agent name: Alice
? Role: PM
? Provider: anthropic
? Model: claude-sonnet-4-5
? System prompt (optional, Enter to skip):

✓ Agent 'Alice' created
  ID:       abc-123
  Role:     PM
  Provider: anthropic
  Model:    claude-sonnet-4-5
```

#### `agent list`

프로젝트 내 에이전트 목록을 테이블로 출력합니다.

```bash
node packages/cli/dist/index.js agent list
```

```
 ID         Name     Role       Provider   Model              State
 abc-123    Alice    PM         anthropic  claude-sonnet-4-5   IDLE
 def-456    Bob      DEVELOPER  openai     gpt-4o              WORKING

Total: 2 agents
```

#### `agent show <id>`

에이전트 상세 정보를 출력합니다.

```bash
node packages/cli/dist/index.js agent show abc-123
```

```
Agent: Alice (abc-123)
  Role:          PM
  Provider:      anthropic
  Model:         claude-sonnet-4-5
  Visual State:  IDLE
  Position:      (0, 0, 0)
  System Prompt: You are a project manager...
  Created:       2026-03-19T02:19:30.155Z
```

#### `agent update <id>`

인터랙티브하게 에이전트를 수정합니다. 수정할 항목을 체크박스로 선택합니다.

```bash
node packages/cli/dist/index.js agent update abc-123
```

```
Current: Alice (PM, anthropic/claude-sonnet-4-5)
? What to update: Model, System Prompt
? Model: claude-opus-4-5
✓ Agent 'Alice' updated
```

#### `agent remove <id>`

확인 후 에이전트를 삭제합니다.

```bash
node packages/cli/dist/index.js agent remove abc-123
```

```
? Remove agent 'Alice' (PM)? y
✓ Agent removed
```

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