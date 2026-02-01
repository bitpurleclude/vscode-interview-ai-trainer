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

- 所有写入文件必须使用 UTF-8 编码，避免中文乱码。
- 目前无独立测试脚本；如修改核心逻辑，建议至少运行 `npm run build` 验证。
- VSIX 打包产物位于 `interview-trainer/build/`。
- 插件依赖内置 ffmpeg（`ffmpeg-static`），打包时必须包含 `node_modules/ffmpeg-static`，否则录音/转写/音频处理无法正常运行。

## 日志开关与打印规则

- 日志默认关闭，仅在设置页点击“开启日志输出”后开始打印。
- 输出位置：VS Code 输出面板 → 选择 `Interview Trainer`。
- 当前日志范围：语料扫描、向量预计算、检索统计（笔记学习/检索阶段）。
- 检索统计打印项：语料种类、query 数、query 向量缓存命中/缺失、语料补算数量、耗时。
- 关闭 VS Code 后日志开关重置，需要再次手动开启。

## 检索概念说明

- 查询向量：用于检索的 query 文本（题干/答案/转写片段）经过 embedding 得到的向量，用来与语料向量做相似度计算。
- 语料缓存命中不等于向量缓存命中：语料缓存保存的是文本切片与元信息；向量缓存保存的是这些切片的 embedding。语料缓存命中时，如果向量缓存缺失或模型/参数变化，仍会触发向量补算并产生 API 流量。
