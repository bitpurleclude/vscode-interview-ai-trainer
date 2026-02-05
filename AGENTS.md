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
- 发布 Release 前必须确认文本类文件与发布说明为 UTF-8（README/AGENTS/变更说明），打包与上传 VSIX 时也要确保文件名/说明均为 UTF-8，避免 Release 页面出现乱码。
- 目前无独立测试脚本；如修改核心逻辑，建议至少运行 `npm run build` 验证。
- VSIX 打包产物位于 `interview-trainer/build/`。
- 插件依赖内置 ffmpeg（`ffmpeg-static`），打包时必须包含 `node_modules/ffmpeg-static`，否则录音/转写/音频处理无法正常运行。

## 日志开关与打印规则

- 日志默认关闭，仅在设置页点击“开启日志输出”后开始打印。
- 输出位置：VS Code 输出面板 → 选择 `Interview Trainer`。
- 当前日志范围：语料扫描、向量预计算、检索统计（笔记学习/检索阶段）。
- 检索统计打印项：语料种类、query 数、query 向量缓存命中/缺失、语料补算数量、耗时。
- 向量缓存读写：打印缓存文件路径与读取/写入条数，用于判断是否读/写成功。
- 关闭 VS Code 后日志开关重置，需要再次手动开启。

## 检索概念说明

- 查询向量：用于检索的 query 文本（题干/答案/转写片段）经过 embedding 得到的向量，用来与语料向量做相似度计算。
- 语料缓存命中不等于向量缓存命中：语料缓存保存的是文本切片与元信息；向量缓存保存的是这些切片的 embedding。语料缓存命中时，如果向量缓存缺失或模型/参数变化，仍会触发向量补算并产生 API 流量。

---

## 架构速览（给 AI/新同学）

### 后端主链路（音频 → 结果）
- `src/extension.ts`：扩展入口，注册 Webview 与命令
- `src/interviewTrainer/InterviewTrainerExtension.ts`：扩展主控制器（配置/状态/日志/录音/分析）
- `src/interviewTrainer/handlers/it_webviewCoreHandlers.ts` → `core/it_analysisFlow.ts` → `core/analyze/flow.ts`：分析主流程
- 关键子流程：
  - ASR：`core/analyze/asr.ts` → `core/clients/asrClient.ts`
  - 多题分段：`core/analyze/questions.ts`
  - 检索：`core/notes/*` → `core/clients/embeddingClient.ts`
  - 评价：`core/it_evaluation.ts` → `core/clients/llmClient.ts`
  - 结果写入：`core/analyze/result.ts` → `storage/*`

### 前端主链路（UI → 消息 → 后端）
- `webview/src/messenger.ts`：request/response 通道
- `src/webview/WebviewProtocol.ts`：后端消息桥
- `webview/src/InterviewTrainer.tsx`：页面主容器
- `webview/src/hooks/useAnalysisFlow.ts`：分析请求/取消/保存
- 实时输出：`core/it_logging.ts` → `it/evaluationStreamUpdate` → `webview/src/hooks/useStreaming.ts` → `StepsList/StreamCard`

### 模板/配置体系
- 默认配置：`config/*.yaml`
- 模板执行：`src/interviewTrainer/api/it_templateExecutor.ts`
- 配置快照：`src/interviewTrainer/core/it_configSnapshot.ts`
- 设置页：`webview/src/components/settings/*`

## 架构/模块文档索引
- 总览：`interview-trainer/docs/architecture/ARCHITECTURE_OVERVIEW.md`
- 目录图：`interview-trainer/docs/architecture/DIRECTORY_MAP.md`
- 模块文档：`interview-trainer/docs/modules/*`

## 常见注意事项（AI 维护）
- 改动步骤顺序需同步前端 `webview/src/constants/defaultState.ts` 与后端 `core/it_progress.ts`
- 实时输出列数依赖 `it/evaluationStreamUpdate` 的索引；UI 会按“题目列表 + 已到达 stream”合并
- 模板变量与“可引用变量”必须对齐，否则 dryrun 与 live 行为不一致
- Release 流程：**先 beta → 用户测试 → 正式版**（不要跳过）
