# 前端 Hooks（frontend-hooks）

## 模块定位与职责
封装前端的数据流、状态派生与与后端通信逻辑。

## 目录与关键文件
- `webview/src/hooks/useAnalysisFlow.ts`：分析流程、请求/取消/保存
- `webview/src/hooks/useStreaming.ts`：实时输出管理
- `webview/src/hooks/useConfigSync.ts`：配置同步与初始化
- `webview/src/hooks/useDerivedViews.ts`：派生视图状态（题目/预览/缓存）
- `webview/src/hooks/useEnvironmentSettings.ts`：环境切换与保存

## 关键调用链
- `InterviewTrainer.tsx` → `useAnalysisFlow` → `messenger.request()`
- `useStreaming` 监听 `it/stepStreamUpdate` 与 `it/evaluationStreamUpdate`

## 注意事项
- `useAnalysisFlow` 依赖 `parsedQuestionList`，务必保持与后端一致
- `useStreaming` 改为块级缓冲裁剪（避免逐字删除导致抖动），并记录已省略前缀字数用于 UI 提示。
- `useStreaming` 额外维护 `evaluationSnapshots`（按题结构化评分快照），由 `it/evaluationStreamUpdate.snapshot` 驱动，供结果区“提纲旁边的本题评分/建议”实时渲染。
- 流式正文默认自动跟随到底部；用户手动上滑后暂停自动跟随，并通过“有新内容”按钮恢复。
- `useTemplateBindings` 负责密钥保存/删除的请求与错误提示透传；删除确认由组件层处理。
- `useAnalysisFlow` 在新一轮分析开始时会先清空上一轮 `analysisResult`，避免重复分析时旧评价残留导致“结果未更新”的错觉。
- `useQuestionInput` 在“已解析”状态下修改题干时会清空旧小题列表，确保下一次分析按新题干重新识别；若题干未改动则继续复用原小题列表。
- `useDerivedViews` 的实时评价题目标题优先级为：`analysisResult.questionList` → `questionTimings`（含 `draftQuestionTimings`）→ 输入框小题列表 → 题干回退拆分，确保实时阶段尽量展示解析/分段后的题目。
