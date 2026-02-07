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
- `SECURITY_TEST_PLAN.md` progress updates.
- Final risk report listing:
  - fixed attack vectors
  - residual risks
  - deferred hardening items
