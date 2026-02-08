# Webview Handlers（backend-handlers）

## 模块作用
- 承接 Webview -> Extension 的消息入口。
- 将事件分派到对应 use-case，并把结果回传给 Webview。
- 保持 Interface 层轻量：参数校验、I/O 编排，不处理业务算法。

## 文件组成
- `src/interviewTrainer/interface/handlers/it_webviewHandlers.ts`：统一注册入口。
- `src/interviewTrainer/interface/handlers/it_webviewHandlerPorts.ts`：按能力拆分的 Host 端口契约。
- `src/interviewTrainer/interface/handlers/it_webviewHandlerLogging.ts`：统一 request/success/error 结构化日志包装器。
- `src/interviewTrainer/interface/handlers/it_webviewCoreHandlers.ts`：核心状态/配置/历史记录操作。
- `src/interviewTrainer/interface/handlers/it_webviewConfigHandlers.ts`：配置大类分派（环境/模板/Provider/目录）。
- `src/interviewTrainer/interface/handlers/it_webviewQuestionHandlers.ts`：题目解析与示例回答生成。
- `src/interviewTrainer/interface/handlers/it_webviewRecordingHandlers.ts`：录音设备与录音流程调度。
- `src/interviewTrainer/interface/handlers/it_webviewRetrievalHandlers.ts`：检索配置与缓存维护。
- `src/interviewTrainer/interface/handlers/it_webviewResultHandlers.ts`：分析启动/取消/结果保存。
- `src/interviewTrainer/interface/handlers/it_webviewTestHandlers.ts` + `it_webviewTest*Handlers.ts`：LLM/ASR/Embedding/模板测试入口。

## 关键调用链
- `WebviewProtocol.on(...)` -> `interface/handlers/*` -> `application/useCases/*` -> `application/services/*Gateway` -> `infra/*`。
- 状态类返回（`configBundle/configSnapshot/state`）在 handler 层合并回 Host。

## 开发注意
- 新增 Webview 消息时，先在对应 handler 声明端口依赖，再落地 use-case。
- 新增 handler 路由时优先使用 `it_runLoggedHandler`，保持 request/success/error 事件格式一致。
- 不要在 handler 内直接操作 `infra/*`，避免跨层耦合。
- 大对象 Host 请继续按能力细化为 port，保持可维护性。
- 统一日志入口通过 `ItWebviewProtocolPort.logCorpusTrace` 暴露，避免各 handler 私有实现漂移。
