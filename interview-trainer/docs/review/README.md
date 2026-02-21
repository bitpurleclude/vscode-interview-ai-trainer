# Review Docs Index

## 1. Purpose
- Standardize all review-plan and execution-log documents into one auditable structure.
- Ensure every remediation item has clear status, acceptance criteria, and verification evidence.
- Separate planning intent from execution history while allowing one document to combine both when needed.

## 2. Status Legend
- `Planned`: defined, not started.
- `In Progress`: partially implemented or partially validated.
- `Completed`: implemented and verified.
- `Archived`: historical reference, no longer active.

## 3. Naming Convention
- Plan file: `<TOPIC>_PLAN_<YYYY-MM-DD>.md` or `<TOPIC>_FIX_<YYYY-MM-DD>.md`
- Execution log: `<TOPIC>_EXECUTION_LOG_<YYYY-MM-DD>.md`
- Combined plan + execution file: `<TOPIC>_EXEC_PLAN_<YYYY-MM-DD>.md`
- Always use absolute date format `YYYY-MM-DD`.

## 4. Required Structure

### 4.1 Plan / Fix Plan
1. `Document Metadata`
2. `Background and Goals`
3. `Scope and Non-goals`
4. `Task Matrix` (`id/priority/owner/status/acceptance`)
5. `Execution Order`
6. `Verification`
7. `Risks and Rollback`
8. `Progress Log`

### 4.2 Execution Log
1. `Document Metadata`
2. `Scope`
3. `Execution Summary`
4. `Change Batches`
5. `Verification Result`
6. `Follow-up`

## 5. Template
- Reusable template: `docs/review/PLAN_TEMPLATE.md`

## 6. Current Documents
| File | Type | Status | Last Updated | Notes |
| --- | --- | --- | --- | --- |
| `ARCH_REMEDIATION_EXEC_PLAN_2026-02-21.md` | Plan + Execution | Completed | 2026-02-21 | Architecture boundary and flow decomposition remediation |
| `CODE_REVIEW_FIX_PLAN_2026-02-21.md` | Fix Plan | Completed | 2026-02-21 | Review findings to code fix matrix |
| `E2E_SMOKE_STRICTNESS_FIX_2026-02-21.md` | Fix Plan | Completed | 2026-02-21 | Smoke false-green prevention and strict assertions |
| `E2E_SMOKE_STRICTNESS_EXECUTION_LOG_2026-02-21.md` | Execution Log | Completed | 2026-02-21 | E2E strictness implementation batches and verification |
| `REVIEW_ISSUES.md` | Review Backlog | In Progress | 2026-02-05 | Historical review issue list and unresolved backlog |

## 7. Maintenance Rules
- Update `Status` and `Last Updated` after each implementation batch.
- Keep verification evidence aligned with task completion claims.
- If a task is canceled or deferred, record the reason in `Progress Log`.
- Keep all text files UTF-8 without BOM.
- Plan docs index: `interview-trainer/docs/plans/README.md`
