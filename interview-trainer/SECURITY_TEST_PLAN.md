# SECURITY_TEST_PLAN

## Objective
- Build an attack-driven test suite that catches crash, lock-up, and severe malfunction scenarios.
- Prioritize exploitability and blast radius over raw line coverage.
- Keep tests aligned with the layered architecture rules in `AGENTS.md`.

## Threat Model (Extension + Webview)
- Untrusted message input from webview handlers.
- Malicious or malformed config values (NaN, Infinity, negative, huge values).
- Path traversal and unsafe file operations.
- Resource exhaustion (high concurrency, retries, flood requests).
- External dependency instability (ASR/LLM/Embedding timeout, partial stream, malformed payload).
- Secret/token leakage via logs or error messages.

## Non-Goals
- No claim of 100% vulnerability prevention.
- No dynamic malware behavior analysis (covered by runtime hardening, not unit tests).


## Progress (2026-02-07)
- [x] P0-1 Analyze payload poisoning tests + request-shape guard in `it_resultActions.ts`.
- [x] P0-2 Retrieval numeric poisoning tests + clamp logic in `it_retrievalActions.ts`.
- [x] P0-3 Warmup concurrency abuse tests + safe bound logic in `it_embeddingWarmup.ts`.
- [x] P0-4 Workspace path traversal tests for in-workspace enforcement in `it_workspaceActions.ts`.
- [x] P0-5 Template missing-variable / non-Error failure tests in `it_templateExecutor.ts`.
- [x] P1-6 Cancel race-condition regression tests (`it_resultActions.security.test.ts`).
- [x] P1-7 Save-consistency failure-path tests (`it_saveCurrentResult.security.test.ts`).
- [x] P1-8 Protocol flood and broadcast-isolation tests (`src/webview/WebviewProtocol.security.test.ts`).
- [x] P1-9 Secret/token masking integrity tests (`it_templateVars.security.test.ts`).
- [x] P2-10 Analyze flow full-path fault matrix tests (`application/flows/analyze/flow.fault-matrix.test.ts`).
- [x] P2-11 Mixed single-fault / pairwise-fault resilience regression tests.
- [x] P2-12 UI E2E phased plan + contract-first implementation guide.
- [x] P2-13 Messenger request/listener contract tests (`webview/src/messenger.contract.test.ts`).
- [x] P2-14 useAnalysisFlow payload/response contract tests (`webview/src/hooks/useAnalysisFlow.contract.test.ts`).
- [x] P2-15 VS Code Host smoke skeleton (`test/e2e/smoke/index.js`, `npm run test:e2e:smoke`).
- [x] P2-16 Analysis use-case integration tests (`it_analysisFlow.integration.test.ts`).
- [x] P2-17 Template binding guard tests for ASR/Evaluation/Segment (`flow.fault-matrix.test.ts`).
- [x] P2-18 Retrieval and stage-failure pair tests (`flow.fault-matrix.test.ts`).
- [x] P2-19 Smoke command stability assertions + command timeout guards (`test/e2e/smoke/index.js`).
- [ ] P2 suites pending (stream interruption, cross-platform path edge cases, large-payload pressure).

## Analyze Full-Flow Fault Matrix (new)

### Goal
- Simulate the complete path from imported recording + question payload to final persistence.
- Ensure "one component fails" and "multiple components fail" still produce predictable behavior:
  - no crash loop
  - no stuck running state
  - progress / partial / stream callbacks remain coherent

### Scope Under Test
- Orchestrator: `src/interviewTrainer/application/flows/analyze/flow.ts`
- Stage adapters:
  - `flow_audioStage.ts`
  - `flow_questionStage.ts`
  - `flow_segmentStage.ts`
  - `flow_retrievalStage.ts`
- Persistence + naming path:
  - `it_analysisPersistence.ts`
  - `it_storageGateway.ts`

### Fault Matrix

#### Single-fault baseline
1. ASR stage throws -> flow exits with readable error.
2. Question parse cache hit but malformed payload -> parse fallback still keeps run stable.
3. Segment stage fails for multi-question -> fallback answer/timing behavior is deterministic.
4. Retrieval stage throws -> flow continues to evaluation with empty notes when allowed.
5. Evaluation of one question fails -> merged evaluation keeps array index stability.
6. Persistence write fails (`report` or `write`) -> run exits with explicit failure and no silent success.

#### Pairwise-fault combinations
1. Retrieval failure + one-question evaluation failure.
2. Segment fallback path + retrieval partial empty corpus.
3. Progress callback throws + stream callback still active.
4. Late abort signal + in-flight evaluation promise completion.

### Assertions
- Step progress lifecycle remains valid: pending -> running -> success/error.
- `onPartial` snapshots never contain structurally invalid objects.
- `onStream` / `onEvalStream` updates preserve question index mapping.
- When failure occurs, error text is user-readable and does not leak secret/token values.

### Test Delivery
- Add `flow.fault-matrix.test.ts` under `application/flows/analyze/`.
- Use deterministic `vi.mock` for stage-level dependencies to avoid external I/O.
- Keep tests architecture-compliant: no direct Infra side effects.

## UI E2E Phased Plan (new)

### L1 - Protocol/Hook Contract Tests (short term, must-have)
- Validate `webview/src/messenger.ts` request/response integrity. (Done)
- Validate `useAnalysisFlow` payload/run-guard contracts and downstream state updates. (Core contract done)
- Continue validating end-to-end behavior for:
  - progress updates
  - partial payload updates
  - stream updates
  - terminal error/cancel events

### L2 - VS Code Host Smoke E2E (medium term)
- Use `@vscode/test-electron` to run extension host tests. (Smoke skeleton done)
- Minimum cases:
  1. Validate command registration includes focus/open/settings/history entries.
  2. Execute focus/open/settings/history smoke commands with timeout guard.
  3. Assert extension remains active after command roundtrip.
  4. Keep follow-up fixture-based analyze run as next phase.

### L3 - Optional UI DOM E2E (long term)
- Add Playwright-based webview DOM assertions if needed.
- Focus only on critical visible states (step progress, result card, error banner), not pixel-perfect snapshots.

### E2E Readiness Gates
- Gate A: all L1 contract tests green.
- Gate B: host smoke tests pass on Windows CI.
- Gate C: docs updated for fixtures, launch profile, and debugging workflow.
## Test Strategy

### Layer 1: Input Boundary Tests (highest priority)
Scope: `interface/handlers/*`, `application/useCases/*`

- Reject malformed request objects before deep execution.
- Validate payload type safety for every webview entry point.
- Ensure failed requests return controlled errors (not unhandled throws).

Primary targets:
- `src/interviewTrainer/application/useCases/it_resultActions.ts`
- `src/interviewTrainer/application/useCases/it_retrievalActions.ts`
- `src/interviewTrainer/application/useCases/it_workspaceActions.ts`

### Layer 2: Resource Exhaustion and State Corruption
Scope: warmup, retrieval, cancellation, concurrent starts

- Clamp dangerous numeric parameters to safe ranges.
- Ensure repeated start/cancel/start cannot corrupt state.
- Ensure scheduled warmup tasks do not accumulate into runaway timers.

Primary targets:
- `src/interviewTrainer/application/useCases/it_embeddingWarmup.ts`
- `src/interviewTrainer/application/useCases/it_retrievalActions.ts`
- `src/interviewTrainer/application/useCases/it_resultActions.ts`

### Layer 3: Filesystem and Persistence Safety
Scope: workspace dir selection, result save, topic/session paths

- Block path traversal (`..`, absolute path, mixed separators).
- Validate behavior around invalid paths and reserved names.
- Ensure partial-write failures do not leave inconsistent metadata.

Primary targets:
- `src/interviewTrainer/application/useCases/it_workspaceActions.ts`
- `src/interviewTrainer/application/useCases/it_saveCurrentResult.ts`

### Layer 4: Protocol and Runtime Resilience
Scope: protocol dispatch and external client failure handling

- Unknown messages must not crash handler loop.
- Stream interruption and malformed responses must fail safely.
- Retries must terminate and expose readable failure reason.

Primary targets:
- `src/webview/WebviewProtocol.ts`
- `src/interviewTrainer/infra/api/it_templateExecutor.ts`

### Layer 5: Secret/Token Exposure Control
Scope: logs, traces, error formatting

- Secret values must never appear in logs unless masked.
- Failure traces should preserve diagnostics without sensitive payload leakage.

Primary targets:
- `src/interviewTrainer/application/services/it_logging.ts`
- `src/interviewTrainer/infra/api/it_templateExecutor.ts`

## Planned Test Files (new)
- `src/interviewTrainer/application/useCases/it_resultActions.security.test.ts`
- `src/interviewTrainer/application/useCases/it_retrievalActions.security.test.ts`
- `src/interviewTrainer/application/useCases/it_embeddingWarmup.security.test.ts`
- `src/interviewTrainer/application/useCases/it_workspaceActions.security.test.ts`
- `src/interviewTrainer/application/useCases/it_saveCurrentResult.security.test.ts`
- `src/interviewTrainer/application/flows/analyze/flow.fault-matrix.test.ts`
- `src/interviewTrainer/application/useCases/it_analysisFlow.integration.test.ts`
- `src/webview/WebviewProtocol.security.test.ts`
- `src/interviewTrainer/infra/api/it_templateExecutor.security.test.ts`

## Test Case Catalog

### P0 (Blocker) - must implement first
1. Analyze payload poisoning
   - Empty payload / wrong shape / unexpected huge fields.
   - Expect: controlled error, no state deadlock.

2. Retrieval numeric poisoning
   - `topK`, `maxConcurrency`, `embeddingMaxConcurrency` with NaN/Infinity/negative/1e9.
   - Expect: clamped values, no crash, no infinite loop.

3. Warmup concurrency abuse
   - Extremely high concurrency in retrieval config.
   - Expect: bounded concurrency; no request storm.

4. Workspace path traversal
   - Selected path outside workspace, path with `..` and absolute path injection.
   - Expect: rejected with warning, config unchanged.

5. Template missing variables and malformed URL
   - Missing vars / malformed headers/query.
   - Expect: deterministic error, no unhandled throw.

### P1 (High)
6. Cancel race conditions
   - Start + cancel + start in quick sequence.
   - Expect: second run isolated from previous abort state.

7. Result save consistency under failure
   - Simulate append failure after metadata update attempt.
   - Expect: rollback-safe behavior or detectable recoverable state.

8. Protocol flood stability
   - High-frequency unknown message types and mixed valid requests.
   - Expect: no crash, valid handlers still respond.

9. Secret masking integrity
   - Verify sensitive values are masked in trace outputs.

### P2 (Medium)
10. Stream interruption handling
    - Simulate truncated SSE stream from template executor.
    - Expect: controlled failure and clear message.

11. Cross-platform path edge cases
    - Windows separators, trailing dots/spaces, reserved names.

12. Large text payload pressure
    - Oversized question/transcript inputs.
    - Expect: graceful error or bounded processing.

## Test Harness and Conventions
- Use Vitest with strict deterministic mocks.
- Use fake timers for warmup scheduling tests.
- Avoid network and filesystem side effects in unit tests.
- Keep tests colocated with target layer to maintain architecture boundaries.

## Required Test Config Update
Current `vitest.config.ts` does not include `application/useCases` and `infra/api` tests.
Planned update:
- Add include patterns:
  - `src/interviewTrainer/application/useCases/**/*.test.ts`
  - `src/interviewTrainer/infra/api/**/*.test.ts`
  - `src/webview/**/*.test.ts` (or explicit protocol path)

## Acceptance Criteria
- P0 tests all pass and fail when protections are intentionally removed.
- No unhandled exceptions for malformed external inputs.
- Build/test/package pipeline remains green:
  - `npm run build`
  - `npm run test`
  - `npm run package`

## Delivery Phases
- Phase A: Add P0 tests first (no behavior change unless needed).
- Phase B: Patch code to satisfy failing security tests.
- Phase C: Add P1/P2 tests and regression checks.
- Phase D: Update architecture/module docs for each security-hardening change.

## Output Artifacts
- Security test files (P0 -> P2).
- `webview/src/messenger.contract.test.ts`
- `webview/src/hooks/useAnalysisFlow.contract.test.ts`
- `test/e2e/smoke/index.js` + `scripts/run-e2e-smoke.js`
- `SECURITY_TEST_PLAN.md` progress updates.
- Final risk report listing:
  - fixed attack vectors
  - residual risks
  - deferred hardening items
