# MCT-MADEV

**Multi-Agent Orchestration System** — AI 에이전트 팀이 소프트웨어 개발 작업을 협력하여 수행하는 자동화 플랫폼

3D 오피스 UI에서 에이전트 상태를 실시간으로 시각화하고, 자연언어 지시문을 자동으로 분해하여 에이전트에게 할당·실행합니다.

## 주요 기능

- **멀티에이전트 오케스트레이션** — PM이 지시문을 분해하고, 개발자/테스터/DevOps가 협력 실행
- **자동 작업 분해** — 사용자의 자연언어 요청을 DAG 기반 작업 그래프로 변환 및 병렬 실행
- **3D 오피스 시각화** — React Three Fiber로 에이전트 위치 표시, 실시간 상태 업데이트 (IDLE/WORKING/REVIEWING)
- **실시간 WebSocket** — 에이전트 상태, 태스크 진행, 채팅 메시지 즉시 전파
- **멀티프로바이더** — Anthropic, OpenAI, Google, Ollama, 그 외 호환 LLM 자유로이 혼합 사용
- **파일 시스템 도구** — 에이전트가 프로젝트 디렉토리에 파일 생성·수정·삭제 및 코드 검색 가능
- **신뢰성** — 프로젝트당 오케스트레이션 1개 제한, 태스크 타임아웃, 자동 재시도, 원자적 DB 쓰기
- **보안** — API 키 마스킹, CORS/CSP 강화, WebSocket 권한 검증

## Quick Start

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

브라우저에서 http://localhost:3000 열기 → 프로젝트 생성 → 에이전트 추가 → 채팅 입력

## Monorepo Structure

| Package | 설명 |
| --- | --- |
| `packages/core` | Types, TaskStateMachine, DAG 레이어, PMAgent 분해 엔진 |
| `packages/gateway` | 멀티 LLM 게이트웨이 (Anthropic, OpenAI, Google, Ollama, 기타 호환 서버) |
| `packages/db` | SQLite (sql.js) 메모리 DB, 자동 디스크 저장 |
| `packages/queue` | 작업 큐 추상화 |
| `packages/git` | Git worktree 관리 |
| `packages/server` | Express API + WebSocket 브로드캐스트 서버 |
| `packages/cli` | CLI 엔트리포인트 (`start`, `agent add/list/update/remove`) |
| `apps/web` | React + Three.js 3D 오피스 UI, 실시간 업데이트 |

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

## 핵심 개선사항 (v1.0)

### 데이터 무결성
- JSON parse 안전화 (fallback 기본값)
- 원자적 DB 파일 쓰기 (race condition 방지)
- pmReview 실패 시 자동 승인 대신 BLOCKED 처리

### 신뢰성
- 프로젝트당 동시 오케스트레이션 1개 제한
- 태스크 실행 10분 타임아웃 (hang 방지)
- chatHistories LRU 캐시 (50 프로젝트, 메모리 누수 방지)
- DAG 순환 의존성 감지 → 해당 태스크 자동 FAILED 표시
- 취소된 태스크의 의존 태스크 cascade 실패 처리

### 성능
- `write_file` 10MB, `read_file` 1MB 도구 크기 제한
- 파일 목록 500개 제한 및 truncated 경고
- 컨텍스트 윈도우 per-model 설정 (Claude/GPT/Gemini 최적화)
- 디렉토리당 breadth 200개 제한

### 보안
- API 에러 응답에서 API 키 패턴 마스킹
- CORS 기본값: `http://localhost:5173` (전체 허용 대신)
- CSP 헤더 활성화 (기본 정책)
- WebSocket 구독 projectId 존재 여부 검증

### 관찰성
- pino 구조화 로깅 (에러, 경고, 정보)
- `GET /api/health` 엔드포인트 (provider 상태 확인)
- delete_file 감사 로그 (파일 삭제 기록)

### 사용자 경험
- 필터/카메라 프리셋/로그 설정 localStorage 영속성
- 취소 작업 확인 다이얼로그
- 오케스트레이션 진행 단계 표시 (분석 중 → 실행 중)
- apiError 배너 (API 연결 오류 피드백)
- `POST /chat/retry` 엔드포인트 (마지막 지시문 재실행)

## API 엔드포인트 (요약)

### 프로젝트
- `GET /projects` — 목록
- `POST /projects` — 생성
- `GET /projects/:id` — 상세
- `PUT /projects/:id` — 업데이트
- `DELETE /projects/:id` — 삭제

### 에이전트
- `GET /projects/:projectId/agents` — 목록
- `POST /projects/:projectId/agents` — 생성
- `PUT /agents/:id` — 업데이트
- `DELETE /agents/:id` — 삭제

### 채팅 & 오케스트레이션
- `POST /projects/:projectId/chat` — 지시문 입력 (202 비동기, 의도 분류 → 분해 → 실행)
- `POST /projects/:projectId/chat/retry` — 마지막 지시문 재실행
- `GET /projects/:projectId/chat/history` — 대화 기록

### 태스크 관리
- `GET /projects/:projectId/tasks` — 필터링 조회 (status, assigneeAgentId, workflowId)
- `POST /projects/:projectId/tasks` — 생성
- `PUT /tasks/:id/transition` — 상태 전환 (상태 머신 검증)
- `POST /tasks/:id/cancel` — 취소 (cascade 의존 실패)
- `POST /tasks/:id/retry` — FAILED/BLOCKED 재시도

### 파일 & 검색
- `GET /projects/:projectId/files` — 프로젝트 파일 목록 (truncated 플래그)
- `GET /projects/:projectId/files/content` — 파일 내용 읽기 (1MB 제한)
- `GET /projects/:projectId/files/download` — 다운로드
- `GET /projects/:projectId/search` — 코드 검색

### 모니터링
- `GET /api/health` — 서버 및 provider 상태

## Conventions

- TypeScript strict mode everywhere
- ESM only (no CommonJS)
- Biome for linting/formatting
- Backend/DB timestamps in UTC, UI display in KST (서울 시간)
- Package inter-dependencies use `workspace:*`
- 모든 에러는 `sendError(res, status, message, err)` 헬퍼로 처리 (상세 정보 노출 안 함)
- WebSocket 이벤트: `orchestration:complete`, `orchestration:error`, `task:update`, `agent:update`, `chat:message`