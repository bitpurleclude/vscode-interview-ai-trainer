# 面试训练助手（vscode-interview-ai-trainer）

一个面向结构化面试训练的 VS Code/Windsurf 插件。支持录音或导入音频，自动转写、检索知识库、评分并生成 Markdown 报告。插件内置 `ffmpeg`（随 VSIX 打包），安装后可直接使用，无需额外依赖。

## 主要能力

- 录音 / 导入：系统麦克风录音，或导入常见音频格式（自动转 16k 单声道 PCM）。
- 题干管理：粘贴题干材料或小题列表，支持导入 txt/md；开始分析时自动拆题，也可手动点击“识别题目”。
- 多题分段：当题目>1 时，自动进行多题分段与对齐，展示单题用时与回答文本。
- 评分与报告：声学指标 + 转写文本 + 评分与改写建议，输出 Markdown 报告。
- 答题提纲：输出“你的回答/示范答案”的提纲，采用 Markdown 列表缩进（无箭头符号）。
- 检索与知识库：可配置检索目录（笔记、题库、评分标准、知识点、示范答案）。
- 缓存与诊断：清理向量缓存/语料索引，查看缓存目录与并发参数。

## 安装

1. 打包产物：`interview-trainer/build/interview-trainer.vsix`
2. VS Code/Windsurf 执行 “Extensions: Install from VSIX...” 选择该文件，或使用命令：
   ```bash
   code --install-extension ./interview-trainer/build/interview-trainer.vsix --force
   ```

## 快速开始

1. 打开左侧视图 “面试训练助手”。
2. 填写题干：
   - 直接粘贴题干材料或小题列表；
   - 或导入题干文件（txt/md），分析时自动拆题。
3. 录音或导入音频：
   - 点击“开始录音/停止录音”；
   - 或导入音频文件（自动转码）。
4. 点击“开始分析”，等待流程完成。
5. 在结果页查看转写、评价、提纲与报告；点击“保存结果”打开报告文件。

## 分析流程（状态展示）

开始分析后会逐步显示进度：
- 题目解析
- 语音转写
- 声学分析
- 多题分段（仅多题）
- 笔记学习（语料扫描与检索）
- 面试评价
- 结果生成 / 文件写入

## 结果与输出

默认输出目录：`<工作区>/sessions/YYYYMMDD/<topic-slug>/`

- `attempt-XX-*.wav`：录音文件
- `*.md`：总报告（含转写/评价/提纲/示范）
- `reference_notes.md`：引用笔记与可参考素材（同题共享，避免重复）
- `attempts.json`：每次作答结构化记录
- `meta.json`：题目元信息（题干、小题、摘要、评分等）

## 设置详解（设置页）

### 1) 提供者配置
- 每个 Provider 独立 YAML 文件，可包含 LLM / Embedding / ASR 配置。
- 设置页可快速添加 Provider，并打开配置文件。

### 2) 通用配置
- 环境（prod/test/dev 等）：可直接输入新环境名称并保存。
- 当前使用的 LLM/ASR Provider、保存目录。
- “保存接口配置 / 重载配置 / 查看配置文件”。

### 3) LLM（评分/问答）
- Provider / Model / Base URL / API Key
- 温度 / TopP / 超时 / 重试
- “测试 LLM 接口”

### 4) ASR（语音转写）
- Provider / Base URL / API Key / Secret
- 语言 / dev_pid
- 分片时长 / 并发 / 超时 / 重试
- Mock 文本（仅 provider=mock 时使用）
- “测试 ASR 接口”

### 5) 评分提示词 & 示范答案提示词
- 评分提示词：控制评分规则与输出格式
- 示范提示词：控制示范答案结构与时长
- 提纲输出使用 Markdown 列表缩进（无需箭头符号）

### 6) 输入设备
- 刷新/选择麦克风输入设备
- 可通过环境变量 `IT_FFMPEG_INPUT=audio=设备名` 手动指定输入

### 7) 检索配置（知识库）
- 启用检索 / 模式（向量语义或词面匹配）
- TopK / MinScore
- Embedding Provider/Model/Base URL/API Key/超时/重试/批大小/Query 上限
- “测试 Embedding 接口 / 清理向量缓存 / 清理语料索引缓存”
- 显示语料缓存/向量缓存路径、缓存上限、并发、Query 缓存大小
- 选择保存目录 & 知识库目录

## 默认知识库目录结构

工作区默认目录如下（可在设置页修改）：

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
  - `api_config.yaml`：LLM/ASR 等接口配置
  - `skill_config.yaml`：检索与目录结构配置
  - `app_config.yaml`：UI/流程参数
  - `providers/*.yaml`：Provider 模板与配置

设置页点击“查看配置文件”可直接打开配置文件。

## 构建与打包

```bash
cd interview-trainer
npm install
npm run build    # 构建 webview + extension
npm run package  # 生成 VSIX: build/interview-trainer.vsix
```

## 常见问题

- 录音无设备：在设置页刷新输入设备；检查系统麦克风权限。
- 导入音频失败：确认音频格式可被 ffmpeg 识别；必要时先转 WAV(16kHz 单声道)。
- 转写/评分报错：检查 API Key、网络和 Base URL。
- 检索慢：向量检索会调用 embedding 接口；可调小 Query 上限或降低 TopK。

更多细节见 `docs/`。
