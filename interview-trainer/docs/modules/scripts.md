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
- `npm run test:e2e:smoke`: run VS Code host smoke test skeleton.
- `npm run package`: build and package VSIX to `build/interview-trainer.vsix`.

## Maintenance Notes
- Keep `node_modules/ffmpeg-static/**` in VSIX package; audio flow depends on it.
- Keep test artifacts out of VSIX via `.vscodeignore` (for example `coverage/**`, `test/**`).
- `test:e2e:smoke` clears `ELECTRON_RUN_AS_NODE` before launch to avoid Electron/VS Code arg parsing failure.
- `test:e2e:smoke` now uses isolated per-run profile dirs (`user-data`/`extensions`) and removes them after run to reduce mutex conflicts.
- When adding or changing scripts, update this document and `SECURITY_TEST_PLAN.md` together.
