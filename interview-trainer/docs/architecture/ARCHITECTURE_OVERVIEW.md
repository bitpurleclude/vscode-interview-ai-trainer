# Architecture Overview (Interview Trainer)

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

### 3.2 Webview Message Flow
- `webview/src/messenger.ts` sends `request()`
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
  - Evaluation: `application/services/it_evaluation.ts` / `it_evaluationLlm.ts`
  - Persistence: `application/services/it_analysisPersistence.ts` + `infra/storage/*`

### 3.4 Streaming Updates
- Backend: `application/services/it_logging.ts` -> `it/evaluationStreamUpdate` / `it/stepStreamUpdate`
- Frontend: `webview/src/hooks/useStreaming.ts` -> `StepsList` / `StreamCard`

## 4. Config and Template System
- YAML defaults: `config/*.yaml`
- Runtime config service: `application/services/it_configGateway.ts` -> `infra/api/it_configService.ts`
- Template execution: `application/services/it_templateGateway.ts` -> `infra/api/it_templateExecutor.ts`
- Snapshot building: `application/services/it_configSnapshot.ts`

## 5. Architecture Constraints
- Dependency direction: Interface -> Application -> (Domain, Infra)
- Domain must not depend on Interface/Infra and must not perform file/network I/O.
- Interface must not call Domain/Infra directly; always go through use-cases/gateways.
- Any code change must include matching updates in `docs/architecture/*` and `docs/modules/*`.

## 6. Validation and Release Rules
- All text files must be UTF-8 without BOM.
- VSIX package must include `node_modules/ffmpeg-static`.
- Minimum verification before release: `npm run build`, `npm run test`, `npm run package`.
