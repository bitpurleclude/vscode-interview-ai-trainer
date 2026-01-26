import React, { useMemo, useRef, useState, useEffect } from "react";
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
      setItState((prev) => ({
        ...prev,
        statusMessage: "录音启动失败：请检查麦克风权限",
        lastError: {
          type: "recording",
          reason: err instanceof Error ? err.message : String(err),
          solution: "请在系统与 IDE 权限中允许麦克风访问。",
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
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const looksLikeList = lines.length > 1 && lines.every((line) => line.length <= 80);

      if (looksLikeList) {
        setQuestionList(lines.join("\n"));
        if (!questionText.trim()) {
          setQuestionText("");
        }
      } else {
        setQuestionText(text.trim());
        setQuestionList("");
      }
      setQuestionError(false);
      setItState((prev) => ({
        ...prev,
        statusMessage: `已导入题干：${file.name}`,
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
    const payload: ItAnalyzeRequest = {
      audio: audioPayload,
      questionText: questionText.trim() || undefined,
      questionList: parsedQuestionList,
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

  const handleLoadHistory = async () => {
    const response = await request("it/listHistory", { limit: 30 });
    if (response?.status === "success") {
      setHistoryItems(response.content ?? []);
      setActiveTab("history");
    }
  };

  const renderSteps = (steps: ItStepState[]) => {
    return (
      <div className="it-steps">
        {steps.map((step) => (
          <div key={step.id} className={`it-step it-step--${step.status}`}>
            <div className="it-step__dot" />
            <div className="it-step__label">{STEP_LABELS[step.id]}</div>
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
                ???{analysisResult.evaluation.overallScore}
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
                <h4>?????</h4>
                <ul>
                  {analysisResult.evaluation.nextFocus.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
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
        <div className="it-config">
          {config ? (
            <>
              <span>ASR: {config.asrProvider}</span>
              <span>LLM: {config.llmProvider}</span>
              <span>环境: {config.activeEnvironment}</span>
            </>
          ) : (
            <span>配置加载中...</span>
          )}
        </div>
        <div className="it-question">
          <input
            className={`it-input${questionError ? " it-input--error" : ""}`}
            placeholder="题干（可选）"
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
          />
          <textarea
            className={`it-textarea it-textarea--small${questionError ? " it-input--error" : ""}`}
            placeholder="小题列表（一行一个，可选）"
            value={questionList}
            onChange={(event) => setQuestionList(event.target.value)}
          />
          <div className="it-question__hint">
            题干或小题列表为必填，可通过“导入题干”快速加载。
          </div>
        </div>
      </div>

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
  );
};

export default InterviewTrainer;
