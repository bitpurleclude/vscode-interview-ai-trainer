# 插件缺陷修复规划（BUGFIX_PLAN）

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
