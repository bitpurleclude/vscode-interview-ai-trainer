import { useEffect, useRef, useState } from "react";
import { request } from "../messenger";
import type { ItAnalyzeRequest, ItState } from "../types";
import { bytesToBase64, pcmToBase64 } from "../utils/audio";

type UseAudioCaptureOptions = {
  selectedInput: string;
  hasQuestion: boolean;
  setItState: React.Dispatch<React.SetStateAction<ItState>>;
};

export function useAudioCapture({
  selectedInput,
  hasQuestion,
  setItState,
}: UseAudioCaptureOptions) {
  const [audioPayload, setAudioPayload] =
    useState<ItAnalyzeRequest["audio"] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingSession, setRecordingSession] = useState<{ startedAt: number | null }>({
    startedAt: null,
  });
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  const handleStartRecording = async () => {
    if (recordingSession.startedAt) return;
    try {
      const resp = await request("it/startNativeRecording", {
        device: selectedInput || undefined,
      });
      if (resp?.status === "success" && resp.content) {
        const startedAt = resp.content.startedAt || Date.now();
        setRecordingSession({ startedAt });
        setRecordingTime(0);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
        recordingTimerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } else {
        throw new Error(resp?.error || "无法启动录音");
      }
      setItState((prev) => ({
        ...prev,
        recordingState: "recording",
        statusMessage: "正在录音（系统麦克风）...",
        lastError: undefined,
      }));
    } catch (err) {
      setItState((prev) => ({
        ...prev,
        statusMessage: `录音启动失败：${err instanceof Error ? err.message : String(err)}`,
        lastError: {
          type: "recording_error",
          reason: err instanceof Error ? err.message : String(err),
          solution:
            "请确认 ffmpeg 可执行，并检查系统麦克风权限。若 Windows 默认设备不可用，可在系统“声音-输入”查看设备名称，设置 IT_FFMPEG_INPUT=audio=设备全名 后重试。",
        },
      }));
    }
  };

  const handleStopRecording = () => {
    if (!recordingSession.startedAt) return;
    request("it/stopNativeRecording", undefined)
      .then((resp) => {
        if (resp?.status === "success" && resp.content?.audio) {
          const audio = resp.content.audio;
          setAudioPayload(audio);
          setRecordingTime(0);
          setRecordingSession({ startedAt: null });
          const nextMessage = hasQuestion
            ? "录音结束，可开始分析。"
            : "录音结束，请先填写题干或导入题干文件。";
          setItState((prev) => ({
            ...prev,
            recordingState: "idle",
            statusMessage: nextMessage,
          }));
          return;
        }
        throw new Error(resp?.error || "录音停止失败，录音文件缺失或 ffmpeg 退出异常。");
      })
      .catch((err) => {
        setItState((prev) => ({
          ...prev,
          statusMessage: `录音停止失败：${err instanceof Error ? err.message : String(err)}`,
          lastError: {
            type: "recording_error",
            reason: err instanceof Error ? err.message : String(err),
            solution:
              "请确认 ffmpeg 可执行，并检查系统默认麦克风或 IT_FFMPEG_INPUT 的设备名。必要时重试开始/停止。",
          },
        }));
      })
      .finally(() => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingSession({ startedAt: null });
      });
  };

  const handleImportAudio = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      setItState((prev) => ({
        ...prev,
        statusMessage: `正在导入音频：${file.name}（大文件可能需要一些时间）`,
      }));

      const arrayBuffer = await file.arrayBuffer();

      try {
        // Fast path: decode in WebAudio (works for many WAV/MP3/AAC containers).
        const audioCtx = new AudioContext();
        let decoded!: AudioBuffer;
        try {
          decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        } finally {
          void audioCtx.close();
        }
        const targetRate = 16000;
        const targetLength = Math.ceil(decoded.duration * targetRate);
        const offline = new OfflineAudioContext(1, targetLength, targetRate);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start(0);
        const rendered = await offline.startRendering();

        const channel = rendered.getChannelData(0);
        const pcm = new Int16Array(channel.length);
        for (let i = 0; i < channel.length; i += 1) {
          pcm[i] = Math.max(-1, Math.min(1, channel[i])) * 32767;
        }

        setAudioPayload({
          format: "pcm",
          sampleRate: targetRate,
          byteLength: pcm.length * 2,
          durationSec: rendered.duration,
          base64: pcmToBase64(pcm),
        });

        setItState((prev) => ({
          ...prev,
          statusMessage: `已导入音频：${file.name}（${rendered.duration.toFixed(1)}s）${hasQuestion ? "" : "，请先填写题干或导入题干文件"}`,
        }));
      } catch (decodeErr) {
        // Fallback: ask extension host to convert using ffmpeg (if available).
        setItState((prev) => ({
          ...prev,
          statusMessage: `浏览器无法解码（${file.name}），正在尝试使用本地转换...`,
        }));
        const bytes = new Uint8Array(arrayBuffer);
        const ext = file.name.split(".").pop()?.toLowerCase() || "m4a";
        const resp = await request("it/convertAudioToPcm", {
          filename: file.name,
          ext,
          base64: bytesToBase64(bytes),
        });
        if (resp?.status !== "success" || !resp.content) {
          throw decodeErr;
        }
        const pcmBase64 = String(resp.content.base64 || "");
        const durationSec = Number(resp.content.durationSec || 0);
        const byteLength = Number(resp.content.byteLength || 0);
        setAudioPayload({
          format: "pcm",
          sampleRate: 16000,
          byteLength,
          durationSec,
          base64: pcmBase64,
        });
        setItState((prev) => ({
          ...prev,
          statusMessage: `已导入音频：${file.name}（${durationSec.toFixed(1)}s）${hasQuestion ? "" : "，请先填写题干或导入题干文件"}`,
        }));
      }
    } catch (err) {
      setItState((prev) => ({
        ...prev,
        statusMessage: "导入失败：无法解码该音频格式",
        lastError: {
          type: "import",
          reason: err instanceof Error ? err.message : String(err),
          solution:
            "建议先将音频转为 WAV(16kHz, 单声道) 后再导入；或安装 ffmpeg 后重试。",
        },
      }));
    } finally {
      setIsImporting(false);
      // allow re-selecting the same file
      event.target.value = "";
    }
  };

  return {
    audioPayload,
    isImporting,
    recordingTime,
    handleStartRecording,
    handleStopRecording,
    handleImportAudio,
  };
}
