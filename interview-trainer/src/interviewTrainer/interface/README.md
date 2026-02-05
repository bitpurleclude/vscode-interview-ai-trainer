# interface

对外入口层（VS Code 侧）。

## 职责
- 处理 VS Code 命令和 Webview 事件。
- 组织输入/输出，调用 application 用例与 services。
- 不承载复杂业务规则或算法。

## 目录
- `commands/`：VS Code 命令入口与注册。
- `handlers/`：Webview 消息处理器。
- `webview/`：Webview 侧桥接说明（实际协议在 `src/webview/`）。
