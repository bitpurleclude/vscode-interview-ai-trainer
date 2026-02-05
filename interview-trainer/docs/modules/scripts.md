# 构建脚本（scripts）

## 模块定位与职责
构建 Webview 与 Extension 的打包流程。

## 关键文件
- `scripts/build-webview.js`：构建前端（Vite/打包）
- `scripts/build-extension.js`：构建扩展端产物

## 关键调用链
- `npm run build` → `build-webview.js` → `build-extension.js`
- `npm run package` → `npx @vscode/vsce package`

## 注意事项
- 打包需包含 `node_modules/ffmpeg-static`
- Release 前需确保文本文件 UTF-8
