# interface/handlers

Webview 消息处理器集合（Interface 层）。

## 职责
- 接收 Webview 消息并做轻量参数校验。
- 组装 use-case context，调用 `application/useCases/*`。
- 负责 I/O 交互（VS Code API、Webview 回包），不承载业务规则。

## 约束
- 各 handler 通过 `it_webviewHandlerPorts.ts` 按能力声明 Host 依赖，避免依赖全量 Host。
- `it_webviewHandlers.ts` 仅负责注册路由，不写业务逻辑。
- Interface 不直接依赖 `infra/*`；需要外部能力时通过 use-case/gateway 转接。
