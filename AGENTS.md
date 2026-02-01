# AGENTS.md

本仓库包含 VS Code/Windsurf 插件：面试训练助手（interview-trainer）。本文件为 AI 编码代理提供最小开发指引。

## 关键目录

- `interview-trainer/`：插件主项目
  - `src/`：扩展端逻辑（VS Code Extension）
  - `webview/`：前端 UI（React）
  - `scripts/`：构建脚本
  - `build/`：打包产物
- `docs/`：说明文档
- `testdata/`：测试数据

## 常用命令（在 `interview-trainer/` 内执行）

- 安装依赖：`npm install`
- 构建：`npm run build`（构建 webview + extension）
- 打包：`npm run package`（生成 `build/interview-trainer.vsix`）

## 输出与会话

- 报告输出默认目录：`<工作区>/sessions/YYYYMMDD/<topic-slug>/`
- 包含音频、报告和元数据文件

## 说明

- 目前无独立测试脚本；如修改核心逻辑，建议至少运行 `npm run build` 验证。
- VSIX 打包产物位于 `interview-trainer/build/`。
- 插件依赖内置 ffmpeg（`ffmpeg-static`），打包时必须包含 `node_modules/ffmpeg-static`，否则录音/转写/音频处理无法正常运行。
