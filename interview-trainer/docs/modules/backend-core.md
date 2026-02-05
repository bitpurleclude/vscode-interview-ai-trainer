# 后端核心流程（backend-core）

## 模块定位与职责
- 承载分析主流程（录音/转写/多题分段/检索/评价/写入）。
- 维护进度与日志输出。
- 提供 Warmup 与 Token 管理等核心能力。

## 目录与关键文件
- `src/interviewTrainer/application/useCases/it_analysisFlow.ts`：分析入口，维护状态与进度。
- `src/interviewTrainer/application/useCases/it_embeddingWarmup.ts`：Embedding 预热。
- `src/interviewTrainer/application/services/*`：日志、进度、Token、配置快照、题目解析、评价服务。
- `src/interviewTrainer/application/services/it_evaluation.ts`：评价入口编排。
- `src/interviewTrainer/application/services/it_evaluationFallback.ts`：不可用评价的兜底构建。
- `src/interviewTrainer/application/services/it_evaluationPrompt.ts`：评价提示词构建。
- `src/interviewTrainer/application/services/it_evaluationResult.ts`：评价结果解析与重建。
- `src/interviewTrainer/domain/analyze/flow.ts`：分析编排器。
- `src/interviewTrainer/domain/analyze/flow_*`：题目解析/转写声学/分段/检索阶段拆分。
- `src/interviewTrainer/domain/analyze/questions*.ts`：分段对齐/答题拆分逻辑拆分。
- `src/interviewTrainer/domain/analyze/*`：分析子流程（ASR、分段、评价、结果）。
- `src/interviewTrainer/domain/notes/indexer.ts`：语料扫描入口（同步/异步）。
- `src/interviewTrainer/domain/notes/indexer_constants.ts`：语料扫描常量。
- `src/interviewTrainer/domain/notes/indexer_fs.ts`：文件遍历与 mtime 获取/异步扫描。
- `src/interviewTrainer/domain/notes/indexer_dirty.ts`：增量更新（脏文件）逻辑。
- `src/interviewTrainer/domain/notes/indexer_utils.ts`：目录 mtime 比较工具。
- `src/interviewTrainer/domain/notes/cache.ts`：语料与向量缓存入口（Barrel）。
- `src/interviewTrainer/domain/notes/cache_constants.ts`：缓存常量。
- `src/interviewTrainer/domain/notes/cache_corpus.ts`：语料缓存与磁盘路径。
- `src/interviewTrainer/domain/notes/cache_query.ts`：检索查询与向量缓存。
- `src/interviewTrainer/domain/notes/cache_embedding.ts`：向量缓存读写与补算。
- `src/interviewTrainer/domain/notes/cache_warmup.ts`：向量预计算（Warmup）。
- `src/interviewTrainer/domain/notes/*`：检索与排序。
- `src/interviewTrainer/infra/clients/*`：LLM/ASR/Embedding 客户端。
- `src/interviewTrainer/infra/storage/*`：结果写入与缓存。
- `src/interviewTrainer/infra/recording/it_recording.ts`：录音与 ffmpeg 处理。
- `src/interviewTrainer/infra/logging/it_traceLogger.ts`：Trace 日志输出。

## 主要流程
1) `it_analysisFlow.ts` 收到 `it/analyzeAudio` → 初始化状态。
2) 调用 `domain/analyze/flow.ts` 组织 ASR → 分段 → 检索 → 评价。
3) 通过 `application/services/it_logging.ts` 推送实时输出到 Webview。
4) 结果由 `infra/storage/*` 写入 session。

## 关键调用链
- 分析入口：`interface/handlers/it_webviewResultHandlers.ts` → `application/useCases/it_analysisFlow.ts`
- ASR：`domain/analyze/asr.ts` → `infra/clients/asrClient.ts`
- 检索：`domain/notes/*` → `infra/clients/embeddingClient.ts`
- 评价：`domain/analyze/evaluation.ts` → `infra/clients/llmClient.ts`
- 写入：`domain/analyze/result.ts` → `infra/storage/*`

## 配置与环境
- `skill_config.yaml` 控制检索/评价/题目等策略。
- `api_config.yaml` 控制模板与 provider。

## 注意事项
- 多题并行评价依赖 `questionList` 的 stream 更新。
- 实时输出采用“增量覆盖”策略，前端仅展示最新片段。

## 测试建议
- 本地执行 `npm run build`，确保核心逻辑编译通过。
- 对多题场景进行端到端分析验证。