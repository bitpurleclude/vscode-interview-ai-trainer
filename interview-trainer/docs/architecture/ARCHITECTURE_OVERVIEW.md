# 架构总览（Interview Trainer）

## 1. 运行时构成
- VS Code 扩展入口：`src/extension.ts`
- 扩展主控制器：`src/interviewTrainer/InterviewTrainerExtension.ts`
- Webview 容器与协议桥：`src/webview/InterviewTrainerWebviewViewProvider.ts`、`src/webview/WebviewProtocol.ts`
- Webview 前端 UI：`webview/src/`（React）
- 配置与模板体系：`config/` + `src/interviewTrainer/infra/api/*`
- 数据与缓存：`src/interviewTrainer/infra/storage/*` + 全局存储目录
- 分析主流程：`src/interviewTrainer/application/useCases/*` + `domain/*`
- 外部调用：`src/interviewTrainer/infra/clients/*`

## 2. 关键数据对象
- 状态：`ItState`（`src/protocol/interviewTrainer.ts`）
- 分析请求/结果：`ItAnalyzeRequest`、`ItAnalyzeResponse`
- 配置快照：`ItConfigSnapshot`
- 模板配置：`ItTemplatesConfig`（`config/templates.yaml`）

## 3. 关键调用链（文件路径级）
### 3.1 扩展启动链
- `src/extension.ts` → `InterviewTrainerWebviewViewProvider`
- `src/extension.ts` → `InterviewTrainerExtension`（注册 handlers / 初始化 config / token 服务）

### 3.2 Webview 消息链
- `webview/src/messenger.ts` 发起 `request()`
- `src/webview/WebviewProtocol.ts` 接收消息并调用 handler
- `src/interviewTrainer/interface/handlers/it_webviewHandlers.ts` 分发到各子 handler

### 3.3 分析主流程（音频 → 结果）
- `webview/src/hooks/useAnalysisFlow.ts` → `request("it/analyzeAudio")`
- `src/interviewTrainer/interface/handlers/it_webviewResultHandlers.ts`
- `src/interviewTrainer/application/useCases/it_analysisFlow.ts` → `it_runAnalysis`
- `src/interviewTrainer/application/flows/analyze/flow.ts`
  - ASR：`domain/analyze/asr.ts` → `infra/clients/asrClient.ts`
  - 多题分段：`domain/analyze/questionsSegments.ts`
  - 笔记检索：`infra/notes/*` → `infra/clients/embeddingClient.ts`（算法在 `domain/notes/*`）
  - 面试评价：`application/services/it_evaluation.ts` / `application/services/it_evaluationLlm.ts` → `infra/clients/llmClient.ts`
  - 结果汇总与写入：`domain/analyze/result.ts` → `infra/storage/*`

### 3.4 实时输出（stream）
- 后端：`application/services/it_logging.ts` → `it/evaluationStreamUpdate` / `it/stepStreamUpdate`
- 前端：`webview/src/hooks/useStreaming.ts` → `StepsList/StreamCard`

## 4. 配置与模板体系
- YAML 配置：`config/*.yaml`（默认配置）
- 用户配置：`ItConfigService` 负责加载/写入/合并
- 模板绑定：`it_templateExecutor.ts` + `it_configSnapshot.ts` 负责解析模板与环境

## 5. 约束与注意事项
- Release 前需保证文本文件 UTF-8，VSIX 打包产物包含 `node_modules/ffmpeg-static`。
- 实时输出依赖 Webview 协议消息，不应绕过 `WebviewProtocol`。
- 模板请求需通过统一模板执行器/构建器，避免参数遗漏。
