# 面试训练助手（vscode-interview-ai-trainer）

面试训练助手是一款用于结构化面试训练的 VS Code/Windsurf 插件。支持录音或导入音频，自动转写、检索知识库、评分并生成 Markdown 报告。插件内置 `ffmpeg`（随 VSIX 打包），无需额外安装即可使用。

## 主要能力

- 录音 / 导入：系统麦克风录音，或导入常见音频格式（自动转 16k 单声道 PCM）。
- 题干管理：支持材料/小题列表输入，支持导入 txt/md，分析时自动识别题目。
- 多题分段：多题自动分段与对齐，给出单题用时与答案文本。
- 面试评价：声学指标 + 转写文本 + 评分与改写建议。
- 答题提纲：输出“你的回答/示范答案”提纲，使用 Markdown 缩进层级。
- 知识库检索：可配置笔记、题库、评分标准、知识点、示范答案目录。
- 缓存与诊断：清理向量缓存/语料索引，查看缓存目录与并发参数。

## 安装

1. 生成 VSIX：`interview-trainer/build/interview-trainer.vsix`
2. VS Code/Windsurf 通过 “Extensions: Install from VSIX...” 安装，或使用：
   ```bash
   code --install-extension ./interview-trainer/build/interview-trainer.vsix --force
   ```

## 快速使用

1. 打开侧边栏“面试训练助手”。
2. 填写题干或导入题干文件（txt/md）。
3. 录音或导入音频。
4. 点击“开始分析”，等待完成。
5. 在结果页查看转写、评价、提纲与报告；点击“保存结果”打开报告文件。

## 题干与输入示例

### 题干材料
```
在全民健身理念日益深入人心的当下，各地举办马拉松赛事。请谈谈你的看法。
```

### 小题列表（推荐）
```
1. 你怎么看待马拉松赛事热？
2. 马拉松赛事在组织上存在哪些问题？
3. 你会提出哪些改进建议？
```

### 题干文件格式
- 支持 `.txt` / `.md`
- 可包含“材料 + 小题列表”，分析时自动识别

## 分析流程（状态展示）

开始分析后会逐步显示进度：
- 题目解析
- 语音转写
- 声学分析
- 多题分段（仅多题）
- 笔记学习（语料扫描与检索）
- 面试评价
- 结果生成 / 文件写入

## 输出与文件结构

默认输出目录：`<工作区>/sessions/YYYYMMDD/<topic-slug>/`

- `attempt-XX-*.wav`：录音文件
- `*.md`：总报告（含转写/评价/提纲/示范）
- `reference_notes.md`：引用笔记与可参考素材（同题共享）
- `attempts.json`：每次作答结构化记录
- `meta.json`：题目元信息

### 报告结构示例

```
# 题目标题

## 第1次作答
Timestamp: ...
Audio file: ...
Total duration: ...

### 转写文本
...

### 声学分析
| 指标 | 数值 |
| --- | --- |
| 时长 | ... |
...

### 面试评价
- 总结: ...
- 维度评分:
  - 内容完整性: 6
  - 逻辑清晰度: 5
...

### 示范性修改
1. 题目文本
   - 建议用时: 4分钟
   - 原回答:
     ...
   - 答题提纲（你的回答）:
     - 一、开头
       - ...
   - 示范:
     ...
   - 答题提纲（示范）:
     - 一、开头
       - ...
```

## 设置说明（设置页）

### 1) 提供者配置
- 每个 Provider 独立 YAML 文件，可包含 LLM / Embedding / ASR。
- 可在设置页新增 Provider，并打开配置文件。

### 2) 通用配置
- 环境（prod/test/dev）：可直接输入新环境名称并保存。
- 当前使用的 LLM/ASR Provider、保存目录。

### 3) LLM（评分/问答）
- Provider / Model / Base URL / API Key
- 温度 / TopP / 超时 / 重试
- “测试 LLM 接口”用于验证配置

### 4) ASR（语音转写）
- Provider / Base URL / API Key / Secret
- 语言 / dev_pid
- 分片(s) / 并发 / 超时 / 重试
- Mock 文本（仅 provider=mock 时使用）

### 5) 评分提示词 & 示范答案提示词
- 评分提示词控制评分规则与输出字段
- 示范提示词控制示范答案结构与时长
- 提纲输出使用 Markdown 列表缩进

### 6) 输入设备
- 刷新/选择麦克风输入设备
- 可设置 `IT_FFMPEG_INPUT=audio=设备名` 指定设备

### 7) 检索配置
- 启用检索 / 模式（向量语义或词面匹配）
- TopK / MinScore
- Embedding Provider/Model/Base URL/API Key/超时/重试/批大小/Query 上限
- 可清理向量缓存与语料索引

### 8) 默认知识库目录
```
inputs/notes       # 笔记
inputs/prompts     # 题目或提示语料
inputs/rubrics     # 评分标准
inputs/knowledge   # 知识点
inputs/examples    # 示范/例子
```

## 配置文件位置

- 全局配置目录：`<VS Code 全局存储>/interview_trainer/`
- 主要文件：
  - `api_config.yaml`：LLM/ASR 配置
  - `skill_config.yaml`：检索与目录配置
  - `app_config.yaml`：UI/流程参数
  - `providers/*.yaml`：Provider 配置

设置页点击“查看配置文件”可直接打开。

## 性能优化建议

- 语料大导致检索慢：精简 `inputs/*` 目录。
- 向量检索慢：降低 TopK、缩短 Query 上限；或改用词面匹配。
- 转写慢：提高 ASR 并发，缩短分片时长。
- 长音频建议分段录制或分段导入。

## 常见问题

- 录音无设备：刷新输入设备，检查系统麦克风权限。
- 导入音频失败：确认格式可被 ffmpeg 识别，必要时先转 WAV(16kHz 单声道)。
- 转写/评分报错：检查 API Key、网络、Base URL。
- 检索慢/无结果：检查知识库目录内容与 embedding 配置。

## 构建与打包

```bash
cd interview-trainer
npm install
npm run build
npm run package
```

## 兼容性

- 基于 VS Code Extension API，理论上支持 VS Code 内核 IDE（Windsurf、Cursor、VSCodium 等）。
- 需要支持 Webview 与侧边栏视图。

更多细节见 `docs/`。
