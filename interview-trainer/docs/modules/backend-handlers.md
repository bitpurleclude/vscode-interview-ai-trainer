# Webview Handlers（backend-handlers）

## 模块定位与职责
- 承接 Webview 发来的消息请求，转发到对应业务逻辑并返回结果。
- 统一处理配置读取、测试请求、检索、录音、分析与结果写入等入口。

## 目录与关键文件
- `src/interviewTrainer/interface/handlers/it_webviewHandlers.ts`：总入口注册。
- `src/interviewTrainer/interface/handlers/it_webviewCoreHandlers.ts`：通用/配置读取/历史。
- `src/interviewTrainer/interface/handlers/it_webviewConfigHandlers.ts`：配置注册聚合。
- `src/interviewTrainer/interface/handlers/it_webviewTemplateHandlers.ts`：模板、密钥、Token 配置。
- `src/interviewTrainer/interface/handlers/it_webviewEnvironmentHandlers.ts`：环境/Prompt/流式配置。
- `src/interviewTrainer/interface/handlers/it_webviewProviderHandlers.ts`：Provider 配置文件。
- `src/interviewTrainer/interface/handlers/it_webviewWorkspaceHandlers.ts`：工作区/会话目录选择。
- `src/interviewTrainer/interface/handlers/it_webviewQuestionHandlers.ts`：题目解析、示范回答。
- `src/interviewTrainer/interface/handlers/it_webviewRecordingHandlers.ts`：录音相关指令。
- `src/interviewTrainer/interface/handlers/it_webviewRetrievalHandlers.ts`：检索与缓存。
- `src/interviewTrainer/interface/handlers/it_webviewResultHandlers.ts`：分析与结果处理。
- `src/interviewTrainer/interface/handlers/it_webviewTestHandlers.ts`：测试入口注册。
- `src/interviewTrainer/interface/handlers/it_webviewTestLlmHandlers.ts`：LLM 测试。
- `src/interviewTrainer/interface/handlers/it_webviewTestAsrHandlers.ts`：ASR 测试。
- `src/interviewTrainer/interface/handlers/it_webviewTestEmbeddingHandlers.ts`：Embedding 测试。
- `src/interviewTrainer/interface/handlers/it_webviewTemplateTestHandlers.ts`：模板 dry-run 与 live 测试。
- `src/interviewTrainer/interface/handlers/it_webviewTestHelpers.ts`：测试相关通用辅助函数。

## 关键调用链
- `webview/src/messenger.ts` → `WebviewProtocol` → `it_webviewHandlers.ts`
- 分析：`it_webviewResultHandlers.ts` → `application/useCases/it_analysisFlow.ts`
- 模板测试：`it_webviewTemplateTestHandlers.ts` → `infra/api/it_templateExecutor.ts`

## 注意事项
- 所有 handler 必须保持消息格式一致（`status/content/error`）。
- 对 long-running 请求设置合理超时，并在前端提示。
- 工作区目录写入统一使用 `skill.workspace.<xxx_dir>`；禁止继续写入旧顶层 `skill.<xxx_dir>`。

## 常见问题
- Webview 无响应：检查 `WebviewProtocol` 是否已绑定 webview。
- 消息没有回调：前端请求缺少 `messageId` 或后端未返回。
- ?????`it_webviewTemplateHandlers.ts` ? `application/useCases/it_templateActions.ts`
- ??????`it_webviewWorkspaceHandlers.ts` ? `application/useCases/it_workspaceActions.ts`
- Provider ???`it_webviewProviderHandlers.ts` ? `application/useCases/it_providerActions.ts`
- Handler ?????????????????? `application/useCases/*`?
