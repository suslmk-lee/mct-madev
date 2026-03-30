# MCT-MADEV — 개발 상황

Paperclip 비교 분석 기반 개선 로드맵. 각 GAP은 순서대로 구현.

---

## GAP 진행 현황

| # | 제목 | 상태 | 완료일 |
|---|------|------|--------|
| GAP-1 | 예산 제어 (Per-agent monthly token budget) | ✅ 완료 | 2026-03-31 |
| GAP-2 | 목표 계층 (Goal hierarchy + PMAgent injection) | ✅ 완료 | 2026-03-31 |
| GAP-3 | 하트비트 스케줄러 (Heartbeat scheduler) | ✅ 완료 | 2026-03-31 |
| GAP-4 | 조직도 (Org chart + reporting lines) | ✅ 완료 | 2026-03-31 |
| GAP-5 | 거버넌스 (Agent approval + task approval gates) | ✅ 완료 | 2026-03-31 |
| GAP-6 | 프로젝트 템플릿 (Export/import) | ✅ 완료 | 2026-03-31 |
| GAP-7 | 외부 에이전트 Webhook 런타임 | ✅ 완료 | 2026-03-31 |

---

## GAP-1: 예산 제어 (Per-agent Monthly Token Budget)

**목표**: 에이전트별 월별 토큰 예산을 설정하고, 초과 시 자동으로 태스크를 BLOCKED 처리

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/agent.ts` | `Agent.monthlyBudgetTokens?: number` 추가 |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `monthly_budget_tokens` 컬럼 추가, 마이그레이션, `getAgentMonthlyTokens()` 구현 |
| `packages/db/src/types.ts` | `IDatabase.getAgentMonthlyTokens(agentId)` 인터페이스 추가 |
| `packages/server/src/routes/chat.ts` | `executeOneTask` 실행 전 예산 체크 → 초과 시 BLOCKED |
| `packages/server/src/routes/agents.ts` | POST/PUT에서 `monthlyBudgetTokens` 허용 |

### 동작 방식

```
태스크 실행 전:
  used = SELECT SUM(input_tokens + output_tokens) FROM token_usage
         WHERE agent_id = ? AND created_at >= 이번달 1일
  if used >= monthlyBudgetTokens:
    task.status = BLOCKED
    error = "월별 토큰 예산 초과 (used/budget)"
    WebSocket 알림 브로드캐스트
    실행 중단
```

---

## GAP-2: 목표 계층 (Goal Hierarchy)

**목표**: 프로젝트에 mission/strategy/OKR 구조 추가, 에이전트 프롬프트에 자동 주입

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/project.ts` | `ProjectGoals` 타입 추가, `Project.goals?` 필드 |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `goals` 컬럼 추가 (JSON), 마이그레이션 |
| `packages/server/src/routes/projects.ts` | goals 필드 CRUD 허용 |
| `packages/core/src/orchestrator/PMAgent.ts` | 프로젝트 goals를 분해 프롬프트에 삽입 |
| `packages/server/src/routes/chat.ts` | `executeOneTask`에서 goal ancestry를 에이전트 시스템 프롬프트에 주입 |

---

## GAP-3: 하트비트 스케줄러

**목표**: 에이전트가 cron 스케줄에 따라 자동으로 깨어나 할당된 태스크를 처리

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/scheduler/` | 신규 패키지 (node-cron 기반) |
| `packages/core/src/types/agent.ts` | `Agent.heartbeatCron?: string` 추가 |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `heartbeat_cron` 컬럼 추가, 마이그레이션 |
| `packages/server/src/index.ts` | 서버 시작 시 스케줄러 초기화 |
| `packages/server/src/routes/agents.ts` | `heartbeatCron` 필드 허용 |

---

## GAP-4: 조직도 (Org Chart)

**목표**: 에이전트 간 상사-부하 계층 구조, 조직도 API

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/agent.ts` | `Agent.managerId?: string`, `Agent.title?: string` 추가 |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `manager_id`, `title` 컬럼 추가, 마이그레이션 |
| `packages/server/src/routes/agents.ts` | `GET /projects/:id/orgchart` 추가 |

---

## GAP-5: 거버넌스 (Governance)

**목표**: 에이전트 고용 승인, 태스크 인간 승인 게이트, 설정 변경 이력 롤백

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/agent.ts` | `Agent.approvalStatus?: 'PENDING'|'APPROVED'|'SUSPENDED'|'TERMINATED'` |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `approval_status` 컬럼, `project_config_history` 테이블 |
| `packages/server/src/routes/agents.ts` | `POST /agents/:id/approve|suspend|terminate` |
| `packages/server/src/routes/projects.ts` | 설정 변경 시 이력 저장, `POST /projects/:id/config/rollback` |
| `packages/server/src/routes/tasks.ts` | `requiresApproval` 플래그, `POST /tasks/:id/approve` |

---

## GAP-6: 프로젝트 템플릿

**목표**: 전체 프로젝트(에이전트+설정)를 JSON으로 내보내기/가져오기

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/` | `ProjectTemplate` 타입 신규 |
| `packages/server/src/routes/projects.ts` | `GET /projects/:id/export`, `POST /projects/import` |

---

## GAP-7: 외부 에이전트 Webhook

**목표**: HTTP endpoint를 에이전트로 등록, 태스크 할당 시 외부 URL로 POST

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/types/agent.ts` | `Agent.agentType?: 'LLM'|'WEBHOOK'`, `Agent.webhookUrl?: string` |
| `packages/db/src/sqlite/SqliteDatabase.ts` | `agent_type`, `webhook_url` 컬럼, 마이그레이션 |
| `packages/server/src/routes/chat.ts` | WEBHOOK 타입 에이전트는 LLM 호출 대신 HTTP POST |
| `packages/server/src/routes/tasks.ts` | `POST /tasks/:id/complete` 콜백 엔드포인트 |
