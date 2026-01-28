# 面试训练助手（vscode-interview-ai-trainer）

一个面向结构化面试训练的 VS Code/Windsurf 插件，支持录音或导入音频，自动转写、笔记检索、评分与报告生成。插件内置 ffmpeg，可在安装后直接使用，无需额外依赖。

## 主要能力
- 录音/导入：使用系统麦克风录音，或导入常见音频格式（自动转 16k PCM）。
- 题干管理：支持粘贴材料/小题列表，或导入题干文件并自动拆题。
- 评分与报告：声学指标、转写文本、严格评分与示范改写，生成 Markdown 报告。
- 检索与知识库：可启用/关闭检索，并为笔记、题干、评分标准等指定目录。
- 诊断与修复：麦克风权限诊断、一键清理 Webview 权限缓存；可切换/刷新输入设备。
- 自定义提示词：评分 System Prompt 可在设置页直接编辑并立即生效。

## 安装
1. 已提供打包产物：`interview-trainer/build/interview-trainer.vsix`。
2. VS Code/Windsurf 中执行 “Extensions: Install from VSIX...” 选择该文件，或使用命令行：
   ```bash
   code --install-extension ./interview-trainer/build/interview-trainer.vsix --force
   ```

## 基本使用
1. 打开左侧视图 “面试训练助手”。
2. 在“练习”页：
   - 录音：点击“开始录音/停止录音”；需要题干后才可分析。
   - 导入：可导入音频或题干文件（txt/md），自动拆分第 N 题。
   - 分析：点击“开始分析”触发 ASR+检索+评分；“保存结果”打开生成的报告；“历史记录”查看往期。
3. 在“设置”页：
   - 评分提示词：可编辑，空则使用内置严格提示词。
   - 输入设备：选择或刷新系统音频输入。
   - 检索配置：启用/关闭检索，并为笔记、题干、评分标准、知识库、示例答案选择目录。
   - 麦克风诊断：查看权限状态，支持“一键修复权限/申请权限/重启 VS Code”。
   - 通用配置：打开 `api_config.yaml`，选择会话保存目录。

## 配置与输出
- 配置文件：在设置页点击“打开配置文件”即可编辑 `api_config.yaml`（含 LLM/ASR/声学等参数）。
- 默认会话输出：`<工作区>/sessions/YYYYMMDD/<topic-slug>/` 包含录音 `attempt-XX-*.wav`、报告 `*.md`、`attempts.json/meta.json`。

## 开发/构建
```bash
cd interview-trainer
npm install
npm run build      # 仅构建 webview + extension
npm run package    # 构建并生成 VSIX：build/interview-trainer.vsix
```

## 常见问题
- 录音失败/无设备：先在设置页“输入设备”刷新或选择设备，确保 VS Code 非管理员运行并授予麦克风权限。必要时设置环境变量 `IT_FFMPEG_INPUT=audio=设备全名`。
- 转写/评分报错：检查 `api_config.yaml` 中的百度 ASR/千帆模型 Key 是否填写，或网络是否可用。
- 权限缓存导致拒绝：在设置页使用“一键修复权限”，若仍失败请关闭所有 VS Code 窗口后重试。

更多细节可参考 `docs/` 下的使用、配置和开发手册。
