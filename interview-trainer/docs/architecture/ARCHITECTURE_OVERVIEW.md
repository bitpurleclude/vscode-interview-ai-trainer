# Architecture Overview (Interview Trainer)

## Document Metadata
- Document Type: `Architecture Overview`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Docs:
  - `docs/architecture/README.md`
  - `docs/architecture/DIRECTORY_MAP.md`
  - `docs/modules/`

## Scope
- Describe runtime composition, key contracts, and cross-layer call chains.
- Record architecture constraints and release validation rules.

## Non-goals
- This document does not define feature-level product behavior.
- This document does not replace module implementation docs in `docs/modules/*`.

## 1. Runtime Composition
- Extension entry: `src/extension.ts`
- Extension host: `src/interviewTrainer/InterviewTrainerExtension.ts`
- Webview provider and bridge: `src/webview/InterviewTrainerWebviewViewProvider.ts`, `src/webview/WebviewProtocol.ts`
- Webview UI: `webview/src/` (React)
- Config and templates: `config/` + `src/interviewTrainer/infra/api/*`
- Storage and cache: `src/interviewTrainer/infra/storage/*` + global storage
- Analysis orchestration: `src/interviewTrainer/application/useCases/*` + `src/interviewTrainer/application/flows/*`
- External clients: `src/interviewTrainer/infra/clients/*`

## 2. Key Data Objects
- State: `ItState` (`src/protocol/interviewTrainer.ts`)
- Analysis request/response: `ItAnalyzeRequest`, `ItAnalyzeResponse`
- Config snapshot: `ItConfigSnapshot`
- Template config: `ItTemplatesConfig` (`config/templates.yaml`)

## 3. Key Call Chains (Path Level)
### 3.1 Extension Startup
- `src/extension.ts` -> `InterviewTrainerWebviewViewProvider`
- `src/extension.ts` -> `InterviewTrainerExtension` (handler registration, config init, token service init)
- E2E-only shared fixtures/constants are isolated in:
  - `src/interviewTrainer/interface/e2e/it_e2eShared.ts`
  - `src/interviewTrainer/interface/e2e/it_e2eCommandRegistration.ts`

### 3.2 Webview Message Flow
- `webview/src/messenger.ts` sends `request()`
- `webview/src/hooks/useE2ETestBridge.ts` is the webview-side E2E bridge composition hook.
- `webview/src/hooks/e2e/*` contains split handlers and shared E2E helpers:
  - `it_uiAutomationHandler.ts`
  - `it_analyzeFlowHandler.ts`
  - `it_settingsFlowHandler.ts`
  - `it_protocolGuardHandler.ts`
  - `it_e2eShared.ts`
- `src/webview/WebviewProtocol.ts` receives and dispatches
- `src/interviewTrainer/interface/handlers/it_webviewHandlers.ts` registers all handler groups
- `src/interviewTrainer/interface/handlers/it_webviewHandlerPorts.ts` defines capability-based host ports
- `it_webview*Handlers.ts` delegates to `application/useCases/*`

### 3.3 Analysis Flow (Audio -> Result)
- `webview/src/hooks/useAnalysisFlow.ts` -> `request("it/analyzeAudio")`
- `src/interviewTrainer/interface/handlers/it_webviewResultHandlers.ts`
- `src/interviewTrainer/application/useCases/it_analysisFlow.ts` (session state, cancel/error semantics)
- `src/interviewTrainer/application/flows/analyze/flow.ts` (ASR/segment/retrieval/evaluation/persistence orchestration)
  - Audio + ASR: `flow_audioStage.ts` + `application/services/it_asrTranscription.ts` + `domain/analyze/asr.ts`
  - Question parse: `flow_questionStage.ts` + `application/services/it_questionParser.ts`
  - Multi-question segment: `flow_segmentStage.ts` + `domain/analyze/questionsSegments.ts`
  - Retrieval: `flow_retrievalStage.ts` + `application/services/it_notesGateway.ts` (algorithm in `domain/notes/*`)
  - Evaluation: `flow_evaluationStage.ts` + `application/services/it_evaluation.ts` / `it_evaluationLlm.ts`
  - Persistence: `flow_persistStage.ts` + `application/services/it_analysisPersistence.ts` + `infra/storage/*`

### 3.4 Streaming Updates
- Backend: `application/services/it_logging.ts` -> `it/evaluationStreamUpdate` / `it/stepStreamUpdate`
- Frontend: `webview/src/hooks/useStreaming.ts` -> `StepsList` / `StreamCard`

### 3.5 Structured Logging Pipeline
- Log DTO and emission policy: `application/services/it_structuredLogger.ts`
- Application logging facade: `application/services/it_logging.ts`
- Sink gateway: `application/services/it_logSinkGateway.ts`
- Output sink implementation: `infra/logging/it_outputChannelLogSink.ts`
- Template trace builder: `infra/logging/it_traceLogger.ts`

## 4. Config and Template System
- YAML defaults: `config/*.yaml`
- Runtime config service: `application/services/it_configGateway.ts` -> `infra/api/it_configService.ts`
- Template execution: `application/services/it_templateGateway.ts` -> `infra/api/it_templateExecutor.ts`
- Snapshot building: `application/services/it_configSnapshot.ts`

## 5. Architecture Constraints
- Dependency direction: Interface -> Application -> (Domain, Infra)
- Domain must not depend on Interface/Infra and must not perform file/network I/O.
- Interface must not call Domain/Infra directly; always go through use-cases/gateways.
- Automated boundary check: `scripts/check-architecture-boundaries.js` (`npm run check:arch`).
- Any code change must include matching updates in `docs/architecture/*` and `docs/modules/*`.

## 6. Guardrails (Upper-Bound Controls)
- Single source of truth: `config/guardrails.yaml`.
- Any hard limit (concurrency, batch, split threshold, query window, char cap, logging caps) must be defined in guardrails config.
- Runtime clamp/parsing entry: `src/interviewTrainer/application/services/it_guardrails.ts`.
- Retrieval stack currently reads guardrails in:
  - `src/interviewTrainer/application/useCases/it_retrievalActions.ts`
  - `src/interviewTrainer/application/useCases/it_embeddingWarmup.ts`
  - `src/interviewTrainer/application/flows/analyze/flow_retrievalStage.ts`
  - `src/interviewTrainer/infra/notes/search.ts`
  - `src/interviewTrainer/infra/notes/cache_embedding.ts`
- Adding a new upper-bound parameter requires synchronized updates in guardrails config, tests, and docs.

## 7. Validation and Release Rules
- All text files must be UTF-8 without BOM.
- VSIX package must include `node_modules/ffmpeg-static`.
- Minimum verification before release: `npm run build`, `npm run test`, `npm run check:arch`, `npm run package`.

## 8. Maintenance Rules
- Any path or call-chain change in this document must be reflected in `docs/modules/*` in the same change set.
- If dependency direction rules are adjusted, also update `scripts/check-architecture-boundaries.js` and related tests.
