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
- `useStreaming` 仅保留最新截断文本（previewChars）
