# AGENTS.md

本仓库包含 VS Code/Windsurf 插件：面试训练助手（interview-trainer）。本文件为 AI 编码代理提供最小开发指引。

## 关键目录

- `interview-trainer/`：插件主项目
  - `src/`：扩展端逻辑（VS Code Extension）
  - `webview/`：前端 UI（React）
  - `scripts/`：构建脚本
  - `build/`：打包产物
  - `docs/`：架构与模块文档（给 AI/新同学）
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

- 所有写入文件必须使用 UTF-8 编码且不允许 BOM（无 BOM），避免中文乱码。
- 发布 Release 前必须确认文本类文件与发布说明为 UTF-8（README/AGENTS/变更说明），打包与上传 VSIX 时也要确保文件名/说明均为 UTF-8，避免 Release 页面出现乱码。
- 已提供单元测试脚本；如修改核心逻辑，建议至少运行 `npm run build` 与 `npm run test` 验证。
- VSIX 打包产物位于 `interview-trainer/build/`。
- 插件依赖内置 ffmpeg（`ffmpeg-static`），打包时必须包含 `node_modules/ffmpeg-static`，否则录音/转写/音频处理无法正常运行。

## 文档同步要求
- 代码新增/删除/修改后，必须同步更新对应文档（`docs/` 与相关 README）。

## 日志开关与打印规则

- 日志默认关闭，仅在设置页点击“开启日志输出”后开始打印。
- 输出位置：VS Code 输出面板 → 选择 `Interview Trainer`。
- 当前日志范围：语料扫描、向量预计算、检索统计、模板请求/响应 trace（已脱敏）。
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
- `src/interviewTrainer/interface/handlers/it_webviewResultHandlers.ts` → `application/useCases/it_analysisFlow.ts` → `domain/analyze/flow.ts`：分析主流程
- 关键子流程：
  - ASR：`domain/analyze/asr.ts` → `infra/clients/asrClient.ts`
  - 多题分段：`domain/analyze/questions.ts`
  - 检索：`domain/notes/*` → `infra/clients/embeddingClient.ts`
  - 评价：`domain/analyze/evaluation.ts` → `infra/clients/llmClient.ts`
  - 结果写入：`domain/analyze/result.ts` → `infra/storage/*`

### 前端主链路（UI → 消息 → 后端）
- `webview/src/messenger.ts`：request/response 通道
- `src/webview/WebviewProtocol.ts`：后端消息桥
- `webview/src/InterviewTrainer.tsx`：页面主容器
- `webview/src/hooks/useAnalysisFlow.ts`：分析请求/取消/保存
- 实时输出：`application/services/it_logging.ts` → `it/evaluationStreamUpdate` → `webview/src/hooks/useStreaming.ts` → `StepsList/StreamCard`

## 分层架构约束（重构中）

- 目标分层：Interface / Application / Domain / Infra / Protocol
- 依赖方向：Interface → Application → (Domain, Infra)
- Domain 禁止依赖 Infra；Infra 禁止反向调用 Interface
- 目录占位已建立（Phase 0）：
  - `interview-trainer/src/interviewTrainer/interface/`
  - `interview-trainer/src/interviewTrainer/application/`
  - `interview-trainer/src/interviewTrainer/domain/`
  - `interview-trainer/src/interviewTrainer/infra/`
  - `interview-trainer/src/interviewTrainer/protocol/`（占位，主协议仍在 `src/protocol/`）
- 架构与迁移状态：`interview-trainer/docs/architecture/README.md`

## 架构开发规范（放置与转接）

### Interface
- 放置：`src/interviewTrainer/interface/`（handlers/commands/webview）
- 职责：I/O 与编排入口；只做参数校验、消息分发、调用 application
- 转接：Webview 事件 → `interface/handlers/*` → `application/useCases/*` 或 `application/services/*`

### Application
- 放置：`src/interviewTrainer/application/`
- 职责：用例编排、状态管理、跨域协调（调 domain + infra）
- 转接：useCases 组织流程；services 提供跨用例能力（日志/进度/配置快照/Token）

### Domain
- 放置：`src/interviewTrainer/domain/`
- 职责：核心业务规则与算法（纯逻辑）
- 约束：不得直接 I/O；不依赖 infra

### Infra
- 放置：`src/interviewTrainer/infra/`
- 职责：外部依赖实现（API/存储/录音/日志/工具）
- 约束：只对上提供稳定接口，不反向调用 interface

### Protocol
- 放置：`src/protocol/interviewTrainer.ts`（主协议）
- 规则：协议变更需同步 `webview/src/types.ts`

### Webview
- 放置：`webview/src/`（React）
- 规则：UI 与 hook 通过 `webview/src/messenger.ts` 统一通信

### 常见扩展流程
- 新增 Webview 请求：在 `interface/handlers/*` 注册 → `it_webviewHandlers.ts` 汇总 → 前端 `messenger` 调用
- 新增业务流程：在 `application/useCases/*` 组织 → 复用 `domain/*` 与 `infra/*`
- 新增外部 API：在 `infra/api/*` 适配 → 需要时加 `infra/clients/*` 包装
- 新增持久化：在 `infra/storage/*` 实现 → 由 application/useCases 调用
- 新增步骤状态：更新 `application/services/it_progress.ts` 与 `webview/src/constants/defaultState.ts`

### 模板/配置体系
- 默认配置：`config/*.yaml`
- 模板执行：`src/interviewTrainer/infra/api/it_templateExecutor.ts`
- 配置快照：`src/interviewTrainer/application/services/it_configSnapshot.ts`
- 设置页：`webview/src/components/settings/*`

## Guardrails (Upper-Bound Policy)
- Keep all limits, thresholds, concurrency caps, split windows, and character caps in `interview-trainer/config/guardrails.yaml`.
- Do not hardcode upper bounds in business code.
- Parse/clamp guardrails only via `src/interviewTrainer/application/services/it_guardrails.ts`.
- Every guardrail key in YAML must include comments: purpose, unit, trigger behavior, and risk when too large.
- When any guardrail changes, also update architecture/config docs and related tests.

## 模板测试与 Token 库（新增）
- 模板测试入口：设置页 → 模板管理 → dryrun/live 测试
- Token 模板：可在模板配置中定义 token 输出字段（valuePath/expiresInPath 等）
- Token 库：自动刷新/到期时间显示，状态通过日志与 UI 提示

## 架构/模块文档索引
- 总览：`interview-trainer/docs/architecture/ARCHITECTURE_OVERVIEW.md`
- 目录图：`interview-trainer/docs/architecture/DIRECTORY_MAP.md`
- 模块文档：`interview-trainer/docs/modules/*`

## 常见注意事项（AI 维护）
- 改动步骤顺序需同步前端 `webview/src/constants/defaultState.ts` 与后端 `application/services/it_progress.ts`
- 实时输出列数依赖 `it/evaluationStreamUpdate` 的索引；UI 会按“题目列表 + 已到达 stream”合并
- 模板变量与“可引用变量”必须对齐，否则 dryrun 与 live 行为不一致
- Release 流程：**先 beta → 用户测试 → 正式版**（不要跳过）
