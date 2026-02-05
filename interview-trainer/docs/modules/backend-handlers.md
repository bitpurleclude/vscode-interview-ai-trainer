# Webview Handlers（backend-handlers）

## 模块定位与职责
承接 Webview 发来的消息请求，转发到对应业务逻辑并返回结果。

## 目录与关键文件
- `src/interviewTrainer/interface/handlers/it_webviewHandlers.ts`：总入口注册
- `it_webviewCoreHandlers.ts`：通用/配置读取/历史
- `it_webviewConfigHandlers.ts`：配置与模板绑定
- `it_webviewQuestionHandlers.ts`：题目解析、示范回答
- `it_webviewRecordingHandlers.ts`：录音相关指令
- `it_webviewRetrievalHandlers.ts`：检索与缓存
- `it_webviewResultHandlers.ts`：分析与结果处理
- `it_webviewTestHandlers.ts`：模板测试/日志

## 关键调用链
- `webview/src/messenger.ts` → `WebviewProtocol` → `it_webviewHandlers.ts`
- 分析：`it_webviewResultHandlers.ts` → `application/useCases/it_analysisFlow.ts`
- 模板测试：`it_webviewTestHandlers.ts` → `infra/api/it_templateExecutor.ts`

## 注意事项
- 所有 handler 必须保持消息格式一致（`status/content/error`）
- 对 long-running 请求需设置合理超时并在前端提示

## 常见问题
- Webview 无响应：检查 `WebviewProtocol` 是否已绑定 webview
- 消息没有回调：前端请求未带 `messageId` 或后端未返回
