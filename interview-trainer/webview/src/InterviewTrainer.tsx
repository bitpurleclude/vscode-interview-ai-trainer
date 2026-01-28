import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItHistoryItem,
  ItState,
  ItStepState,
} from "./types";
import { on, request } from "./messenger";
import "./styles.css";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";

const STEP_LABELS: Record<string, string> = {
  init: "初始化",
  recording: "录音中",
  acoustic: "声学分析",
  asr: "语音转写",
  notes: "笔记学习",
  evaluation: "面试评价",
  report: "结果生成",
  write: "文件写入",
};

function it_formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function it_decodeToPcm16(
  arrayBuffer: ArrayBuffer,
  targetRate: number,
): Promise<{ pcm: Int16Array; durationSec: number; sampleRate: number }> {
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const channelData = decoded.getChannelData(0);
  const sourceRate = decoded.sampleRate;
  const ratio = sourceRate / targetRate;
  const length = Math.floor(channelData.length / ratio);
  const resampled = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(channelData.length - 1, left + 1);
    const interp = pos - left;
    resampled[i] =
      channelData[left] * (1 - interp) + channelData[right] * interp;
  }
  const pcm = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i += 1) {
    pcm[i] = Math.max(-1, Math.min(1, resampled[i])) * 32767;
  }
  return {
    pcm,
    durationSec: resampled.length / targetRate,
    sampleRate: targetRate,
  };
}

function it_pcmToBase64(pcm: Int16Array): string {
  const buffer = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < buffer.length; i += 1) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function it_bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function it_extractQuestions(raw: string): { prompt: string; questions: string[] } {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  const marker = /第\s*[一二三四五六七八九十0-9]+\s*[题问][：:]/g;
  const matches = Array.from(text.matchAll(marker));
  if (!matches.length) {
    return { prompt: text, questions: [] };
  }
  const firstIdx = matches[0].index ?? 0;
  const prompt = text.slice(0, firstIdx).trim();
  const questions: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index ?? text.length : text.length;
    const chunk = text.slice(start, end).trim();
    const cleaned = chunk
      .split(/解析[:：]|答案[:：]|建议[:：]|参考[:：]|点评[:：]/)[0]
      .trim();
    if (cleaned) {
      questions.push(cleaned);
    }
  }
  return { prompt, questions };
}

async function it_parseQuestionsRemote(
  text: string,
): Promise<{ prompt: string; questions: string[]; source: string } | null> {
  try {
    const resp = await request("it/parseQuestions", { text });
    if (resp?.status === "success" && resp.content) {
      const material = String(resp.content.material || "").trim();
      const questions = Array.isArray(resp.content.questions)
        ? resp.content.questions.map((item: any) => String(item)).filter(Boolean)
        : [];
      if (material || questions.length) {
        return {
          prompt: material,
          questions,
          source: String(resp.content.source || "unknown"),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

const DEFAULT_STATE: ItState = {
  statusMessage: "等待开始面试训练",
  overallProgress: 0,
  recordingState: "idle",
  steps: [
    { id: "init", status: "success", progress: 100 },
    { id: "recording", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ],
};

const InterviewTrainer: React.FC = () => {
  const [itState, setItState] = useState<ItState>(DEFAULT_STATE);
  const [config, setConfig] = useState<ItConfigSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("transcript");
  const [questionText, setQuestionText] = useState("");
  const [questionList, setQuestionList] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ItAnalyzeResponse | null>(
    null,
  );
  const [historyItems, setHistoryItems] = useState<ItHistoryItem[]>([]);
  const [audioPayload, setAudioPayload] =
    useState<ItAnalyzeRequest["audio"] | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [questionError, setQuestionError] = useState(false);
  const [micDiagnostic, setMicDiagnostic] = useState<{
    status: "idle" | "running" | "done" | "error";
    permissionState?: string;
    audioInputCount?: number;
    audioInputs?: Array<{ label: string; deviceId: string }>;
    error?: string;
    updatedAt?: string;
  }>({ status: "idle" });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const uiLocked = !config;

  useEffect(() => {
    (window as any).__itReady = true;
    request("it/getState", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setItState(resp.content);
      }
    });
    request("it/getConfig", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
      } else {
        // fallback to unlock UI even if后端出错
        setConfig({
          activeEnvironment: "prod",
          llmProvider: "baidu_qianfan",
          asrProvider: "baidu_vop",
          acousticProvider: "api",
          sessionsDir: "sessions",
          retrievalEnabled: true,
          workspaceDirs: {
            notesDir: "inputs/notes",
            promptsDir: "inputs/prompts/guangdong",
            rubricsDir: "inputs/rubrics",
            knowledgeDir: "inputs/knowledge",
            examplesDir: "inputs/examples",
          },
        });
        setItState((prev) => ({
          ...prev,
          statusMessage: "配置加载失败，已使用默认配置",
        }));
      }
    });
  }, []);

  useEffect(() => {
    const disposeState = on("it/stateUpdate", (data) => {
      setItState(data);
    });
    const disposeConfig = on("it/configUpdate", (data) => {
      setConfig(data);
    });
    return () => {
      disposeState();
      disposeConfig();
    };
  }, []);

  const thinkingVisible = useMemo(() => {
    return itState.steps.some(
      (step) =>
        step.status === "running" &&
        ["acoustic", "asr", "notes", "evaluation"].includes(step.id),
    );
  }, [itState]);

  const parsedQuestionList = useMemo(
    () =>
      questionList
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [questionList],
  );
  const retrievalDirs = useMemo(() => {
    if (!config) {
      return [];
    }
    return [
      { key: "notes", label: "笔记", value: config.workspaceDirs.notesDir },
      { key: "prompts", label: "题干材料", value: config.workspaceDirs.promptsDir },
      { key: "rubrics", label: "评分标准", value: config.workspaceDirs.rubricsDir },
      { key: "knowledge", label: "知识库", value: config.workspaceDirs.knowledgeDir },
      { key: "examples", label: "示例答案", value: config.workspaceDirs.examplesDir },
    ];
  }, [config]);
  const hasQuestion = useMemo(
    () => questionText.trim().length > 0 || parsedQuestionList.length > 0,
    [questionText, parsedQuestionList],
  );

  useEffect(() => {
    if (questionError && hasQuestion) {
      setQuestionError(false);
    }
  }, [questionError, hasQuestion]);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await it_decodeToPcm16(arrayBuffer, 16000);
        setAudioPayload({
          format: "pcm",
          sampleRate: decoded.sampleRate,
          byteLength: decoded.pcm.length * 2,
          durationSec: decoded.durationSec,
          base64: it_pcmToBase64(decoded.pcm),
        });
        setRecordingTime(0);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setItState((prev) => ({
        ...prev,
        recordingState: "recording",
        statusMessage: "录音中...",
        lastError: undefined,
      }));
      const interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      recorder.addEventListener("stop", () => clearInterval(interval));
    } catch (err) {
      const errorName =
        err instanceof DOMException ? err.name : err instanceof Error ? err.name : "";
      let reason = "录音启动失败";
      let solution = "请检查麦克风权限或设备状态。";
      let errorType = "recording_error";
      if (["NotAllowedError", "SecurityError"].includes(errorName)) {
        reason = "麦克风权限被拒绝";
        solution = "请在系统设置与 IDE 权限中允许访问麦克风。";
        errorType = "recording_permission";
      } else if (errorName === "NotFoundError") {
        reason = "未检测到麦克风设备";
        solution = "请连接麦克风或检查设备是否被禁用。";
        errorType = "recording_device";
      } else if (errorName === "NotReadableError") {
        reason = "麦克风被占用或无法读取";
        solution = "请关闭其他占用麦克风的应用后重试。";
        errorType = "recording_busy";
      }
      setItState((prev) => ({
        ...prev,
        statusMessage: `${reason}（${solution}）`,
        lastError: {
          type: errorType,
          reason,
          solution,
        },
      }));
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    const nextMessage = hasQuestion
      ? "录音结束，可开始分析。"
      : "录音结束，请先填写题干或导入题干文件。";
    setItState((prev) => ({
      ...prev,
      recordingState: "idle",
      statusMessage: nextMessage,
    }));
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
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
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
          base64: it_pcmToBase64(pcm),
        });

        setItState((prev) => ({
          ...prev,
          statusMessage: `已导入音频：${file.name}（${rendered.duration.toFixed(1)}s）${hasQuestion ? '' : '，请先填写题干或导入题干文件'}`,
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
          base64: it_bytesToBase64(bytes),
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
          statusMessage: `已导入音频：${file.name}（${durationSec.toFixed(1)}s）${hasQuestion ? '' : '，请先填写题干或导入题干文件'}`,
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

  const handleImportQuestions = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let recognizedInfo = "";
      const remote = await it_parseQuestionsRemote(text);
      if (remote && remote.questions.length) {
        setQuestionList(remote.questions.join("\n"));
        setQuestionText(remote.prompt || "");
        recognizedInfo = `，已识别${remote.questions.length}题（${remote.source}）`;
      } else {
        const parsed = it_extractQuestions(text);
        if (parsed.questions.length) {
          setQuestionList(parsed.questions.join("\n"));
          setQuestionText(parsed.prompt || "");
        } else {
          const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const looksLikeList =
            lines.length > 1 && lines.every((line) => line.length <= 80);
          if (looksLikeList) {
            setQuestionList(lines.join("\n"));
            setQuestionText("");
          } else {
            setQuestionText(text.trim());
            setQuestionList("");
          }
        }
      }
      setQuestionError(false);
      setItState((prev) => ({
        ...prev,
        statusMessage: `已导入题干：${file.name}${recognizedInfo}`,
      }));
    } catch (err) {
      setItState((prev) => ({
        ...prev,
        statusMessage: "题干文件读取失败，请检查文件编码或格式。",
        lastError: {
          type: "question",
          reason: err instanceof Error ? err.message : String(err),
          solution: "请使用 UTF-8 编码的 txt 或 md 文件重试。",
        },
      }));
    } finally {
      event.target.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!audioPayload) return;
    if (!hasQuestion) {
      setQuestionError(true);
      setItState((prev) => ({
        ...prev,
        statusMessage: "请先填写题干或导入题干文件后再分析。",
        lastError: {
          type: "question",
          reason: "题干信息缺失",
          solution: "请输入题干文本或导入 txt/md 文件。",
        },
      }));
      return;
    }
    setIsProcessing(true);
    setItState((prev) => ({
      ...prev,
      statusMessage: "已发起分析请求，处理中...",
    }));
    let finalQuestionText = questionText.trim();
    let finalQuestionList = parsedQuestionList;
    if (!finalQuestionList.length && finalQuestionText) {
      const remote = await it_parseQuestionsRemote(finalQuestionText);
      if (remote && remote.questions.length) {
        finalQuestionText = remote.prompt || finalQuestionText;
        finalQuestionList = remote.questions;
        setQuestionList(remote.questions.join("\n"));
        setQuestionText(remote.prompt || "");
      } else {
        const parsed = it_extractQuestions(finalQuestionText);
        if (parsed.questions.length) {
          finalQuestionText = parsed.prompt || finalQuestionText;
          finalQuestionList = parsed.questions;
          setQuestionList(parsed.questions.join("\n"));
          setQuestionText(parsed.prompt || "");
        }
      }
    }
    if (!finalQuestionList.length) {
      setQuestionError(true);
      setItState((prev) => ({
        ...prev,
        statusMessage: "未识别到题目，请检查题干格式或手动拆分。",
        lastError: {
          type: "question",
          reason: "题目识别失败",
          solution: "请在题干中包含“第N题/第N问”，或手动将题目逐行填写。",
        },
      }));
      setIsProcessing(false);
      return;
    }
    const payload: ItAnalyzeRequest = {
      audio: audioPayload,
      questionText: finalQuestionText || undefined,
      questionList: finalQuestionList,
    };
    try {
      const response = await request("it/analyzeAudio", payload);
      if (response?.status === "success") {
        setAnalysisResult(response.content);
        setActiveTab("evaluation");
      } else {
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析失败，请检查配置或网络",
        }));
      }
    } catch (err) {
      setItState((prev) => ({
        ...prev,
        statusMessage: "分析请求失败",
        lastError: {
          type: "analysis",
          reason: err instanceof Error ? err.message : String(err),
          solution: "请检查网络与配置后重试。",
        },
      }));
    }
    setIsProcessing(false);
  };

  const handleOpenReport = async () => {
    if (!analysisResult?.reportPath) return;
    await request("openFile", { path: analysisResult.reportPath });
  };

  const handleLoadHistory = useCallback(async () => {
    const response = await request("it/listHistory", { limit: 30 });
    if (response?.status === "success") {
      setHistoryItems(response.content ?? []);
      setActiveTab("history");
    }
  }, []);
  const handleToggleRetrieval = async (enabled: boolean) => {
    await request("it/setRetrievalEnabled", { enabled });
  };
  const handleSelectWorkspaceDir = async (kind: string) => {
    await request("it/selectWorkspaceDir", { kind });
  };
  const handleMicDiagnostic = async () => {
    setMicDiagnostic({ status: "running" });
    try {
      let permissionState = "unknown";
      if (navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          permissionState = status.state || "unknown";
        } catch {
          permissionState = "unknown";
        }
      }

      let audioInputs: Array<{ label: string; deviceId: string }> = [];
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device) => ({
            label: device.label || "（未授权时不可见设备名称）",
            deviceId: device.deviceId,
          }));
      }

      setMicDiagnostic({
        status: "done",
        permissionState,
        audioInputCount: audioInputs.length,
        audioInputs,
        updatedAt: new Date().toLocaleString(),
      });
    } catch (err) {
      setMicDiagnostic({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toLocaleString(),
      });
    }
  };
  const handleRequestMicPermission = async () => {
    setMicDiagnostic({ status: "running" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await handleMicDiagnostic();
    } catch (err) {
      setMicDiagnostic({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toLocaleString(),
      });
    }
  };

  const it_formatPermissionState = (state?: string) => {
    switch (state) {
      case "granted":
        return "已授权";
      case "denied":
        return "被拒绝";
      case "prompt":
        return "待确认";
      default:
        return "未知";
    }
  };

  useEffect(() => {
    const disposeHistory = on("it/showHistory", () => {
      void handleLoadHistory();
    });
    const disposeSettings = on("it/showSettings", () => {
      void request("it/openSettings", undefined);
    });
    return () => {
      disposeHistory();
      disposeSettings();
    };
  }, [handleLoadHistory]);

  const renderSteps = (steps: ItStepState[]) => {
    return (
      <div className="it-steps">
        {steps.map((step) => (
          <div key={step.id} className={`it-step it-step--${step.status}`}>
            <div className="it-step__content">
              <div className="it-step__dot" />
              <div className="it-step__label">{STEP_LABELS[step.id]}</div>
            </div>
            {step.message && (
              <div className="it-step__meta">{step.message}</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="it-root">
      <div className="it-header">
        <div className="it-title">面试训练助手</div>
        <div className="it-actions">
          <button
            className="it-button it-button--primary"
            disabled={uiLocked || itState.recordingState === "recording"}
            onClick={handleStartRecording}
          >
            开始录音
          </button>
          <button
            className="it-button it-button--danger"
            disabled={uiLocked || itState.recordingState !== "recording"}
            onClick={handleStopRecording}
          >
            停止录音
          </button>
          <label className="it-button it-button--secondary">
            导入音频
            <input
              type="file"
              accept="audio/*"
              onChange={handleImportAudio}
              disabled={uiLocked}
            />
          </label>
          <label className="it-button it-button--secondary">
            导入题干
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={handleImportQuestions}
              disabled={uiLocked}
            />
          </label>
          <button
            className="it-button"
            disabled={uiLocked || !audioPayload || !hasQuestion || isProcessing || isImporting}
            onClick={handleAnalyze}
          >
            开始分析
          </button>
          <button
            className="it-button"
            disabled={uiLocked}
            onClick={handleOpenReport}
          >
            保存结果
          </button>
          <button
            className="it-button"
            disabled={uiLocked}
            onClick={handleLoadHistory}
          >
            历史记录
          </button>
          <button
            className="it-button"
            disabled={uiLocked}
            onClick={() => request("it/openSettings", undefined)}
          >
            设置
          </button>
        </div>
      </div>

      <div className="it-status">
        <span>{uiLocked ? "界面初始化中..." : itState.statusMessage}</span>
        {itState.recordingState === "recording" && (
          <span className="it-status__timer">
            {it_formatSeconds(recordingTime)}
          </span>
        )}
        {itState.lastError && (
          <span className="it-status__error">{itState.lastError.reason}</span>
        )}
        {itState.lastError?.type === "recording_permission" && (
          <button
            className="it-link-button"
            type="button"
            onClick={() => request("it/openMicSettings", undefined)}
          >
            打开麦克风权限设置
          </button>
        )}
      </div>

      <div className="it-flow">
        <div className="it-flow__left">{renderSteps(itState.steps)}</div>
        <div className="it-flow__right">
          <div className="it-progress">
            <div className="it-progress__label">
              总进度：{Math.round(itState.overallProgress)}%
            </div>
            <div className="it-progress__bar">
              <div
                className="it-progress__fill"
                style={{ width: `${itState.overallProgress}%` }}
              />
            </div>
          </div>
          {audioPayload && (
            <div className="it-audio-summary">
              音频时长：{audioPayload.durationSec.toFixed(1)}s
            </div>
          )}
          {thinkingVisible && (
            <div className="it-thinking">
              <div className="it-thinking__title">正在思考：分析处理中</div>
              <div className="it-thinking__body">
                1. 解析语音特征与转写文本
                <br />
                2. 检索相似笔记与评分标准
                <br />
                3. 生成结构化面试评价
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="it-results">
        <div className="it-tabs">
          <button
            className={`it-tab ${activeTab === "transcript" ? "active" : ""}`}
            onClick={() => setActiveTab("transcript")}
          >
            转录文本
          </button>
          <button
            className={`it-tab ${activeTab === "acoustic" ? "active" : ""}`}
            onClick={() => setActiveTab("acoustic")}
          >
            声学分析
          </button>
          <button
            className={`it-tab ${activeTab === "evaluation" ? "active" : ""}`}
            onClick={() => setActiveTab("evaluation")}
          >
            面试评价
          </button>
          <button
            className={`it-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            历史记录
          </button>
        </div>
        <div className="it-result-panel">
          {!analysisResult && (
            <div className="it-placeholder">等待分析结果...</div>
          )}
          {analysisResult && activeTab === "transcript" && (
            <div className="it-transcript">
              {analysisResult.detailedTranscript ? (
                <>
                  <div className="it-section-title">带时间标注</div>
                  <textarea
                    className="it-textarea it-textarea--tall"
                    value={analysisResult.detailedTranscript}
                    readOnly
                  />
                  <div className="it-section-title">原始转写</div>
                  <textarea
                    className="it-textarea"
                    value={analysisResult.transcript}
                    readOnly
                  />
                </>
              ) : (
                <textarea
                  className="it-textarea"
                  value={analysisResult.transcript}
                  readOnly
                />
              )}
            </div>
          )}
          {analysisResult && activeTab === "acoustic" && (
            <div className="it-metrics">
              <div>时长：{analysisResult.acoustic.durationSec.toFixed(2)}s</div>
              <div>语速：{analysisResult.acoustic.speechRateWpm ?? "-"}</div>
              <div>停顿次数：{analysisResult.acoustic.pauseCount}</div>
              <div>平均停顿：{analysisResult.acoustic.pauseAvgSec}s</div>
              <div>最长停顿：{analysisResult.acoustic.pauseMaxSec}s</div>
              <div>RMS均值：{analysisResult.acoustic.rmsDbMean}dB</div>
              <div>RMS波动：{analysisResult.acoustic.rmsDbStd}dB</div>
              <div>SNR：{analysisResult.acoustic.snrDb ?? "-"}</div>
            </div>
          )}
          {analysisResult && activeTab === "evaluation" && (
            <div className="it-evaluation">
              {analysisResult.questionTimings &&
              analysisResult.questionTimings.length > 0 && (
                <div className="it-question-timings">
                  <div className="it-question-timings__title">
                    题目用时
                  </div>
                  {analysisResult.questionTimings.map((item, idx) => (
                    <div key={`${idx}-${item.question}`} className="it-question-timings__item">
                      <div className="it-question-timings__label">
                        {idx + 1}. {item.question}
                      </div>
                      <div className="it-question-timings__value">
                        {it_formatSeconds(item.durationSec)}
                        {item.note ? ` (${item.note})` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="it-evaluation__summary">
                {analysisResult.evaluation.topicSummary}
              </div>
              <div className="it-evaluation__overall">
                <span>总分</span>
                <span className="it-evaluation__overall-value">
                  {analysisResult.evaluation.overallScore ?? "-"}
                </span>
              </div>
              <div className="it-evaluation__scores">
                {Object.entries(analysisResult.evaluation.scores || {}).map(
                  ([key, value]) => (
                    <div key={key} className="it-score">
                      <span>{key}</span>
                      <span>{value}</span>
                    </div>
                  ),
                )}
              </div>
              <div className="it-evaluation__section">
                <h4>优点</h4>
                <ul>
                  {analysisResult.evaluation.strengths.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="it-evaluation__section">
                <h4>问题</h4>
                <ul>
                  {analysisResult.evaluation.issues.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="it-evaluation__section">
                <h4>改进建议</h4>
                <ul>
                  {analysisResult.evaluation.improvements.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="it-evaluation__section">
                <h4>练习重点</h4>
                <ul>
                  {analysisResult.evaluation.nextFocus.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              {analysisResult.evaluation.revisedAnswers &&
              analysisResult.evaluation.revisedAnswers.length > 0 && (
                <div className="it-evaluation__section">
                  <h4>示范性修改</h4>
                  <div className="it-revised-list">
                    {analysisResult.evaluation.revisedAnswers.map((item, idx) => (
                      <div key={`${idx}-${item.question}`} className="it-revised-item">
                        <div className="it-revised-item__title">
                          {idx + 1}. {item.question}
                        </div>
                        <div className="it-revised-item__block">
                          <span>原回答：</span>
                          <span>{item.original}</span>
                        </div>
                        <div className="it-revised-item__block">
                          <span>示范：</span>
                          <span>{item.revised}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analysisResult.evaluation.prompt && (
                <div className="it-evaluation__section">
                  <h4>示范答题提示词</h4>
                  <textarea
                    className="it-textarea it-textarea--prompt"
                    value={analysisResult.evaluation.prompt}
                    readOnly
                  />
                </div>
              )}
            </div>
          )}
          {activeTab === "history" && (
            <div className="it-history">
              {historyItems.length === 0 ? (
                <div className="it-placeholder">暂无历史记录</div>
              ) : (
                historyItems.map((item) => (
                  <div key={item.reportPath} className="it-history__item">
                    <div>
                      <div className="it-history__title">{item.topicTitle}</div>
                      <div className="it-history__meta">
                        {item.timestamp || "未知时间"}
                      </div>
                    </div>
                    <button
                      className="it-button it-button--secondary"
                      onClick={() => request("openFile", { path: item.reportPath })}
                    >
                      打开报告
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="it-footer">
        <div className="it-config-panel">
          <div className="it-config">
            {config ? (
              <>
                <span>ASR: {config.asrProvider}</span>
                <span>LLM: {config.llmProvider}</span>
                <span>环境: {config.activeEnvironment}</span>
                <span>保存目录: {config.sessionsDir}</span>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked}
                  onClick={() => request("it/selectSessionsDir", undefined)}
                >
                  选择保存目录
                </button>
              </>
            ) : (
              <span>配置加载中...</span>
            )}
          </div>
          <div className="it-retrieval">
            <div className="it-retrieval__header">
              <div className="it-retrieval__title">检索配置</div>
              <label className="it-toggle">
                <input
                  type="checkbox"
                  checked={config?.retrievalEnabled ?? true}
                  disabled={uiLocked}
                  onChange={(event) => handleToggleRetrieval(event.target.checked)}
                />
                <span>启用检索</span>
              </label>
            </div>
            <div className="it-retrieval__list">
              {retrievalDirs.map((item) => (
                <div key={item.key} className="it-retrieval__item">
                  <div className="it-retrieval__label">{item.label}</div>
                  <div className="it-retrieval__path">{item.value}</div>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSelectWorkspaceDir(item.key)}
                  >
                    选择目录
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="it-diagnostic">
            <div className="it-diagnostic__header">
              <div className="it-diagnostic__title">麦克风诊断</div>
              <div className="it-diagnostic__actions">
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || micDiagnostic.status === "running"}
                  onClick={handleRequestMicPermission}
                >
                  一键申请权限
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || micDiagnostic.status === "running"}
                  onClick={handleMicDiagnostic}
                >
                  {micDiagnostic.status === "running" ? "诊断中..." : "开始诊断"}
                </button>
              </div>
            </div>
            {micDiagnostic.status === "idle" && (
              <div className="it-diagnostic__hint">
                点击“开始诊断”查看权限状态与设备列表。
              </div>
            )}
            {(micDiagnostic.status === "done" ||
              micDiagnostic.status === "error") && (
              <div className="it-diagnostic__body">
                {micDiagnostic.status === "error" ? (
                  <div className="it-diagnostic__error">
                    诊断失败：{micDiagnostic.error}
                  </div>
                ) : (
                  <>
                    <div>
                      权限状态：{it_formatPermissionState(micDiagnostic.permissionState)}
                    </div>
                    <div>
                      麦克风设备数：{micDiagnostic.audioInputCount ?? 0}
                    </div>
                    {micDiagnostic.audioInputs?.length ? (
                      <div className="it-diagnostic__devices">
                        {micDiagnostic.audioInputs.map((device, idx) => (
                          <div key={`${device.deviceId}-${idx}`}>
                            {idx + 1}. {device.label}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="it-diagnostic__hint">
                        未检测到麦克风设备或权限不足。
                      </div>
                    )}
                    <div className="it-diagnostic__hint">
                      {micDiagnostic.permissionState === "denied"
                        ? "若权限被拒绝，请确认 VS Code 不是以管理员身份运行，并重启 VS Code。"
                        : "如权限待确认，请点击“开始录音”触发授权弹窗。"}
                    </div>
                  </>
                )}
                <div className="it-diagnostic__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    onClick={() => request("it/openMicSettings", undefined)}
                  >
                    打开系统麦克风设置
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    onClick={() => request("it/reloadWindow", undefined)}
                  >
                    重启 VS Code
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="it-question">
          <textarea
            className={`it-textarea it-textarea--question${questionError ? " it-input--error" : ""}`}
            placeholder="题干材料（可选）"
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
          />
          <textarea
            className={`it-textarea it-textarea--questions${questionError ? " it-input--error" : ""}`}
            placeholder="小题列表（一行一个，可选）"
            value={questionList}
            onChange={(event) => setQuestionList(event.target.value)}
          />
          <div className="it-question__hint">
            题干或小题列表为必填，支持直接粘贴完整材料并自动识别第N题。
          </div>
        </div>
      </div>

    </div>
  );
};

export default InterviewTrainer;
