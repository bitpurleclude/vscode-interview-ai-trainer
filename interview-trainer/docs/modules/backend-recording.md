# 录音模块（backend-recording）

## 模块目标
- 提供插件端录音设备探测、开始/停止录音、音频转 PCM 能力。
- 保持“Interface 编排 + Application 用例 + Infra 实现”的分层调用。

## 主要文件
- `src/interviewTrainer/interface/handlers/it_webviewRecordingHandlers.ts`：Webview 请求入口与参数转接。
- `src/interviewTrainer/application/useCases/it_recordingActions.ts`：录音用例编排。
- `src/interviewTrainer/application/services/it_recordingGateway.ts`：面向 use-case 的 recording gateway。
- `src/interviewTrainer/infra/recording/it_recording.ts`：ffmpeg 检测、录音子进程、PCM 转码等底层实现。

## 调用链
- `it/listNativeInputs` -> `it_listNativeInputsFromWebview` -> `it_findFfmpeg/it_listInputs`
- `it/startNativeRecording` -> `it_startNativeRecordingFromWebview` -> `it_startNativeRecording`
- `it/stopNativeRecording` -> `it_stopNativeRecordingFromWebview` -> `it_stopNativeRecording`
- `it/convertAudioToPcm` -> `it_convertAudioToPcmFromWebview` -> `it_convertAudioToPcmBase64`

## 注意事项
- 打包 VSIX 时必须包含 `node_modules/ffmpeg-static`。
- PCM 输出要求：16kHz、单声道、`s16le`。
- 录音临时目录清理采用 best-effort，异常情况会回传锁定信息。
