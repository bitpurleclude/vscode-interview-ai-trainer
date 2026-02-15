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
- 流式正文默认自动跟随到底部；用户手动上滑后暂停自动跟随，并通过“有新内容”按钮恢复。
- `useTemplateBindings` 负责密钥保存/删除的请求与错误提示透传；删除确认由组件层处理。
