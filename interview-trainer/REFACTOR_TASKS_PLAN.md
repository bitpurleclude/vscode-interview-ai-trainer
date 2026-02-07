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

