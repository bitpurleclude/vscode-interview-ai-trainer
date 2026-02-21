# 插件缺陷修复规划（BUGFIX_PLAN）

## Document Metadata
- Document Type: `Fix Plan`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/interviewTrainer/application/useCases/`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/`
  - `interview-trainer/webview/src/components/settings/`
  - `interview-trainer/src/protocol/interviewTrainer.ts`
  - `interview-trainer/webview/src/types.ts`

## Scope and Non-goals
- Scope:
  - 修复设置页 ASR 配置与模板绑定契约相关缺陷。
  - 修复保存结果命名、目录归档、标题回退与日志观测问题。
  - 修复发布展示相关编码问题（UTF-8 无 BOM）。
- Non-goals:
  - 不重构整套设置页架构与模板引擎实现。
  - 不在本计划中引入新的外部依赖或发布流程变更。

## Task Matrix (Summary)
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| B1 | P0 | In Progress | ASR 设置页精简并保持模板化字段契约 | 设置页字段与 `api_config.yaml` 写入一致 |
| B2 | P0 | In Progress | 修复保存命名与相似度分目录逻辑 | 保存结果可稳定写入正确 topic 目录 |
| B3 | P1 | In Progress | 新增/对齐 `llm.title` 模板绑定与回退日志 | 文件命名优先模板，回退时有可追踪日志 |
| B4 | P1 | In Progress | 修复 package 展示乱码与文档同步 | VSIX 页面中文显示正常且文档一致 |

## Verification
- Commands:
  - `npm run build`
  - `npm run test`
  - `npm run package`
- Evidence:
  - 设置页保存后配置落盘正确，重启后可回显。
  - 手动保存结果路径与命名符合期望，不出现错误目录归档。
  - 发布包中文字段显示正常，无乱码。

## Risks and Rollback
- Risks:
  - 保存路径与标题逻辑变更可能影响历史会话目录关联。
  - 模板绑定新增项处理不完整时可能出现前后端字段不一致。
- Rollback:
  - 保存逻辑可按 use-case 层逐文件回滚。
  - `llm.title` 绑定可降级为旧回退链路，保持行为可用。

## Progress Log
- `2026-02`: 计划建立并推进 ASR/保存结果/模板命名相关修复。
- `2026-02-21`: 文档规范化，补齐任务矩阵与验证口径。

## Legacy Detailed Plan
> 以下内容保留历史详细规划与执行细节。

## 背景与目标
- 解决设置页 ASR 配置缺失、保存结果命名/分目录失效、插件名称乱码等问题。
- ASR 设置页仅保留模板化所需字段，减少与模板配置的重复。
- 保存结果时恢复命名逻辑与题目相似度分目录规则。
- 修复 VSIX 显示名称乱码（package.json 编码问题）。
- 新增“LLM 文件命名模板绑定”，避免标题退回前几个字，并在日志开关开启时输出回退日志。

## 规划内容

### 1) ASR 设置页（精简版，模板化）
**目标：** 类似检索配置页，仅保留必要配置项。
**UI 示意：**
```
┌──────────────────────────────────────────────┐
│ ASR 设置（模板化参数）                        │
├──────────────────────────────────────────────┤
│ 语言: [zh ▼]   dev_pid: [1537]               │
│ 分片上限(s): [50]  并发: [1]                 │
│ 超时(s): [120]  重试: [2]                    │
│ Mock 文本: [可选，调试用…]                   │
│                      [保存]                  │
└──────────────────────────────────────────────┘
```

**字段说明：**
- `language`
- `dev_pid`
- `max_chunk_sec`
- `max_concurrency`
- `timeout_sec`
- `max_retries`
- `mock_text`

**后端落盘：** 写入 `config/api_config.yaml` 当前环境的 `asr` 节点。

### 2) 模板可引用变量补齐（仅远端必需字段）
**目标：** ASR 远端请求需要的配置可被模板引用。
**新增/确认：**
- `asr.lang`
- `asr.dev_pid`
- 保留音频变量：`audioFile`、`audio.format`、`audio.sampleRate`、`audio.channel`、`audio.byteLength`

> 本地控制字段（`max_chunk_sec/max_concurrency/timeout_sec/max_retries/mock_text`）不加入可引用变量目录。

### 3) 保存结果命名/分目录逻辑恢复
**问题：** 手动保存结果仅复用 `response.reportPath`，未走命名与相似度分目录逻辑。
**修复：**
- 保存时重新调用：
  - `it_resolveTopicDirAsync`（相似度匹配目录）
  - `it_reportPathForTopicAsync`（文件命名规则）
- 若题干变化或标题为空，使用 `it_deriveTopicTitle/it_sanitizeTopicTitle` 兜底。
- 若分配到新目录，更新 `meta.json` 的 `attempts` 并确保报告写入新路径。

### 4) 插件名称乱码修复
**问题：** `package.json` 非 UTF-8（无 BOM）导致 VSIX 显示乱码。
**修复：**
- 以 UTF-8（无 BOM）重写 `package.json`。
- 保持字段内容不变，仅修复编码与中文显示。

### 5) 文档与工程记录
- 更新 ASR 设置/保存逻辑相关模块文档（前端设置、后端配置处理）。
- 在本计划中标记完成状态。

### 6) LLM 文件命名模板绑定与回退日志（新增）
**目标：** 为文件命名提供独立模板绑定，避免标题退回前几个字；回退时输出日志（仅日志开关开启时）。
**内容：**
- 新增模板绑定：`llm.title`（文件命名/标题生成）。
- 分析流程优先使用 `llm.title` 模板；未绑定时回退现有逻辑（questionParse → evaluation → 兜底）。
- 前端绑定 UI 增加“文件命名/标题”下拉项；模板管理已绑定标记包含 `llm.title`。
- 协议与类型同步：`src/protocol/interviewTrainer.ts`、`webview/src/types.ts`。
- 失败回退时记录日志：仅在日志开关开启时输出（通过 onTrace 体系）。
- 文档补充：在配置与模板绑定说明中新增 `llm.title`。

## 执行顺序
1. ASR 设置 UI + 保存接口
2. 补齐 ASR 模板可引用变量目录
3. 修复保存命名与分目录逻辑
4. 修复 package.json 编码
5. 文档同步
6. 新增 LLM 文件命名模板绑定与回退日志
7. `npm run build` → commit → `npm run package` → 发布 beta

## 验证要点
- 设置页出现 ASR 配置块，保存后生效（重新打开仍保留）。
- ASR 模板可引用 `asr.lang` / `asr.dev_pid` 与音频变量。
- 手动保存结果按题目相似度分目录，且文件命名遵循规则。
- VSIX 插件中文名称与描述显示正常，无乱码。
- 绑定 `llm.title` 后，文件命名标题使用该模板；未绑定时回退旧逻辑。
- 标题生成失败时，只有在日志开关开启时才输出回退日志。

## 执行进度
- [x] ASR 设置页（精简版）+ 保存接口
- [x] ASR 模板可引用变量补齐
- [x] 保存结果命名/分目录逻辑恢复
- [x] package.json 中文显示修复
- [x] 文档同步更新
- [x] LLM 文件命名模板绑定与回退日志
- [x] `npm run build`
- [x] `npm run package`
- [x] Git 发布 beta

## 增补缺陷修复（2026-02）

### A) 检索目录选择写入路径修复 + 旧字段迁移
- 问题：目录选择写入到了 `skill.<xxx_dir>` 顶层，读取使用 `skill.workspace.<xxx_dir>`，导致配置不生效。
- 修复：统一写入 `skill.workspace.<xxx_dir>`；在刷新配置快照时自动迁移旧顶层字段并清理旧键。

### B) 密钥删除确认稳定化 + 失败原因提示
- 问题：删除依赖 `window.confirm`，在 Webview 中交互不稳定，容易表现为“无反应”。
- 修复：改为页面内二次确认按钮（删除 -> 确认删除/取消），并将后端返回错误透传到提示文案。

### C) 密钥/Token 快速引用提示 + 一键复制
- 密钥项新增引用提示：`{{secrets.<name>}}`。
- Token 项新增引用提示：`{{tokens.<name>}}`。
- 两类项均提供“复制引用”按钮，方便在模板中直接粘贴使用。

### 本次涉及文件
- `src/interviewTrainer/interface/handlers/it_webviewWorkspaceHandlers.ts`
- `src/interviewTrainer/application/services/it_configSnapshot.ts`
- `webview/src/hooks/useTemplateBindings.ts`
- `webview/src/components/settings/SettingsTemplateManager.tsx`
- `webview/src/components/settings/template/TemplateSidebar.tsx`
- `webview/src/styles.css`

### 本次验证
- [x] `npm run build`
