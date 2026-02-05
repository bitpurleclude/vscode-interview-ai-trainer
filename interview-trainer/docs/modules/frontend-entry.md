# 前端入口与样式（frontend-entry）

## 模块定位与职责
Webview 前端入口、全局样式与通信封装。

## 关键文件
- `webview/src/main.tsx`：React 渲染入口
- `webview/src/InterviewTrainer.tsx`：页面主容器
- `webview/src/index.css` / `webview/src/styles.css`：全局样式
- `webview/src/messenger.ts`：与扩展端通信

## 关键调用链
- `main.tsx` → `InterviewTrainer.tsx`
- `messenger.request()` ↔ `WebviewProtocol`

## 注意事项
- `styles.css` 影响状态区布局与实时输出滚动
- `messenger` 使用 `messageId` 请求/响应模式
