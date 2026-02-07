# 常量与默认状态（backend-constants）

## 模块定位与职责
集中维护默认步骤状态、进度权重与模板测试样例数据。

## 目录与关键文件
- `src/interviewTrainer/application/useCases/it_templateTestSampleAudio.ts`：模板测试用音频样例（base64/采样率等）。
- `src/interviewTrainer/application/services/it_progress.ts`：默认步骤与进度计算。

## 关键调用链
- `InterviewTrainerExtension` 初始化 -> `it_progress.ts` 构建 steps。
- 模板测试 -> `it_templateTestActions.ts` 使用 `it_templateTestSampleAudio.ts` 注入 ASR 测试默认变量。

## 注意事项
- 步骤顺序会影响前端状态区展示。
- 修改步骤需同步前端 `webview/src/constants/defaultState.ts`。
