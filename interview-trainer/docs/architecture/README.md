# Architecture

## Document Metadata
- Document Type: `Index`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Docs:
  - `docs/architecture/ARCHITECTURE_OVERVIEW.md`
  - `docs/architecture/DIRECTORY_MAP.md`
  - `docs/modules/`

This directory tracks the layered architecture, call chains, and refactor status of interview-trainer.

## Scope
- Define the layered model and dependency direction used by the repository.
- Provide entry points to runtime call-chain and directory responsibility docs.
- Keep architecture narrative synchronized with actual code structure.

## Non-goals
- This folder is not the place for release notes or bug execution logs.
- This folder does not replace module-level implementation details in `docs/modules/*`.

## Layer Model
- Interface: VS Code commands, Webview bridge, and message handlers (I/O boundary).
- Application: use-case orchestration and cross-domain coordination (domain + gateway).
- Domain: core business rules and algorithms (pure logic, no I/O).
- Infra: external integrations (API, storage, recording, logging, utilities).
- Protocol: shared contracts across backend/frontend/layers.

## Protocol Location
- Backend protocol: `src/protocol/interviewTrainer.ts`
- Webview type mirror: `webview/src/types.ts`

## Refactor Progress
| Phase | Scope | Status |
| --- | --- | --- |
| Phase 0 | Repository scan and planning | Done |
| Phase 1 | Protocol constraints and baseline | Done |
| Phase 2 | Infra migration and gatewayization | Done |
| Phase 3 | Domain I/O cleanup | Done |
| Phase 4 | Application split (useCases/services/flows) | Done |
| Phase 5 | Interface handler capability ports | Done |
| Phase 6 | Ongoing hardening (docs sync, host shrink) | In progress |

## Current Focus
- Analysis pipeline is stable under `application/useCases` + `application/flows`.
- Interface now uses capability ports in `it_webviewHandlerPorts.ts`.
- Structured logging now follows one pipeline: `it_structuredLogger.ts` -> `it_logSinkGateway.ts` -> `infra/logging/it_outputChannelLogSink.ts`.
- Layer direction is now enforced by script: `scripts/check-architecture-boundaries.js` (`npm run check:arch`).
- Webview E2E protocol handlers are isolated in `webview/src/hooks/useE2ETestBridge.ts` instead of root page component.
- Webview E2E bridge is further split into `webview/src/hooks/e2e/*` handler modules to reduce single-file complexity.
- Analyze flow keeps stage boundaries clearer via `flow_evaluationStage.ts` and `flow_persistStage.ts`.
- Next iteration continues to reduce responsibilities in `InterviewTrainerExtension`.

## References
- `docs/plans/architecture/ARCH_REFACTOR_PLAN.md`
- `docs/plans/refactor/REFACTOR_TASKS_PLAN.md`
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/DIRECTORY_MAP.md`
- `docs/architecture/ARCH_COMPLIANCE_REPORT.md`

## Maintenance Rules
- When architecture boundaries or call chains change, update this index and linked docs in the same PR.
- Keep all text files UTF-8 without BOM.
