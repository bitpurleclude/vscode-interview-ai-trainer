# interface/handlers

Webview 消息处理器集合。

## 职责
- 监听 Webview 事件并做参数校验。
- 调用 application/services 与 infra 能力。
- 仅负责 I/O 与编排，不在此处实现业务规则。
