# Architecture

This directory tracks the layered architecture, call chains, and refactor status of interview-trainer.

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
- Next iteration continues to reduce responsibilities in `InterviewTrainerExtension`.

## References
- `ARCH_REFACTOR_PLAN.md`
- `REFACTOR_TASKS_PLAN.md`
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/DIRECTORY_MAP.md`
- `ARCH_COMPLIANCE_REPORT.md`
