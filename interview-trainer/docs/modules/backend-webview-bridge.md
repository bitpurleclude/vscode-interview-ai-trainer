# Webview 视图与桥接（backend-webview-bridge）

## 模块定位与职责
提供 Webview 容器、HTML 注入与消息协议桥，用于扩展端与前端通信。

## 目录与关键文件
- `src/webview/InterviewTrainerWebviewViewProvider.ts`：Webview 视图提供者
- `src/webview/WebviewProtocol.ts`：消息协议与请求响应封装

## 关键调用链
- `src/extension.ts` → `InterviewTrainerWebviewViewProvider`
- `webview/src/messenger.ts` ↔ `WebviewProtocol`（request/response）

## 注意事项
- 必须在 webview 实例可用后才能发送消息
- `messageId` 存在时按 request/response 处理，否则为广播
