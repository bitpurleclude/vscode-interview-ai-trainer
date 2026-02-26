# Build and Test Scripts (scripts)

## Scope
- Central entry points for build, test, packaging, and host-level smoke checks.
- Provides stable npm commands for local development and CI pipelines.

## Key Files
- `scripts/build-webview.js`: builds Webview frontend assets.
- `scripts/build-extension.js`: builds Extension runtime output under `out/`.
- `scripts/run-e2e-smoke.js`: runs VS Code host smoke test via `@vscode/test-electron`.

## npm Command Mapping
- `npm run build`: build webview + extension.
- `npm run test`: run Vitest unit/contract/security suites.
- `npm run check:arch`: enforce layer dependency direction rules (Domain/Interface/Application/Infra).
- `npm run test:e2e:smoke`: run VS Code host smoke in dual-mode (`workspace` + `no-workspace`).
- `npm run test:e2e:smoke:workspace`: run workspace-only host smoke stage.
- `npm run test:e2e:smoke:no-workspace`: run no-workspace-only host smoke stage.
- `npm run test:e2e:smoke:verify-artifacts`: validate `build/e2e-smoke-artifacts/*.json` schema.
- `npm run test:e2e:smoke:verify-artifacts:strict`: validate artifact schema + summary/error quality gates.
- `npm run test:e2e:smoke:report`: run dual-mode smoke and emit structured execution report to `build/e2e-smoke-report.json`.
- `npm run package`: run `build` + `test:e2e:smoke` gate, then package VSIX to `build/interview-trainer.vsix`.

## Maintenance Notes
- Keep `node_modules/ffmpeg-static/**` in VSIX package; audio flow depends on it.
- Keep test artifacts out of VSIX via `.vscodeignore` (for example `coverage/**`, `test/**`).
- `test:e2e:smoke` clears `ELECTRON_RUN_AS_NODE` before launch to avoid Electron/VS Code arg parsing failure.
- `test:e2e:smoke` sets `IT_E2E_ENABLE_TEST_COMMANDS=1` so hidden fixture analyze/UI automation commands are only enabled during host smoke tests.
- `test:e2e:smoke` now verifies fixture analyze + webview tab/button click automation in one host run.
- `test:e2e:smoke` now also verifies webview analyze lifecycle through controls (fill question, import audio, click analyze, and capture success/error outcome).
- `test:e2e:smoke` now covers webview edge branches for canceling an active analyze run and save-result feedback assertions.
- `test:e2e:smoke` now also covers settings flow automation (environment switch/create/restore, topic settings persist/restore, streaming settings persist/restore, trace-log enable).
- `test:e2e:smoke` now uses isolated per-run profile dirs (`user-data`/`extensions`) and removes them after run to reduce mutex conflicts.
- `test:e2e:smoke` retries transient host startup failures (`ProcessSingleton`/mutex/lock/EADDRINUSE) with isolated profiles; tune via `IT_E2E_SMOKE_MAX_ATTEMPTS` and `IT_E2E_SMOKE_RETRY_DELAY_MS`.
- `test:e2e:smoke` runs in two modes: `workspace` (real flow with open folder) and `no-workspace` (negative-path assertion). Mode is injected by runner via `IT_E2E_SMOKE_MODE`; workspace requirement is enforced via `IT_E2E_REQUIRE_WORKSPACE=1`.
- `npm run package` now hard-gates on `test:e2e:smoke`; if smoke fails, VSIX packaging is blocked.
- In `no-workspace` mode, smoke asserts structured failure payloads (`errorCode=workspace_not_found`) instead of only string matching.
- `test:e2e:smoke` now verifies protocol guard behavior by triggering a missing handler request and asserting structured response (`errorCode=handler_not_found`).
- In `workspace` mode, smoke explicitly rejects API/template-binding failure signals (for example `?????`, `missing template`, `api key`), preventing false-green runs.
- `scripts/run-e2e-smoke.js` supports CLI controls:
  - `--stages <modes>`
  - `--inject-failure <modes>`
  - `--max-attempts <n>`
  - `--retry-delay-ms <n>`
  - `--report-file <path>`
  - `--validate-artifacts` / `--validate-artifacts-strict`
- The same controls can be driven by env vars: `IT_E2E_SMOKE_STAGES`, `IT_E2E_SMOKE_INJECT_FAILURE`, `IT_E2E_SMOKE_MAX_ATTEMPTS`, `IT_E2E_SMOKE_RETRY_DELAY_MS`, `IT_E2E_SMOKE_REPORT_FILE`.
- CI reference:
  - `quality-gates` runs `build` + `test` + `check:arch` before smoke jobs.
  - `smoke-stage` matrix runs `workspace` and `no-workspace` stages in parallel and uploads reports/artifacts.
  - `smoke-artifact-contract` job injects a deterministic retryable failure and verifies strict artifact quality gates.
- When adding or changing scripts, update this document and `docs/plans/quality/SECURITY_TEST_PLAN.md` together.
