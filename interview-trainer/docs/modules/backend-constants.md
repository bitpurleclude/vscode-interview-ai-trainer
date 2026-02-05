# 常量与默认状态（backend-constants）

## 模块定位与职责
集中维护默认步骤状态、进度权重与测试用样例数据。

## 目录与关键文件
- `src/interviewTrainer/constants/it_sampleAudio.ts`：模板测试用的音频样例（base64/采样率等）
- `src/interviewTrainer/application/services/it_progress.ts`：默认步骤与进度计算

## 关键调用链
- `InterviewTrainerExtension` 初始化 → `it_progress.ts` 生成 steps
- 模板测试 → `it_webviewTestHandlers.ts` 使用 `it_sampleAudio.ts`

## 注意事项
- 步骤顺序会影响前端状态区展示
- 修改步骤需同步前端 `webview/src/constants/defaultState.ts`
