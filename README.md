# 面试训练助手（vscode-interview-ai-trainer）

一个面向结构化面试训练的 VS Code/Windsurf 插件，支持录音或导入音频，自动转写、检索知识库、评分并生成 Markdown 报告。插件内置 `ffmpeg`，安装后可直接使用，无需额外依赖。

## 主要能力

- 录音 / 导入：支持系统麦克风录音，或导入常见音频格式（自动转 16k PCM）。
- 题干管理：支持粘贴题干列表或导入题干文件（txt/md），自动拆题。
- 评分与报告：声学指标 + 转写文本 + 评分与改写建议，生成 Markdown 报告。
- 检索与知识库：可配置检索目录（笔记、题库、评分标准、示范答案）。
- 诊断与修复：麦克风权限诊断、一键清理 Webview 缓存、切换/刷新输入设备。
- 自定义提示词：评分 System Prompt 可在设置页编辑并即时生效。

## 目录结构

- `interview-trainer/`：VS Code 插件本体
  - `src/`：扩展端逻辑
  - `webview/`：前端 UI（React）
  - `scripts/`：构建脚本
  - `build/`：打包产物（`.vsix`）
- `docs/`：说明文档
- `testdata/`：测试数据

## 安装

1. 已提供打包产物：`interview-trainer/build/interview-trainer.vsix`
2. 在 VS Code/Windsurf 执行 “Extensions: Install from VSIX…” 选择该文件，或使用命令：
   ```bash
   code --install-extension ./interview-trainer/build/interview-trainer.vsix --force
   ```

## 基本使用

1. 打开左侧视图 “面试训练助手”。
2. 在 “练习” 页：
   - 录音：点击“开始录音/停止录音”，完成后可分析。
   - 导入：导入音频或题干文件（txt/md），自动拆题。
   - 分析：点击“开始分析”，触发 ASR + 检索 + 评分，生成报告。
3. 在 “设置” 页：
   - 编辑评分提示词。
   - 选择/刷新输入设备。
   - 配置检索目录（笔记、题库、评分标准、示范答案）。
   - 权限诊断与一键修复。

## 配置与输出

- 配置文件：设置页可打开 `api_config.yaml`（包含 LLM/ASR/声学参数等）。
- 默认输出：`<工作区>/sessions/YYYYMMDD/<topic-slug>/`
  - `attempt-XX-*.wav`：录音
  - `*.md`：报告
  - `attempts.json` / `meta.json`

## 构建与打包

```bash
cd interview-trainer
npm install
npm run build    # 构建 webview + extension
npm run package  # 生成 VSIX: build/interview-trainer.vsix
```

## 常见问题

- 录音失败/无设备：在设置页刷新或切换输入设备，确认 VS Code 非管理员运行并授予麦克风权限。
- 转写/评分报错：检查 `api_config.yaml` 中 ASR/LLM Key，确认网络可用。
- 权限缓存问题：在设置页使用“一键修复权限”，必要时重启 VS Code。

更多细节见 `docs/`。
