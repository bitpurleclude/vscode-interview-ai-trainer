# 前端组件（frontend-components）

## 模块定位与职责
包含 Practice 与 Settings 页面 UI 组件，负责展示分析状态、实时输出与配置管理。

## 目录与关键文件
- `webview/src/components/practice/PracticeFlow.tsx`：练习页主布局
- `webview/src/components/practice/StepsList.tsx`：状态区与实时输出
- `webview/src/components/practice/ResultsPanel.tsx`：转写/声学/评价/历史结果面板
- `webview/src/components/settings/*`：模板配置、绑定与测试
- `webview/src/components/StreamCard.tsx`：通用实时输出卡片

## 关键调用链
- `InterviewTrainer.tsx` → `PracticeFlow` → `StepsList`/`ResultsPanel`
- `Settings` 系列组件 → `messenger.request()` → 后端 handlers

## 注意事项
- 状态区布局依赖步骤顺序，修改步骤需同步 `StepsList.tsx`
- 实时输出仅展示截断内容，完整内容需看日志/结果面板

## 常见问题
- 实时输出列数异常：检查 `StepsList.tsx` 的 stream index 合并逻辑
