# TEST_HARDENING_PLAN

## Document Metadata
- Document Type: `Plan`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/interviewTrainer/application/`
  - `interview-trainer/src/interviewTrainer/interface/`
  - `interview-trainer/src/webview/`
  - `interview-trainer/webview/src/`
  - `interview-trainer/scripts/run-e2e-smoke.js`

## Background and Goals
- Raise regression sensitivity on real business flows and reduce false confidence from narrow utility-only coverage.
- Keep test evidence actionable: when a failure happens, it should be diagnosable with deterministic assertions and logs.
- Improve coverage quality over critical chains: analysis flow, service orchestration, use-case boundaries, and protocol contracts.

## Scope and Non-goals
- Scope:
  - Strengthen analysis flow and service-layer direct tests.
  - Keep smoke checks strict for both success and failure contracts.
  - Improve evidence consistency for test artifacts and fault injection scenarios.
- Non-goals:
  - Chasing raw coverage numbers without behavioral value.
  - Migrating to another test framework in this phase.

## Current Gaps
- Several application service modules are still at low or zero coverage.
- UI-level E2E contract depth is still limited for settings and failure recovery paths.
- Some use-case modules are only indirectly covered and need direct contract tests.

## Task Matrix
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| P19-1 | P0 | In Progress | Tighten smoke success/failure gating to prevent false pass states | Missing key step or `status=error` must fail |
| P19-2 | P0 | In Progress | Expand coverage focus to core `application/useCases/services/flows` | Core chain coverage rises with stable tests |
| P19-3 | P1 | In Progress | Extend analyze fault matrix for single and combined fault paths | Failure behavior is predictable and assertable |
| P19-4 | P1 | In Progress | Strengthen guardrail clamp and boundary-input tests | Invalid config input is normalized deterministically |
| P19-5 | P1 | In Progress | Deepen UI E2E for settings and analysis-side failure injection | Settings/analyze/cancel/save contracts covered |

## Execution Order
1. Stabilize smoke strictness (`P19-1`) so CI signals are trustworthy.
2. Increase direct unit coverage on core app chain (`P19-2`).
3. Expand failure matrix and boundary behavior (`P19-3`, `P19-4`).
4. Deepen UI E2E paths and failure contracts (`P19-5`).

## Verification
- Commands:
  - `npm run test`
  - `npm run build`
  - `npm run test:e2e:smoke`
  - `npm run test:e2e:smoke:verify-artifacts:strict`
- Evidence:
  - Tests validate behavior contracts, not only line execution.
  - Smoke is stable in both workspace/no-workspace modes.
  - Fault injections produce reproducible and debuggable artifacts.

## Risks and Rollback
- Risks:
  - Stricter assertions may expose short-term flakiness in unstable environments.
  - Expanded coverage scope can reveal historical debt quickly and increase CI noise.
- Rollback:
  - Roll out strict checks in phases when needed, but keep documented debt and follow-up actions.
  - Roll back module-by-module if a new assertion is unstable, while preserving validated core contracts.

## Progress Log
- `2026-02`: Established the hardening initiative and started phased P19 execution.
- `2026-02-21`: Reorganized test-hardening documentation and cleaned malformed historical content.
- `2026-02-21`: Expanded `vitest` coverage scope to `application/useCases/services/interface handlers/webview protocol/smoke runner`.
- `2026-02-21`: Added direct analyze-stage tests: `flow_audioStage.test.ts`, `flow_questionStage.test.ts`, `flow_segmentStage.test.ts`, `flow_evaluationStage.test.ts`, `flow_persistStage.test.ts`.
- `2026-02-21`: Added direct service tests: `it_asrTranscription.test.ts`, `it_questionParser.test.ts`, `it_evaluation.test.ts`, `it_progress.test.ts` (23 tests).
- `2026-02-21`: Added direct tests for persistence/core/question-split/evaluation-submodules: `it_analysisPersistence.test.ts`, `it_questionsLlm.test.ts`, `it_evaluationFallback.test.ts`, `it_evaluationPrompt.test.ts`, `it_evaluationResult.test.ts`, `it_topicTitle.test.ts`, `it_coreActions.test.ts`, `it_recordingActions.test.ts`.
- `2026-02-21`: Added deep-coverage tests for `it_evaluationLlm.ts`, `it_configSnapshot.ts`, and hook-level `useAnalysisFlow.ts`.
- `2026-02-21`: Expanded `useAnalysisFlow.test.ts` to cover stale-response ignore, cancel ack, save failure, load-history failure, and regenerate failure branches.
- `2026-02-21`: Validation snapshot: `npm run test` passed with `70` files / `300` tests; coverage totals are lines `67.13%`, branches `61.95%`, functions `71.13%`, statements `67.13%`.
- `2026-02-21`: Added direct handler tests for interface registration/forwarding/config-update paths: `it_webviewHandlers.binding.test.ts`, `it_webviewConfigHandlers.binding.test.ts`, `it_webviewTestHandlers.binding.test.ts`, `it_webviewProviderHandlers.test.ts`, `it_webviewRecordingHandlers.test.ts`, `it_webviewRetrievalHandlers.test.ts`, `it_webviewTemplateHandlers.test.ts`, `it_webviewTemplateTestHandlers.test.ts`, `it_webviewWorkspaceHandlers.test.ts`, `it_webviewTestSpecificHandlers.test.ts`, `it_webviewTestHelpers.test.ts`.
- `2026-02-21`: Validation snapshot: `npm run test` passed with `81` files / `332` tests; coverage totals are lines `72.34%`, branches `64.29%`, functions `76.37%`, statements `72.34%`.
- `2026-02-21`: Added direct entry use-case tests for `it_testAsr.ts`, `it_testEmbedding.ts`, and `it_testLlm.ts` (13 tests), including success/failure tracing and request-preview masking assertions.
- `2026-02-21`: Validation snapshot: `npm run test` passed with `84` files / `345` tests; coverage totals are lines `75.58%`, branches `64.89%`, functions `77.67%`, statements `75.58%`.
- `2026-02-21`: Added direct tests for `it_templateTestActions.ts` (dry-run/live success + error paths, delta emit, token extraction, header masking).
- `2026-02-21`: Fixed template test variable merge precedence in `it_templateTestActions.ts` so explicit `payload.stream` is no longer overwritten by defaults.
- `2026-02-21`: Validation snapshot: `npm run test` passed with `85` files / `349` tests; coverage totals are lines `77.74%`, branches `64.93%`, functions `78.63%`, statements `77.74%`.

## Follow-up
- Prioritize new direct tests for zero-coverage service modules:
  - `src/interviewTrainer/application/services/it_asrGateway.ts`
  - `src/interviewTrainer/application/services/it_audioGateway.ts`
  - `src/interviewTrainer/application/services/it_embeddingGateway.ts`
  - `src/interviewTrainer/application/services/it_extensionRecording.ts`
- Add direct tests for under-covered use-cases:
  - `src/interviewTrainer/application/useCases/it_environmentConfig.ts`
  - `src/interviewTrainer/application/useCases/it_templateActions.ts`
- Add direct tests for still-zero service gateways used by use-case entry tests:
  - `src/interviewTrainer/application/services/it_asrGateway.ts`
  - `src/interviewTrainer/application/services/it_embeddingGateway.ts`
- Improve branch coverage in `webview/src/hooks/useAnalysisFlow.ts` for remaining error/cancel/save fallback paths.
