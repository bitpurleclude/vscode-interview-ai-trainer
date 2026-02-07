# 重构任务规划（REFACTOR_TASKS_PLAN）

## 目标
- 按架构规范清理无用逻辑，降低耦合与维护成本。
- 拆分超大文件，明确模块边界与职责。
- 每步修改都同步文档并通过构建验证。

## 执行规则
- 每个任务：确认 → 修改 → `npm run build` → commit → `npm run package` → 文档同步。
- 所有写入文件必须使用 UTF-8（无 BOM）。

## 任务清单（按优先级）

### P0（立即处理）
- [x] 移除 tools 相关逻辑
  - 删除 `infra/api/toolsPresets/presets/codexLike.ts` 及引用。
  - 移除 toolsPreset/tools/webSearch 在 LLM 请求构建中的注入逻辑。
  - 清理相关配置字段（providers/config/configSnapshot/LLM config）。
  - 删除文档中工具预设与 tools 相关说明。
- [x] 清理残留 tools 文案/字段
  - 更新状态栏文案中的 tools 图标。
  - 移除 Qianfan 请求中的 web_search 字段。

### P1（高优先级拆分）
- [x] 拆分 `webview/src/components/settings/SettingsTemplateManager.tsx`
- [x] 拆分 `domain/analyze/flow.ts`

### P2（中优先级拆分）
- [x] 拆分 `infra/api/it_templateExecutor.ts`
- [x] 拆分 `infra/api/it_configService.ts`
- [x] 拆分 `webview/src/InterviewTrainer.tsx`
- [x] 拆分 `domain/analyze/questions.ts`
- [x] 拆分 `interface/handlers/it_webviewConfigHandlers.ts`
- [x] 拆分 `domain/notes/indexer.ts`

### P3（低优先级优化）
- [x] 拆分 `interface/handlers/it_webviewTestHandlers.ts`
- [x] 拆分 `domain/notes/cache.ts`
- [x] 拆分 `infra/api/it_llm.ts`
- [x] 拆分 `application/services/it_evaluation.ts`
- [x] 拆分 `infra/storage/it_report.ts`
- [x] 拆分 `infra/storage/it_sessions.ts`
- [ ] 评估是否拆分 `src/protocol/interviewTrainer.ts`（需同步 `webview/src/types.ts`）

### P4（架构合规修复：Domain 去 Infra/I/O 依赖）
目标：让 Domain 只保留纯业务逻辑与算法，I/O 与外部依赖全部上移到 Application/Infra。

#### P4-0 约束与基线
- [ ] 明确不拆 `src/protocol/interviewTrainer.ts`（本阶段保持单文件）。
- [ ] 盘点 Domain 中的 I/O/Infra 依赖清单并逐项迁移。

#### P4-1 notes 模块合规
- [x] 将 `domain/notes/cache_*`、`domain/notes/indexer*` 中的 fs/embedding 访问迁到 `infra/notes/*` 或 `infra/storage/*`。
- [x] 保留 `domain/notes/ranking.ts`、`domain/notes/utils.ts` 中的纯算法部分；如仍含 fs/path，拆出到 infra。
- [x] 调整 `domain/notes/search.ts`：把 embedding/缓存访问上移（Application/Infra），Domain 仅保留纯排序/打分。

#### P4-2 analyze 模块合规
- [x] 将 `domain/analyze/flow*.ts` 的流程编排上移到 `application/useCases` 或 `application/flows/*`。
- [x] 将 `domain/analyze/audio.ts` 的 I/O 与音频处理下移到 `infra/recording` 或 `infra/utils`。
- [x] 将 `domain/analyze/questionsLlm.ts` 的 LLM 请求上移到 `application/services`。
- [x] 移除 `domain/analyze/flow_types.ts` 中的 `vscode` 依赖，改为 Application 层定义接口传入。

#### P4-3 evaluation 模块合规
- [x] 将 `domain/evaluation/prompt.ts` 中的 LLM 调用迁至 `application/services`（仅保留纯 prompt 拼装/解析在 Domain）。
- [x] 保留 `domain/evaluation/parser.ts`、`domain/evaluation/scoring.ts` 作为纯算法模块。

#### P4-4 文档与校验
- [x] 更新 `docs/architecture/*` 与 `docs/modules/*` 对应模块说明。
- [x] 补充目录图与依赖方向说明（标注 Domain 不含 I/O）。
- [x] 构建验证：`npm run build`。

## P4-5 (2026-02-07) Architecture Compliance Progress
- [x] Domain no longer imports Infra in analyze modules (`domain/analyze/asr.ts`, `domain/analyze/result.ts`, `domain/analyze/questionsSegments.ts`).
- [x] Moved ASR orchestration to `application/services/it_asrTranscription.ts`, domain keeps pure chunking logic.
- [x] Moved title generation and persistence I/O to application services (`it_topicTitle.ts`, `it_analysisPersistence.ts`).
- [x] Removed Interface -> Domain direct import by switching `it_webviewResultHandlers.ts` to application service API.
- [x] Build and test passed after migration.
## P5-1 (2026-02-07) Interface Migration Progress
- [x] Removed direct `Interface -> Infra` imports in `src/interviewTrainer/interface/handlers/*`.
- [x] Added `application/services/it_infraBridge.ts` as a temporary migration bridge.
- [x] Kept runtime behavior unchanged; handlers still work through same APIs.
- [x] Build/test/package verified after migration.
## P5-2 (2026-02-07) Application Decoupling Progress
- [x] Removed `application -> webview/WebviewProtocol` direct type dependency.
- [x] Added `application/services/it_webviewPort.ts` as app-level port contract.
- [x] Updated `it_logging.ts` and `it_tokens.ts` to consume `ItWebviewPort`.
- [x] Build/test/package verified after decoupling.
## P5-3 (2026-02-07) Bridge Decomposition Progress
- [x] Removed monolithic `it_infraBridge.ts` transitional bridge.
- [x] Added focused gateways (`it_configGateway.ts`, `it_templateGateway.ts`, `it_storageGateway.ts`, `it_llmGateway.ts`, `it_embeddingGateway.ts`, `it_asrGateway.ts`, `it_notesGateway.ts`, `it_textGateway.ts`).
- [x] Updated all interface handlers to import from focused application gateways.
- [x] Build/test/package verified after gateway decomposition.
## P5-4 (2026-02-07) Result Save UseCase Progress
- [x] Moved `it/saveCurrentResult` orchestration out of interface handler to application use-case (`it_saveCurrentResult.ts`).
- [x] `it_webviewResultHandlers.ts` now performs dispatch-only for save action.
- [x] Synced use-case docs and verified build/test/package.
## P5-5 (2026-02-07) Test Handler UseCase Progress
- [x] Moved LLM/ASR/Embedding test orchestration from interface handlers into application use-cases.
- [x] `it_webviewTestLlmHandlers.ts`, `it_webviewTestAsrHandlers.ts`, `it_webviewTestEmbeddingHandlers.ts` now dispatch only.
- [x] Synced use-case docs and verified build/test/package.


## P5-6 (2026-02-07) Environment Handler UseCase Progress
- [x] Moved environment/settings orchestration from interface handler into application use-case (`it_environmentConfig.ts`).
- [x] `it_webviewEnvironmentHandlers.ts` now dispatches commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-7 (2026-02-07) Question Handler UseCase Progress
- [x] Moved parse/regenerate question orchestration into application use-case (`it_questionActions.ts`).
- [x] `it_webviewQuestionHandlers.ts` now dispatches commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-8 (2026-02-07) Retrieval Handler UseCase Progress
- [x] Moved retrieval settings/cache orchestration into application use-case (`it_retrievalActions.ts`).
- [x] `it_webviewRetrievalHandlers.ts` now dispatches commands only.
- [x] Added infra cache helpers (`infra/storage/it_cache.ts`) and gateway exports for cache directory cleanup.
- [x] Synced use-case docs and verified build/test/package.


## P5-9 (2026-02-07) Template/Workspace Handler UseCase Progress
- [x] Moved template/secrets/tokens orchestration into application use-case (`it_templateActions.ts`).
- [x] Moved workspace/sessions directory selection orchestration into application use-case (`it_workspaceActions.ts`).
- [x] `it_webviewTemplateHandlers.ts` and `it_webviewWorkspaceHandlers.ts` now dispatch commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-10 (2026-02-07) Provider Handler UseCase Progress
- [x] Moved provider config orchestration into application use-case (`it_providerActions.ts`).
- [x] `it_webviewProviderHandlers.ts` now dispatches commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-11 (2026-02-07) Core Handler UseCase Progress
- [x] Moved core actions orchestration into application use-case (`it_coreActions.ts`).
- [x] `it_webviewCoreHandlers.ts` now dispatches commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-12 (2026-02-07) Recording Handler UseCase Progress
- [x] Moved recording orchestration into application use-case (`it_recordingActions.ts`).
- [x] `it_webviewRecordingHandlers.ts` now dispatches commands only.
- [x] Added recording gateway export and infra converter helper (`it_recordingGateway.ts`, `infra/recording/it_recording.ts`).
- [x] Synced use-case/docs and verified build/test/package.


## P5-13 (2026-02-07) Template Test Handler UseCase Progress
- [x] Moved template dry-run/live orchestration into application use-case (`it_templateTestActions.ts`).
- [x] `it_webviewTemplateTestHandlers.ts` now dispatches commands only.
- [x] Simplified interface test helper to logger-only API (`it_webviewTestHelpers.ts`).
- [x] Synced use-case docs and verified build/test/package.


## P5-14 (2026-02-07) Result Handler UseCase Progress
- [x] Moved result handler orchestration into application use-case (`it_resultActions.ts`).
- [x] `it_webviewResultHandlers.ts` now dispatches commands only.
- [x] Synced use-case docs and verified build/test/package.


## P5-15 (2026-02-07) Service Gateway Alignment Progress
- [x] `it_tokens.ts` switched from direct infra imports to application gateways (`it_configGateway`, `it_templateGateway`).
- [x] `it_topicTitle.ts` switched from infra client/type imports to `it_llmGateway`.
- [x] Synced service docs and verified build/test/package.


## P5-16 (2026-02-07) LLM/Trace Gateway Alignment Progress
- [x] Added `it_traceGateway.ts` to avoid direct `application/services -> infra/logging` imports.
- [x] Updated `it_questionParser.ts`, `it_questionsLlm.ts`, `it_evaluation.ts`, `it_evaluationLlm.ts`, `it_evaluationTypes.ts` to consume application gateways.
- [x] Extended `it_llmGateway.ts` and `it_textGateway.ts` exports for streaming and formatting reuse.
- [x] Synced service docs and verified build/test/package.


## P5-17 (2026-02-07) ASR/Persistence Gateway Alignment Progress
- [x] `it_asrTranscription.ts` no longer imports infra client/logger/template/store directly; now uses `it_templateGateway`, `it_traceGateway`, `it_recordingGateway`.
- [x] `it_analysisPersistence.ts` switched to `it_storageGateway` + `it_textGateway`.
- [x] Extended `it_recordingGateway.ts` to expose PCM chunk splitter for ASR chunked transcription.
- [x] Synced service docs and verified build/test/package.


## P5-18 (2026-02-07) Config Snapshot Gateway Alignment Progress
- [x] `it_configSnapshot.ts` switched from direct infra config/text imports to `it_configGateway` and `it_textGateway`.
- [x] No runtime behavior change; snapshot/migration/watcher logic kept intact.
- [x] Synced service docs and verified build/test/package.


## P5-19 (2026-02-07) Analyze Flow Gateway Alignment Progress
- [x] `application/flows/analyze/*` switched from direct infra imports to application gateways (`it_templateGateway`, `it_storageGateway`, `it_notesGateway`, `it_recordingGateway`, `it_textGateway`, `it_llmGateway`, `it_configGateway`).
- [x] Added `it_audioGateway.ts` and expanded notes/recording/config gateways for flow-stage usage.
- [x] Kept flow behavior intact (question parse, ASR, retrieval, segment, evaluation pipeline).
- [x] Synced service docs and verified build/test/package.


## P5-20 (2026-02-07) Embedding Warmup Gateway Alignment Progress
- [x] `it_embeddingWarmup.ts` switched from direct infra imports to `it_templateGateway`, `it_notesGateway`, `it_textGateway`.
- [x] Warmup host type references switched to `it_configGateway` types.
- [x] Expanded `it_notesGateway.ts` with `it_prepareEmbeddingCache` export for precompute workflow reuse.
- [x] Synced service docs and verified build/test/package.


## P5-21 (2026-02-07) Full Architecture Compliance Sweep Progress
- [x] Completed full-layer dependency sweep for `interface/application/domain/infra`.
- [x] Hard-rule violations found: `0`.
- [x] Application non-gateway direct infra imports found: `0`.
- [x] Wrote compliance report with residual structural risks: `ARCH_COMPLIANCE_REPORT.md`.
- [x] Verified build/test/package after sweep.

## P6-1 (2026-02-07) Extension Host Lifecycle Decomposition Progress
- [x] Extracted extension host config helpers into `application/services/it_extensionConfig.ts` (`it_getLlmConfig`, `it_resolveApiConfigWithProviders`, `it_firstNonEmpty`).
- [x] Extracted workspace/dispose lifecycle helpers into `application/services/it_extensionLifecycle.ts`.
- [x] `InterviewTrainerExtension.ts` now delegates these responsibilities instead of keeping long inline logic.
- [x] Added unit tests for the extracted config helpers (`it_extensionConfig.test.ts`).
- [ ] Follow-up: continue splitting `InterviewTrainerExtension` state/session orchestration in next P6 tasks.


## P6-2 (2026-02-07) Extension Recording/State Delegation Progress
- [x] Added `application/services/it_extensionRecording.ts` to isolate recording-host delegates (ffmpeg probe/input/start/stop).
- [x] Added `application/services/it_extensionState.ts` to isolate host state merge and `it/stateUpdate` emit.
- [x] Expanded `it_recordingGateway.ts` to expose recording host APIs and types for application-level delegation.
- [x] `InterviewTrainerExtension.ts` switched recording/state methods to delegated helpers; host keeps API surface unchanged.
- [x] Added unit test for state delegate (`it_extensionState.test.ts`).
- [ ] Follow-up: continue splitting extension session lifecycle orchestration in next P6 tasks.


## P6-3 (2026-02-07) Extension Constructor Bootstrap Delegation Progress
- [x] Added `application/services/it_extensionBootstrap.ts` for constructor startup sequence orchestration.
- [x] `InterviewTrainerExtension` constructor now delegates initialization to bootstrap helper.
- [x] Added bootstrap unit test (`it_extensionBootstrap.test.ts`) with dependency injection.
- [x] Kept host API and startup behavior unchanged (config load, token sync, watchers/handlers/warmup).
- [ ] Follow-up: continue splitting extension runtime session orchestration in next P6 tasks.


## P6-4 (2026-02-07) Extension Runtime Delegation Facade Progress
- [x] Added `application/services/it_extensionRuntime.ts` + `it_extensionRuntimeDeps.ts` to unify analyze/warmup/progress delegates and production bindings.
- [x] `InterviewTrainerExtension` switched to runtime facade methods for `handleAnalyze`, warmup scheduling/running, and progress updates.
- [x] Added runtime facade unit tests (`it_extensionRuntime.test.ts`).
- [x] Kept extension host external method signatures unchanged for handler/use-case compatibility.
- [ ] Follow-up: continue splitting extension run-session state orchestration in next P6 tasks.


## P6-5 (2026-02-07) Analysis Session State Delegation Progress
- [x] Added `application/services/it_analysisSessionState.ts` to centralize analysis session state transitions.
- [x] `application/useCases/it_analysisFlow.ts` now delegates start/partial/success/cancel/error state writes to service helpers.
- [x] Added unit tests for session-state helpers (`it_analysisSessionState.test.ts`).
- [x] Synced services/useCases docs for new delegation boundary.
- [ ] Follow-up: continue splitting analysis-flow config resolution/orchestration in next P6 tasks.


## P6-6 (2026-02-07) Analysis Run Config Delegation Progress
- [x] Added `application/services/it_analysisRunConfig.ts` to isolate analysis run dependency/config preparation.
- [x] `application/useCases/it_analysisFlow.ts` now delegates config reload, env merge, and flow deps assembly to service helper.
- [x] Added unit test for run-config service (`it_analysisRunConfig.test.ts`).
- [x] Synced services/useCases docs for new delegation boundary.
- [ ] Follow-up: continue replacing `application/useCases/it_analysisFlow.ts` host type imports with app-level gateway types.


## P6-7 (2026-02-07) Analysis Host Type Boundary Alignment Progress
- [x] `application/useCases/it_analysisFlow.ts` host type imports switched from infra module paths to `application/services/it_configGateway` types.
- [x] Removed direct `application/useCases -> infra/api/*` type coupling for analysis flow host contract.
- [x] Synced use-case docs for updated host type boundary.
- [ ] Follow-up: continue replacing legacy cancellation placeholder strings (`"?????"`) with explicit cancellation semantics in a dedicated cleanup task.

