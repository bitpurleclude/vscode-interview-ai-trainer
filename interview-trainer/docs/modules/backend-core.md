# 后端核心流程（backend-core）

## 模块定位与职责
- 承载分析主流程（录音/转写/多题分段/检索/评价/写入）。
- 维护进度与日志输出。
- 提供 Warmup、Token 管理等核心能力。

## 目录与关键文件
- `src/interviewTrainer/application/useCases/it_analysisFlow.ts`：分析入口，维护状态与进度。
- `src/interviewTrainer/application/useCases/it_embeddingWarmup.ts`：Embedding 预热。
- `src/interviewTrainer/application/services/*`：日志、进度、Token、配置快照、题目解析、评价服务。
- `src/interviewTrainer/application/flows/analyze/*`：分析流程编排与阶段实现。
- `src/interviewTrainer/domain/analyze/*`：分析子流程（ASR、分段、检索、评价、结果）。
- `src/interviewTrainer/domain/notes/*`：检索算法（分词/评分/相似度/排序），无 I/O。
- `src/interviewTrainer/infra/notes/*`：语料扫描、缓存、向量检索与 Warmup。
- `src/interviewTrainer/infra/clients/*`：LLM/ASR/Embedding 客户端。
- `src/interviewTrainer/infra/storage/*`：结果写入与缓存。
- `src/interviewTrainer/infra/recording/it_recording.ts`：录音与 ffmpeg 处理。
- `src/interviewTrainer/infra/logging/it_traceLogger.ts`：Trace 日志输出。

## 主要流程
1) `it_analysisFlow.ts` 接收 `it/analyzeAudio` → 初始化状态。
2) `application/flows/analyze/flow.ts` 组织 ASR → 分段 → 检索 → 评价。
3) `application/services/it_logging.ts` 推送实时输出到 Webview。
4) 结果由 `infra/storage/*` 写入 session。

## 关键调用链
- 分析入口：`interface/handlers/it_webviewResultHandlers.ts` → `application/useCases/it_analysisFlow.ts`
- ASR：`domain/analyze/asr.ts` → `infra/clients/asrClient.ts`
- 检索：`infra/notes/*` → `infra/clients/embeddingClient.ts`（算法在 `domain/notes/*`）
- 评价：`domain/analyze/evaluation.ts` → `infra/clients/llmClient.ts`
- 写入：`domain/analyze/result.ts` → `infra/storage/*`

## 配置与环境
- `config/skill_config.yaml` 控制检索/评价/题目等策略。
- `config/api_config.yaml` 控制模板与 provider。

## 注意事项
- 多题并行评价依赖 `questionList` 的 stream 更新。
- 实时输出采用“增量覆盖”策略，前端只展示最新片段。

## 测试建议
- 本地执行 `npm run build`，确保核心逻辑编译通过。
- 对多题场景进行端到端分析验证。
