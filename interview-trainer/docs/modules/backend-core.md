# 后端核心流程（backend-core）

## 模块定位与职责
承载分析主流程（录音/转写/多题分段/检索/评价/写入）、进度与日志、Warmup、Token 管理等核心能力。

## 目录与关键文件
- `src/interviewTrainer/core/it_analysisFlow.ts`：分析入口，维护状态与 progress
- `src/interviewTrainer/core/it_analyze.ts`：分析主流程 orchestrator
- `src/interviewTrainer/core/analyze/*`：子流程实现（ASR、分段、评价、结果）
- `src/interviewTrainer/core/it_evaluation.ts`：评价请求/解析与输出整合
- `src/interviewTrainer/core/it_notes.ts`：检索入口
- `src/interviewTrainer/core/it_recording.ts`：录音与 ffmpeg 处理
- `src/interviewTrainer/core/it_progress.ts`：状态与进度管理
- `src/interviewTrainer/core/it_logging.ts`：日志/实时输出桥
- `src/interviewTrainer/core/it_embeddingWarmup.ts`：Embedding 预热
- `src/interviewTrainer/core/it_tokens.ts`：Token 管理与刷新

## 主要流程
1) `it_analysisFlow.ts` 收到 `it/analyzeAudio` → 初始化状态
2) `it_analyze.ts` 执行：ASR → 分段 → 检索 → 评价 → 汇总与保存
3) 过程中通过 `it_logging.ts` 发送实时输出到 Webview

## 关键调用链
- 分析入口：`it_webviewCoreHandlers.ts` → `it_analysisFlow.ts` → `it_analyze.ts`
- ASR：`core/analyze/asr.ts` → `core/clients/asrClient.ts`
- 检索：`core/notes/*` → `core/clients/embeddingClient.ts`
- 评价：`it_evaluation.ts` → `core/clients/llmClient.ts`
- 写入：`core/analyze/result.ts` → `storage/*`

## 配置与环境
- `skill_config.yaml` 控制检索/评价/标题等策略
- `api_config.yaml` 控制模板与 provider

## 注意事项
- 多题并行评价依赖 `questionList` 与 stream 更新
- 实时输出是「增量覆盖」逻辑，前端只显示最新片段

## 常见问题
- 分析卡住：多与模板绑定/网络请求失败相关
- 检索无结果：embedding 模板未绑定或 query 为空

## 测试建议
- 本地执行 `npm run build` 确认核心逻辑编译通过
- 对多题场景进行端到端分析验证
