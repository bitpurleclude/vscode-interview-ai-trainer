# Interview Trainer 拆分计划表

目的：在 `InterviewTrainer.tsx` 过长且部分逻辑缺失的情况下，按步骤拆分并恢复逻辑，保持功能一致并保证可构建。

约束：
- 仅修改 `D:\code\windsurf\vscode-interview-ai-trainer` 工作区内文件。
- 每一步：修改 → `npm run build` → `git commit` → `npm run package`。
- 不处理编码乱码修复（你已确认当前查看无乱码）。

步骤：

1) 默认状态移出（并补齐最小编译依赖）
- 新增 `interview-trainer/webview/src/constants/defaultState.ts` 导出 `DEFAULT_STATE`。
- `InterviewTrainer.tsx` 改为导入使用。
- 若存在阻塞编译的“缺失声明”，在本步补齐最小定义（仅为通过编译，不改变功能）。

2) 题干输入与解析（恢复缺失逻辑）
- 新增 `interview-trainer/webview/src/hooks/useQuestionInput.ts`。
- 收拢题干/小题输入、解析、导入、校验状态与相关事件处理。

3) 模板编辑/保存
- 新增 `interview-trainer/webview/src/hooks/useTemplateEditor.ts`。
- 收拢模板草稿与 JSON 编辑、保存、复制、删除等逻辑。

4) 模板绑定/密钥/参数选项
- 新增 `interview-trainer/webview/src/hooks/useTemplateBindings.ts`。
- 收拢绑定保存、密钥管理、参数选项管理逻辑。

5) 环境与 API 参数保存
- 新增 `interview-trainer/webview/src/hooks/useEnvironmentSettings.ts`。
- 收拢环境切换/创建/删除、LLM/ASR 参数保存、提示词保存、流式设置保存、命名设置保存。

6) 检索设置与缓存
- 新增 `interview-trainer/webview/src/hooks/useRetrievalSettings.ts`。
- 收拢检索配置保存、缓存清理、检索开关相关逻辑。

7) UI 派生数据集中管理
- 新增 `interview-trainer/webview/src/hooks/useDerivedViews.ts`。
- 收拢 `useMemo` 派生数据（模板列表、题目列表、显示状态、缓存统计等）。

8) 接回已拆 hooks
- 在 `InterviewTrainer.tsx` 中统一接回 `useAudioCapture` / `useAnalysisFlow` / 新增 hooks。
- 验证录音、分析、保存、历史加载与设置页面交互。
