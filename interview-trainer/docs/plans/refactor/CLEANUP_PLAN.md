# 代码清理计划（CLEANUP_PLAN）

## Document Metadata
- Document Type: `Plan + Execution`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/`
  - `interview-trainer/webview/src/`
  - `interview-trainer/config/`

## Background and Goals
- 通过依赖图与符号级扫描识别疑似未使用代码，降低维护负担和认知噪声。
- 在不破坏运行行为的前提下，分批清理陈旧文件、导出符号和无效配置。

## Scope and Non-goals
- Scope:
  - 保留已完成的多轮扫描证据与疑似项列表。
  - 将“可直接清理”和“待人工确认”分层管理，避免误删。
  - 执行前后通过构建测试进行回归确认。
- Non-goals:
  - 不基于静态扫描结果直接删除所有疑似项。
  - 不覆盖动态 import、运行时反射、宿主回调等静态图无法判定路径。

## Task Matrix (Summary)
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| C1 | P0 | Completed | 深度扫描与符号级扫描基线建立 | 扫描记录可追溯，候选项可复核 |
| C2 | P0 | In Progress | 明确“可清理”与“待确认”边界并推进清理 | 清理项有证据与回归结果 |
| C3 | P1 | In Progress | 配置字段/方法级别遗留项治理 | 无效字段和死代码逐步收敛 |

## Verification
- Commands:
  - `npm run build`
  - `npm run test`
- Evidence:
  - 每次清理后构建与测试通过。
  - 被清理项不存在运行时引用回归。

## Risks and Rollback
- Risks:
  - 静态分析存在误报，直接删除可能破坏隐藏运行路径。
  - 大批量清理会增加 code review 负担。
- Rollback:
  - 按批次清理并单独提交，出现问题可快速定位回滚。
  - 对不确定项先降级为“取消导出/标注弃用”，再观察稳定性。

## Progress Log
- `2026-02`: 完成多轮可达性与符号级扫描并沉淀候选项。
- `2026-02-21`: 文档规范化，补齐摘要矩阵与统一验证口径。

## Legacy Detailed Plan
> 以下内容保留原始扫描记录与清理候选明细。

## 范围说明
- 已执行深度扫描：从入口文件构建相对导入依赖图，标记不可达文件（疑似未使用）。
- 入口：`src/extension.ts`、`webview/src/main.tsx`。
- 依赖解析：仅解析相对路径导入（`./`、`../`），不含动态 import 与运行时反射；结果为“疑似”。

## 深度扫描记录（20 次）
> 说明：每次扫描均记录“未使用/不可达”结果；如无新增则标记“无新增”。  
> 不可达基于相对导入图；“未使用”指零入边或无引用字段/方法。

1) 全量入口可达性（extension + main）
- 不可达：`src/interviewTrainer/domain/analyze/questions.ts`、`src/interviewTrainer/domain/analyze/questionsTiming.ts`
- 未使用：`src/interviewTrainer/domain/analyze/questions.ts`（零入边，仅 re-export）

2) 后端入口可达性（extension）
- 不可达：同上
- 未使用：同上

3) Webview 入口可达性（main）
- 不可达：无新增
- 未使用：无新增

4) domain/analyze 子模块扫描
- 不可达：`questions.ts`、`questionsTiming.ts`
- 未使用：`questions.ts`（零入边）

5) domain/evaluation 子模块扫描
- 不可达：无新增
- 未使用：无新增

6) domain/notes 子模块扫描
- 不可达：无新增
- 未使用：无新增

7) application/flows 扫描
- 不可达：无新增
- 未使用：无新增

8) application/services 扫描
- 不可达：无新增
- 未使用：无新增

9) application/useCases 扫描
- 不可达：无新增
- 未使用：无新增

10) interface/handlers 扫描
- 不可达：无新增
- 未使用：无新增

11) infra/api 扫描
- 不可达：无新增
- 未使用：无新增

12) infra/clients 扫描
- 不可达：无新增
- 未使用：无新增

13) infra/logging 扫描
- 不可达：无新增
- 未使用：无新增

14) infra/notes 扫描
- 不可达：无新增
- 未使用：无新增

15) infra/recording 扫描
- 不可达：无新增
- 未使用：无新增

16) infra/storage 扫描
- 不可达：无新增
- 未使用：无新增

17) infra/utils 扫描
- 不可达：无新增
- 未使用：无新增

18) webview/components 扫描
- 不可达：无新增
- 未使用：无新增

19) webview/hooks + utils 扫描
- 不可达：无新增
- 未使用：无新增

20) 配置/类型字段扫描
- 未使用配置：`config/app_config.yaml`（未被任何逻辑引用）
- 未使用字段：`ItApiConfig.local`、`ItApiConfig.ccswitch`
- 未使用方法：`ItConfigService.migrateTemplatesFromLegacy(...)`（未调用）

## 深度扫描结果（疑似未使用）
1) 题目时间轴相关（疑似未被引用）
- `src/interviewTrainer/domain/analyze/questions.ts`
- `src/interviewTrainer/domain/analyze/questionsTiming.ts`

说明：`questions.ts` 仅 re-export `it_buildQuestionTimings`，目前仓库内没有引用该导出，疑似遗留。

## 导出符号级别扫描（更细粒度）
> 说明：仅基于相对导入/导出关系判定“导出符号未被引用”，不包含运行时反射/宿主回调/动态 import。  
> 结果为“疑似”，清理前需人工确认。  

### A) 宿主入口（误报，保留）
- `src/extension.ts`：`activate` / `deactivate`  
  说明：由 VS Code 宿主调用，不会被代码 import。

### B) 明确疑似“导出但未被引用”的符号（候选：取消导出或删除）
**application/flows**  
- `flow_audioStage.ts`：`AudioStageResult`  
- `flow_questionStage.ts`：`QuestionParseStageResult`  
- `flow_retrievalStage.ts`：`RetrievalStageResult`  
- `flow_segmentStage.ts`：`SegmentStageResult`  
- `flow_types.ts`：`ItAnalyzeContext`

**application/services / useCases**  
- `it_configSnapshot.ts`：`ItConfigSnapshotHost`  
- `it_evaluation.ts`：`ItEvaluationConfig`  
- `it_logging.ts`：`ItLogHost`  
- `it_progress.ts`：`IT_PROGRESS_WEIGHTS`  
- `it_questionParser.ts`：`ItParsedQuestions`  
- `it_analysisFlow.ts`：`ItAnalysisHost`  
- `it_embeddingWarmup.ts`：`ItEmbeddingWarmupHost`

**domain/analyze**  
- `questions.ts`：`it_alignAnswerToSegments` / `it_buildQuestionTimings` / `it_collectAnswersFromSegments`  
（说明：实际使用点在 `questionsSegments.ts`，这里为 re-export；若不再需要该聚合，可删文件或移除导出）

**domain/evaluation**  
- `scoring.ts`：`it_mapScoreKeys`

**domain/notes/index.ts（聚合导出）**  
- `ItNoteHit`  
- `it_buildSnippet` / `it_cosineSimilarity` / `it_mergeQueryHits` / `it_scoreTokens` / `it_splitText` / `it_tokenize`

**infra/api**  
- `it_baidu.ts`：`ItBaiduAsrConfig` / `ItBaiduAsrRequest` / `ItBaiduToken`  
- `it_configServiceHelpers.ts`：`ItResolvedApiMode` / `it_buildDoubaoChatUrl` / `it_buildDoubaoResponsesUrl` / `it_buildOpenAiChatUrl` / `it_buildOpenAiResponsesUrl` / `it_buildTemplateBaseHeaders` / `it_buildTemplateId`  
- `it_embedding.ts`：`ItEmbeddingDebugError` / `ItEmbeddingDebugInfo` / `ItEmbeddingDebugRequest` / `ItEmbeddingProvider`  
- `it_llm.ts`：`it_callDoubaoResponses`（已在内部使用，导出未被引用）  
- `it_llmStream.ts`：`it_extractStreamDelta`  
- `it_requestBuilder.ts`：`ItLlmRequestSpec`  
- `it_templateExecutor.ts`：`ItTemplateExecutionOptions` / `ItTemplateExecutionResult` / `ItTemplateRenderResult`  
- `it_templateHttp.ts`：`it_buildQueryString` / `it_extractStreamDelta`  
- `it_templatePath.ts`：`ItPathToken`  
- `it_templateVars.ts`：`IT_TEMPLATE_VAR_FULL` / `IT_TEMPLATE_VAR_PATTERN` / `ItTemplateRuntimeLike` / `it_collectTemplateVars` / `it_resolveVar`  
- `it_volc_asr.ts`：`ItVolcAsrAudioPayload` / `ItVolcAsrConfig` / `ItVolcAsrMode`

**infra/logging / notes / recording / storage**  
- `it_traceLogger.ts`：`ItTraceSink`  
- `infra/notes/cache.ts`：`IT_DEFAULT_BATCH_SIZE` / `IT_EMBEDDING_CACHE_VERSION` / `it_clearCachedCorpus` / `it_clearEmbeddingCaches` / `it_clearQueryCaches` / `it_loadEmbeddingCache` / `it_saveEmbeddingCache`  
- `infra/notes/cache_embedding.ts`：`ItEmbeddingEnsureResult`  
- `infra/notes/index.ts`：`ItEmbeddingWarmupOptions` / `ItEmbeddingWarmupResult` / `ItRetrievalMetrics` / `ItRetrievalOptions` / `ItVectorSearchConfig` / `it_buildCorpus` / `it_retrieveNotes`  
- `infra/recording/it_recording.ts`：`ItRecordingHost`  
- `infra/storage/it_questionCache.ts`：`ItQuestionParseCacheEntry`  
- `infra/storage/it_report.ts`：`ItReportConfig` / `it_appendReport` / `it_renderReport`  
- `infra/storage/it_reportOutline.ts`：`it_buildOutlineTree` / `it_renderOutlineTree`  
- `infra/storage/it_sessions.ts`：`ItTopicMeta` / `it_appendAttemptData` / `it_findExistingTopicDir` / `it_findExistingTopicDirAsync` / `it_nextAttemptIndex` / `it_readTopicMeta` / `it_reportPathForTopic` / `it_resolveTopicDir` / `it_writeTopicMeta`

**webview**  
- `webview/src/types.ts`：`ItAudioSegment` / `ItRevisedAnswer` / `ItStepStatus` / `ItTemplatesSnapshot` / `ItTokenState` / `ItWorkflowStep`  
  （说明：可能仅是 re-export 未被本端引用；是否保留作为公共类型需确认）  
- `StreamCard.tsx`：`StreamCardVariant`  
- `settingsTypes.ts`：`RetrievalDir` / `RetrievalField` / `TemplateJsonDraft` / `TemplateJsonErrors`  
- `utils/outline.tsx`：`extractOutlinePaths`

### C) 处理建议
- 若仅内部使用：取消导出（去掉 export），保留实现。  
- 若本端完全未用且无外部依赖：可删除导出或文件。  
- 对公共协议/宿主入口保持保留（避免破坏扩展加载与对外 API）。

## 导出符号级别扫描（更细致：按符号文本引用）
> 说明：基于“符号名在其他文件中的文本匹配”统计外部引用次数。  
> 不区分类型/运行时、也不解析动态拼接；结果仅作候选清理参考。

### 结果（UNUSED = 未在其他文件出现；LOW(1) = 仅出现 1 次）
- `src/extension.ts`：UNUSED -> `activate`, `deactivate`（宿主入口，保留）
- `flow_audioStage.ts`：UNUSED -> `AudioStageResult`
- `flow_questionStage.ts`：UNUSED -> `QuestionParseStageResult`
- `flow_retrievalStage.ts`：UNUSED -> `RetrievalStageResult`
- `flow_segmentStage.ts`：UNUSED -> `SegmentStageResult`
- `flow_types.ts`：UNUSED -> `ItAnalyzeContext`；LOW(1) -> `ItAnalyzeProgress`
- `it_configSnapshot.ts`：UNUSED -> `ItConfigSnapshotHost`
- `it_logging.ts`：UNUSED -> `ItLogHost`
- `it_progress.ts`：UNUSED -> `IT_PROGRESS_WEIGHTS`
- `it_questionParser.ts`：UNUSED -> `ItParsedQuestions`
- `it_analysisFlow.ts`：UNUSED -> `ItAnalysisHost`
- `it_embeddingWarmup.ts`：UNUSED -> `ItEmbeddingWarmupHost`
- `questionsTiming.ts`：LOW(1) -> `it_buildQuestionTimings`
- `scoring.ts`：UNUSED -> `it_mapScoreKeys`
- `it_baidu.ts`：UNUSED -> `ItBaiduAsrConfig`, `ItBaiduAsrRequest`, `ItBaiduToken`
- `it_configServiceHelpers.ts`：UNUSED -> `ItResolvedApiMode`, `it_buildTemplateBaseHeaders`, `it_buildTemplateId`
- `it_embedding.ts`：UNUSED -> `ItEmbeddingDebugError`, `ItEmbeddingDebugInfo`, `ItEmbeddingDebugRequest`, `ItEmbeddingProvider`
- `it_requestBuilder.ts`：UNUSED -> `ItLlmRequestSpec`
- `it_templateExecutor.ts`：UNUSED -> `ItTemplateExecutionOptions`, `ItTemplateExecutionResult`, `ItTemplateRenderResult`
- `it_templateHttp.ts`：UNUSED -> `it_buildQueryString`
- `it_templatePath.ts`：UNUSED -> `ItPathToken`
- `it_templateVars.ts`：UNUSED -> `IT_TEMPLATE_VAR_FULL`, `ItTemplateRuntimeLike`, `it_resolveVar`
- `it_volc_asr.ts`：UNUSED -> `ItVolcAsrAudioPayload`, `ItVolcAsrConfig`, `ItVolcAsrMode`
- `it_traceLogger.ts`：UNUSED -> `ItTraceSink`
- `cache_embedding.ts`：UNUSED -> `ItEmbeddingEnsureResult`；LOW(1) -> `it_loadEmbeddingCache`
- `indexer.ts`：LOW(1) -> `it_buildCorpus`
- `it_recording.ts`：UNUSED -> `ItRecordingHost`
- `it_questionCache.ts`：UNUSED -> `ItQuestionParseCacheEntry`
- `it_reportAppend.ts`：LOW(1) -> `it_appendReport`
- `it_reportOutline.ts`：UNUSED -> `it_buildOutlineTree`, `it_renderOutlineTree`
- `it_sessionsAttempts.ts`：LOW(1) -> `it_appendAttemptData`, `it_nextAttemptIndex`, `it_reportPathForTopic`
- `it_sessionsTopic.ts`：LOW(1) -> `it_readTopicMeta`, `it_resolveTopicDir`, `it_writeTopicMeta`
- `it_audio.ts`：UNUSED -> `it_int16ToFloat`
- `protocol/interviewTrainer.ts`：UNUSED -> `ItTemplateResponseMode`, `ItTemplateTokenConfig`, `ItTokenStatus`（可能仅用于外部类型）
- `WebviewProtocol.ts`：UNUSED -> `WebviewMessage`
- `settingsTypes.ts`：UNUSED -> `RetrievalDir`, `RetrievalField`
- `StreamCard.tsx`：UNUSED -> `StreamCardVariant`
- `utils/outline.tsx`：UNUSED -> `extractOutlinePaths`


## 已识别的陈旧/无用项（可直接纳入清理）
1) 空目录（无任何文件）
- `src/interviewTrainer/api/`
- `src/interviewTrainer/handlers/`
- `src/interviewTrainer/storage/`
- `src/interviewTrainer/utils/`

说明：这些目录为空，属于遗留占位，代码层面无用途。

2) 未被使用的 app_config 配置
- `config/app_config.yaml` 目前被读取，但没有任何代码使用 `configBundle.app`，文件内字段也无引用。
- 证据：全仓库未找到 `configBundle.app` 或 `collapse_delay_sec`/`remember_tab` 等字段的引用。

建议：
- 若不再使用该配置，删除 `app_config.yaml` 与 `ItConfigBundle.app`/读取逻辑；
- 或者明确接入并在文档中标注用途（二者择一）。

3) 未被调用的遗留方法
- `ItConfigService.migrateTemplatesFromLegacy(...)` 仅定义、未被调用。

建议：
- 若已不做旧配置迁移：删除该方法与相关注释；
- 若仍需要迁移：在加载配置时补上调用路径并补文档说明。

4) 未被使用的 API 配置字段
- `ItApiConfig.local`、`ItApiConfig.ccswitch` 仅在类型中存在，未被任何逻辑读取或写入。
- 证据：全仓库未找到 `local`/`ccswitch` 的引用。

建议：
- 若无历史用途：移除字段与相关注释；
- 若预留扩展：补充实际接入与文档说明。

## 待确认的“可能无用”项（需你确认后才清理）
1) Specify CLI 入口
- `itInterviewTrainer.runSpecify` 命令与状态栏按钮仅在 `src/extension.ts` 中使用。
- 若当前插件不再依赖 `specify`，可删除命令、状态栏入口与贡献配置；否则保留。

2) 构建产物目录（非源码）
- `out/`、`media/`、`build/` 为构建/打包产物。
- 若版本控制不需要保留这些产物，可加入忽略并清理；但打包仍会生成。

## 清理要求
- 删除前必须确认没有运行时或动态引用依赖。
- 清理后必须更新相关文档与计划，并执行 `npm run build` 验证。
- 按你的要求：修改前先确认，再执行清理；清理完成后提交、打包、发布 beta。

## 清理步骤（执行顺序）
1) 删除空目录（api/handlers/storage/utils）。
2) 处理 `app_config.yaml`：删除或接入（按你选择）。
3) 处理 `migrateTemplatesFromLegacy`：删除或接入（按你选择）。
4) 处理“深度扫描疑似未使用”文件：`questions.ts`、`questionsTiming.ts`（需你确认）。
5) 若确认不需要 Specify：移除命令、状态栏入口与配置贡献。
6) 若确认不提交构建产物：将 `out/`、`media/`、`build/` 加入忽略并清理。

## 风险与验证
- 删除配置与迁移逻辑前需确认是否有历史用户依赖。
- 删除命令入口需确认无用户使用 Specify。
- 清理后跑：`npm run build`。

## 已确认（执行选择 1-7）
- 已删除空目录：`src/interviewTrainer/api/`、`src/interviewTrainer/handlers/`、`src/interviewTrainer/storage/`、`src/interviewTrainer/utils/`。
- 已删除 `config/app_config.yaml` 及相关读取逻辑。
- 已移除 `migrateTemplatesFromLegacy` 迁移逻辑。
- 已删除 `questions.ts` / `questionsTiming.ts`。
- 已移除 `ItApiConfig.local` / `ItApiConfig.ccswitch` 字段及默认配置字段。
- 已移除 Specify 入口（命令/状态栏/贡献配置）。
- 构建产物目录：未选择清理，保持不变。
