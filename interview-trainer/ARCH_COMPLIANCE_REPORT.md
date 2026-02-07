# Architecture Compliance Sweep (2026-02-07)

## Goal
- Verify that `src/interviewTrainer` follows current AGENTS layering constraints.
- Record remaining non-blocking structural risks for the next phase.

## Scope
- `src/interviewTrainer/interface/**`
- `src/interviewTrainer/application/**`
- `src/interviewTrainer/domain/**`
- `src/interviewTrainer/infra/**`

## Rules Checked
- Interface should call Application (no direct Domain calls).
- Application must not depend on Interface.
- Domain must not depend on Infra or Interface.
- Infra must not depend on Interface.
- Non-gateway files under Application should not import Infra directly.

## Results
- Hard-rule violations: `0`
- Application non-gateway direct Infra imports: `0`
- Analyze flow stages are gateway-aligned:
  - `flow.ts`
  - `flow_audioStage.ts`
  - `flow_questionStage.ts`
  - `flow_retrievalStage.ts`
  - `flow_segmentStage.ts`
  - `flow_helpers.ts`
  - `flow_types.ts`

## Validation Commands
- `npm run build`
- `npm run test`
- `npm run package`

## Remaining Risks (Not Hard Violations)
1. `src/interviewTrainer/InterviewTrainerExtension.ts` is still large and central; host lifecycle can be split further.
2. `src/protocol/interviewTrainer.ts` remains monolithic; protocol can be split by message domain.
3. `docs/modules/backend-handlers.md` still has readability issues from historical text quality and should be rewritten.

## Suggested Next Phase (P6)
- P6-1: Split extension host lifecycle (state/session/recording/config watcher responsibilities).
- P6-2: Split protocol by domain (state/config/template/test/history/analysis).
- P6-3: Run docs cleanup pass for module docs and update call-chain examples.
