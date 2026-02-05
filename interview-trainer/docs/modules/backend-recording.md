# 录音与音频处理（backend-recording）

## 模块定位与职责
提供录音输入与音频格式转换能力。

## 目录与关键文件
- `src/interviewTrainer/infra/recording/it_recording.ts`：录音设备检测/录音控制
- `src/interviewTrainer/interface/handlers/it_webviewRecordingHandlers.ts`：录音相关 Webview 事件

## 关键调用链
- 前端录音控制 → `it_webviewRecordingHandlers.ts` → `it_recording.ts`

## 注意事项
- 依赖 `ffmpeg-static`，打包时必须包含 `node_modules/ffmpeg-static`
- PCM 转换固定为 16kHz/单声道
