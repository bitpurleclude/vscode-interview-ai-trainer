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
  question: "题目解析",
  recording: "录音中",
  acoustic: "声学分析",
  asr: "语音转写",
  segment: "多题分段",
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

type ItOutlineNode = {
  text: string;
  children: ItOutlineNode[];
};

const IT_OUTLINE_LEVEL1_PATTERN = /^([一二三四五六七八九十]+|\d+)[、.]/;
const IT_OUTLINE_LEVEL2_PATTERN = /^[（(]([一二三四五六七八九十]+|\d+)[）)]/;
const IT_OUTLINE_MARKER_PATTERN =
  /^(?<indent>\s*)(?:[-*+]\s+|\d+[.)]\s+)(?<text>.+)$/;

function it_extractOutlinePaths(items: string[]): string[][] {
  const paths: string[][] = [];
  let currentLevel1: string | null = null;
  let currentLevel2: string | null = null;
  const stack: Array<{ depth: number; text: string }> = [];
  items.forEach((item) => {
    const rawLine = String(item || "").replace(/\t/g, "  ");
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.includes("->")) {
      const parts = trimmed
        .split("->")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length) {
        stack.length = 0;
        parts.forEach((part, idx) => stack.push({ depth: idx, text: part }));
        currentLevel1 = parts[0] || currentLevel1;
        currentLevel2 = parts.length > 1 ? parts[1] : null;
        paths.push(parts);
      }
      return;
    }
    const markerMatch = rawLine.match(IT_OUTLINE_MARKER_PATTERN);
    if (markerMatch?.groups?.text) {
      const indentRaw = markerMatch.groups.indent || "";
      const indentLen = indentRaw.replace(/\t/g, "  ").length;
      const depth = Math.max(0, Math.floor(indentLen / 2));
      const text = markerMatch.groups.text.trim();
      if (!text) {
        return;
      }
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack.push({ depth, text });
      paths.push(stack.map((node) => node.text));
      currentLevel1 = stack[0]?.text ?? currentLevel1;
      currentLevel2 = stack[1]?.text ?? null;
      return;
    }
    if (IT_OUTLINE_LEVEL1_PATTERN.test(trimmed)) {
      currentLevel1 = trimmed;
      currentLevel2 = null;
      stack.length = 0;
      stack.push({ depth: 0, text: trimmed });
      paths.push([trimmed]);
      return;
    }
    if (IT_OUTLINE_LEVEL2_PATTERN.test(trimmed) && currentLevel1) {
      currentLevel2 = trimmed;
      stack.length = 0;
      stack.push({ depth: 0, text: currentLevel1 });
      stack.push({ depth: 1, text: trimmed });
      paths.push([currentLevel1, trimmed]);
      return;
    }
    if (currentLevel1) {
      if (currentLevel2) {
        paths.push([currentLevel1, currentLevel2, trimmed]);
      } else {
        paths.push([currentLevel1, trimmed]);
      }
      return;
    }
    paths.push([trimmed]);
  });
  return paths;
}

function it_buildOutlineTree(items: string[]): ItOutlineNode[] {
  const roots: ItOutlineNode[] = [];
  const findOrCreate = (list: ItOutlineNode[], text: string): ItOutlineNode => {
    const existing = list.find((node) => node.text === text);
    if (existing) {
      return existing;
    }
    const node = { text, children: [] };
    list.push(node);
    return node;
  };
  const paths = it_extractOutlinePaths(items);
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

function it_renderOutlineTree(nodes: ItOutlineNode[], keyPrefix: string): JSX.Element {
  return (
    <ul>
      {nodes.map((node, idx) => {
        const key = `${keyPrefix}-${idx}`;
        return (
          <li key={key}>
            {node.text}
            {node.children.length ? it_renderOutlineTree(node.children, key) : null}
          </li>
        );
      })}
    </ul>
  );
}

function it_renderParagraphs(text: string, keyPrefix: string): JSX.Element {
  const raw = String(text || "").trim();
  if (!raw) {
    return <span>（空）</span>;
  }
  const parts = raw.split(/\r?\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="it-paragraphs">
      {parts.map((part, idx) => (
        <p key={`${keyPrefix}-${idx}`}>{part}</p>
      ))}
    </div>
  );
}

async function it_decodeToPcm16(
  arrayBuffer: ArrayBuffer,
  targetRate: number,
): Promise<{ pcm: Int16Array; durationSec: number; sampleRate: number }> {
  const audioCtx = new AudioContext();
  try {
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
  } finally {
    void audioCtx.close();
  }
}

function it_pcmToBase64(pcm: Int16Array): string {
  const buffer = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return it_bytesToBase64(buffer);
}

function it_bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
  draftTranscript: undefined,
  draftDetailedTranscript: undefined,
  draftAcoustic: undefined,
  draftNotes: undefined,
  draftQuestionTimings: undefined,
  draftQuestionTimingNote: undefined,
  draftEvaluation: undefined,
  embeddingWarmup: {
    status: "idle",
    progress: 0,
    total: 0,
    done: 0,
  },
  steps: [
    { id: "init", status: "success", progress: 100 },
    { id: "question", status: "pending", progress: 0 },
    { id: "recording", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "segment", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ],
};

const STRICT_SYSTEM_PROMPT = [
  "你是严格、直接的中文面试评审，仅输出 JSON，不要出现英语标签、客套或安慰语。",
  "评分规则（1-10，整数）：10=卓越/完整无明显缺陷；8=良好仅有轻微问题；6=基本达标但有明显缺口；4=不达标；2=严重不足/几乎无有效内容；1=违禁或完全失败。",
  "若语音时长极短、长时间静音或回答缺失，整体与各维度不得高于2，并在 issues 中说明原因。",
  "若未覆盖题干要点、逻辑混乱或无可执行对策，相关维度不高于4。",
  "严禁使用“继续加油”等安慰式措辞，问题描述必须直白、具体、可执行。",
  "若提供检索笔记，必须在 noteUsage/noteSuggestions 中列出可用素材与参考思路（每项至少2条）。",
  "strengths/issues/improvements 至少各3条；nextFocus 至少2条。",
  "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
  "outlineOriginal/outlineRevised 为要点数组或 Markdown 列表文本（每题8-18条），分别对应本题“原回答提纲”与“示范提纲”。",
  "提纲必须是关键词式（避免完整长句），用 Markdown 列表缩进表示层级，至少两级，禁止使用箭头符号。",
  "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
  "每条<=20字。",
  "系统会自动解析 Markdown 列表缩进。",
].join("\n");
const DEFAULT_DEMO_PROMPT = [
  "estimatedTimeMin 按 4/3/3 分配（总≤10 分钟），内容过长需压缩到对应时长。",
  "revised 必须基于原回答重写（禁止照搬原句），结构为 总-分-总 或 问题-原因-对策-预期/风险。",
  "每题至少 2-3 条可执行动作（责任人/时间节点/指标/风险兜底），删除口头禅、问候语、重复表述。",
].join("\n");

const InterviewTrainer: React.FC = () => {
  const [itState, setItState] = useState<ItState>(DEFAULT_STATE);
  const [config, setConfig] = useState<ItConfigSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("transcript");
  const [questionText, setQuestionText] = useState("");
  const [questionList, setQuestionList] = useState("");
  const [questionParsed, setQuestionParsed] = useState(false);
  const [questionParsing, setQuestionParsing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(STRICT_SYSTEM_PROMPT);
  const [demoPrompt, setDemoPrompt] = useState(DEFAULT_DEMO_PROMPT);
  const [answerMode, setAnswerMode] = useState<"single" | "two-step">("two-step");
  const [perQuestionSystemPrompts, setPerQuestionSystemPrompts] = useState<string[]>(
    ["", "", ""],
  );
  const [perQuestionDemoPrompts, setPerQuestionDemoPrompts] = useState<string[]>(
    ["", "", ""],
  );
  const [analysisResult, setAnalysisResult] = useState<ItAnalyzeResponse | null>(
    null,
  );
  const [historyItems, setHistoryItems] = useState<ItHistoryItem[]>([]);
  const [showNoteHits, setShowNoteHits] = useState(false);
  const [showDemoPrompt, setShowDemoPrompt] = useState(false);
  const [showNoteUsage, setShowNoteUsage] = useState(false);
  const [showNoteSuggestions, setShowNoteSuggestions] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [audioPayload, setAudioPayload] =
    useState<ItAnalyzeRequest["audio"] | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [nativeInputs, setNativeInputs] = useState<string[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("");
  const analysisRunRef = useRef(0);
  const analysisCancelledRef = useRef(false);
  const [providerDraft, setProviderDraft] = useState({
    id: "",
    name: "",
  });
  const [apiForm, setApiForm] = useState({
    environment: "prod",
    llmProfiles: {} as Record<string, any>,
    asrProfiles: {} as Record<string, any>,
    llm: {
      provider: "baidu_qianfan",
      baseUrl: "https://qianfan.baidubce.com/v2",
      model: "ernie-4.5-turbo-128k",
      apiKey: "",
      temperature: 0.8,
      topP: 0.8,
      timeoutSec: 60,
      maxRetries: 1,
      antiRepeat: false,
      useResponses: false,
      webSearch: false,
      reasoningEffort: "medium",
      maxOutputTokens: 800,
      reusePrefix: false,
    },
    asr: {
      provider: "baidu_vop",
      baseUrl: "https://vop.baidu.com/server_api",
      apiKey: "",
      secretKey: "",
      language: "zh",
      devPid: 1537,
      mockText: "",
      maxChunkSec: 50,
      maxConcurrency: 1,
      timeoutSec: 120,
      maxRetries: 1,
    },
  });
  const [retrievalForm, setRetrievalForm] = useState({
    mode: "vector",
    topK: 5,
    topKNotes: 5,
    topKKnowledge: 5,
    topKRubrics: 5,
    topKExamples: 5,
    maxConcurrency: 3,
    embeddingMaxConcurrency: 1,
    minScore: 0.2,
    vector: {
      provider: "volc_doubao",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-embedding",
      apiKey: "",
      timeoutSec: 30,
      maxRetries: 1,
      batchSize: 16,
      queryMaxChars: 1500,
    },
  });
  const [savingApiConfig, setSavingApiConfig] = useState(false);
  const [apiSaveMessage, setApiSaveMessage] = useState<string | null>(null);
  const [savingRetrieval, setSavingRetrieval] = useState(false);
  const [retrievalSaveMessage, setRetrievalSaveMessage] = useState<string | null>(null);
  const [clearingEmbeddingCache, setClearingEmbeddingCache] = useState(false);
  const [embeddingCacheMessage, setEmbeddingCacheMessage] = useState<string | null>(
    null,
  );
  const [clearingCorpusCache, setClearingCorpusCache] = useState(false);
  const [corpusCacheMessage, setCorpusCacheMessage] = useState<string | null>(null);
  const [traceLogEnabled, setTraceLogEnabled] = useState(false);
  const [promptSaveMessage, setPromptSaveMessage] = useState<string | null>(null);
  const [promptSaveScope, setPromptSaveScope] = useState<
    "evaluation" | "demo" | "per-question" | null
  >(null);
  const [topicTitleMode, setTopicTitleMode] = useState<"llm" | "simple">("llm");
  const [topicTitleLen, setTopicTitleLen] = useState(18);
  const [savingTopicSettings, setSavingTopicSettings] = useState(false);
  const [topicSaveMessage, setTopicSaveMessage] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [providerCreateMessage, setProviderCreateMessage] = useState<string | null>(null);
  const [testingLlm, setTestingLlm] = useState(false);
  const [testingAsr, setTestingAsr] = useState(false);
  const [llmTestMessage, setLlmTestMessage] = useState<string | null>(null);
  const [asrTestMessage, setAsrTestMessage] = useState<string | null>(null);
  const [asrTestRaw, setAsrTestRaw] = useState<string | null>(null);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestMessage, setEmbeddingTestMessage] = useState<string | null>(null);
  const applyProfileToForm = useCallback(
    (cfg: ItConfigSnapshot | null, targetProvider?: string, targetAsr?: string) => {
      if (!cfg) return;
      const provider = targetProvider || cfg.llmProvider || cfg.llm?.provider || "baidu_qianfan";
      const asrProvider = targetAsr || cfg.asrProvider || cfg.asr?.provider || "baidu_vop";
      const providerProfile = cfg.providerProfiles?.[provider] || null;
      const asrProviderProfile = cfg.providerProfiles?.[asrProvider] || null;
      const llmProfile =
        (cfg.llm && cfg.llm.provider === provider ? cfg.llm : null) ||
        (cfg.llmProfiles && cfg.llmProfiles[provider]) ||
        (providerProfile?.llm as any);
      const asrProfile =
        (cfg.asr && cfg.asr.provider === asrProvider ? cfg.asr : null) ||
        (cfg.asrProfiles && cfg.asrProfiles[asrProvider]) ||
        (asrProviderProfile?.asr as any);
      const llmDefaults =
        provider === "volc_doubao"
          ? {
              baseUrl: "https://ark.cn-beijing.volces.com",
              model: "doubao-seed-1-8-251228",
              useResponses: true,
              webSearch: true,
              reasoningEffort: "medium",
              maxOutputTokens: 800,
              reusePrefix: true,
            }
          : {
              baseUrl: "https://qianfan.baidubce.com/v2",
              model: "ernie-4.5-turbo-128k",
              useResponses: false,
              webSearch: false,
              reasoningEffort: "medium",
              maxOutputTokens: 800,
              reusePrefix: false,
            };
      const asrDefaults = {
        baseUrl: "https://vop.baidu.com/server_api",
        language: "zh",
        devPid: 1537,
        mockText: "",
        maxChunkSec: 50,
        maxConcurrency: 1,
        timeoutSec: 120,
        maxRetries: 1,
      };

      setApiForm((prev) => ({
        ...prev,
        environment: cfg.activeEnvironment || "prod",
        llmProfiles: cfg.llmProfiles || prev.llmProfiles,
        asrProfiles: cfg.asrProfiles || prev.asrProfiles,
        llm: {
          provider,
          baseUrl: llmProfile?.base_url || llmProfile?.baseUrl || llmDefaults.baseUrl,
          model: llmProfile?.model || llmDefaults.model,
          apiKey: llmProfile?.api_key || llmProfile?.apiKey || "",
          temperature: Number(llmProfile?.temperature ?? 0.8),
          topP: Number(llmProfile?.top_p ?? llmProfile?.topP ?? 0.8),
          timeoutSec: Number(llmProfile?.timeout_sec ?? llmProfile?.timeoutSec ?? 60),
          maxRetries: Number(llmProfile?.max_retries ?? llmProfile?.maxRetries ?? 1),
          antiRepeat: Boolean(
            llmProfile?.anti_repeat ?? llmProfile?.antiRepeat ?? prev.llm.antiRepeat ?? false,
          ),
          useResponses: Boolean(
            llmProfile?.use_responses ??
              llmProfile?.useResponses ??
              llmDefaults.useResponses,
          ),
          webSearch: Boolean(
            llmProfile?.web_search ?? llmProfile?.webSearch ?? llmDefaults.webSearch,
          ),
          reasoningEffort:
            llmProfile?.reasoning_effort ??
            llmProfile?.reasoningEffort ??
            llmDefaults.reasoningEffort,
          maxOutputTokens: Number(
            llmProfile?.max_output_tokens ??
              llmProfile?.maxOutputTokens ??
              llmDefaults.maxOutputTokens,
          ),
          reusePrefix: Boolean(
            llmProfile?.reuse_prefix ??
              llmProfile?.reusePrefix ??
              llmDefaults.reusePrefix,
          ),
        },
        asr: {
          provider: asrProvider,
          baseUrl: asrProfile?.base_url || asrProfile?.baseUrl || asrDefaults.baseUrl,
          apiKey: asrProfile?.api_key || asrProfile?.apiKey || "",
          secretKey: asrProfile?.secret_key || asrProfile?.secretKey || "",
          language: asrProfile?.language || asrDefaults.language,
          devPid: Number(asrProfile?.dev_pid ?? asrProfile?.devPid ?? asrDefaults.devPid),
          mockText: asrProfile?.mock_text || asrProfile?.mockText || asrDefaults.mockText,
          maxChunkSec: Number(asrProfile?.max_chunk_sec ?? asrProfile?.maxChunkSec ?? asrDefaults.maxChunkSec),
          maxConcurrency: Number(
            asrProfile?.max_concurrency ??
              asrProfile?.maxConcurrency ??
              asrDefaults.maxConcurrency,
          ),
          timeoutSec: Number(asrProfile?.timeout_sec ?? asrProfile?.timeoutSec ?? asrDefaults.timeoutSec),
          maxRetries: Number(asrProfile?.max_retries ?? asrProfile?.maxRetries ?? asrDefaults.maxRetries),
        },
      }));
    },
    [],
  );
  const applyRetrievalToForm = useCallback((cfg: ItConfigSnapshot | null) => {
    if (!cfg) return;
    const retrieval = cfg.retrieval || ({} as ItConfigSnapshot["retrieval"]);
    const vector = retrieval.vector || ({} as ItConfigSnapshot["retrieval"]["vector"]);
    const embeddingProvider =
      retrieval.embeddingProvider || vector.provider || "volc_doubao";
    const providerEmbedding =
      (embeddingProvider && cfg.providerProfiles?.[embeddingProvider]?.embedding) || {};
    setRetrievalForm({
      mode: retrieval.mode || "vector",
      topK: Number(retrieval.topK ?? 5),
      topKNotes: Number(retrieval.topKNotes ?? retrieval.topK ?? 5),
      topKKnowledge: Number(retrieval.topKKnowledge ?? retrieval.topK ?? 5),
      topKRubrics: Number(retrieval.topKRubrics ?? retrieval.topK ?? 5),
      topKExamples: Number(retrieval.topKExamples ?? retrieval.topK ?? 5),
      maxConcurrency: Number(retrieval.maxConcurrency ?? 3),
      embeddingMaxConcurrency: Number(retrieval.embeddingMaxConcurrency ?? 1),
      minScore: Number(retrieval.minScore ?? 0.2),
      vector: {
        provider: embeddingProvider,
        baseUrl:
          vector.baseUrl ||
          providerEmbedding.base_url ||
          "https://ark.cn-beijing.volces.com",
        model: vector.model || providerEmbedding.model || "doubao-embedding",
        apiKey: vector.apiKey || providerEmbedding.api_key || "",
        timeoutSec: Number(vector.timeoutSec ?? providerEmbedding.timeout_sec ?? 30),
        maxRetries: Number(vector.maxRetries ?? providerEmbedding.max_retries ?? 1),
        batchSize: Number(vector.batchSize ?? 16),
        queryMaxChars: Number(vector.queryMaxChars ?? 1500),
      },
    });
  }, []);
  const [activePage, setActivePage] = useState<"practice" | "settings">("practice");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [questionError, setQuestionError] = useState(false);
  const [recordingSession, setRecordingSession] = useState<{ startedAt: number | null }>({
    startedAt: null,
  });
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uiLocked = !config;
  const providerProfiles = config?.providerProfiles || {};
  const providerList = useMemo(
    () => Object.keys(providerProfiles).sort((a, b) => a.localeCompare(b)),
    [providerProfiles],
  );
  const llmProviders = useMemo(() => {
    const base = providerList.length ? providerList : ["baidu_qianfan", "volc_doubao"];
    return Array.from(new Set([...base, "heuristic"]));
  }, [providerList]);
  const asrProviders = useMemo(() => {
    const filtered = providerList.filter((id) => providerProfiles?.[id]?.asr);
    const base = filtered.length ? filtered : ["baidu_vop"];
    return Array.from(new Set([...base, "mock"]));
  }, [providerList, providerProfiles]);
  const embeddingProviders = useMemo(() => {
    const base = providerList.length ? providerList : ["volc_doubao", "baidu_qianfan", "openai_compatible"];
    return Array.from(new Set(base));
  }, [providerList]);
  const getProviderLabel = useCallback(
    (id: string) => providerProfiles[id]?.display_name || id,
    [providerProfiles],
  );
  const embeddingWarmup = itState.embeddingWarmup;
  const showEmbeddingWarmup = Boolean(embeddingWarmup && embeddingWarmup.status !== "idle");

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
        applyProfileToForm(resp.content);
        applyRetrievalToForm(resp.content);
        setCustomPrompt(
          resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
        );
        setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(
          resp.content.prompts?.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
        );
        setPerQuestionDemoPrompts(
          resp.content.prompts?.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
        );
      } else {
        // fallback to unlock UI even if后端出错
        const fallbackConfig: ItConfigSnapshot = {
          activeEnvironment: "prod",
          envList: ["prod"],
          llmProvider: "baidu_qianfan",
          asrProvider: "baidu_vop",
          acousticProvider: "api",
          llmProfiles: {},
          asrProfiles: {},
          providerProfiles: {},
          prompts: {
            evaluationPrompt: STRICT_SYSTEM_PROMPT,
            demoPrompt: DEFAULT_DEMO_PROMPT,
            perQuestionSystemPrompts: ["", "", ""],
            perQuestionDemoPrompts: ["", "", ""],
          },
          llm: {
            provider: "baidu_qianfan",
            baseUrl: "https://qianfan.baidubce.com/v2",
            model: "ernie-4.5-turbo-128k",
            apiKey: "",
            temperature: 0.8,
            topP: 0.8,
            timeoutSec: 60,
            maxRetries: 1,
          },
          asr: {
            provider: "baidu_vop",
            baseUrl: "https://vop.baidu.com/server_api",
            apiKey: "",
            secretKey: "",
            language: "zh",
            devPid: 1537,
            mockText: "",
            maxChunkSec: 50,
            maxConcurrency: 1,
            timeoutSec: 120,
            maxRetries: 1,
          },
          sessionsDir: "sessions",
          retrievalEnabled: true,
          retrieval: {
            mode: "vector",
            topK: 5,
            minScore: 0.2,
            embeddingProvider: "volc_doubao",
            vector: {
              provider: "volc_doubao",
              baseUrl: "https://ark.cn-beijing.volces.com",
              apiKey: "",
              model: "doubao-embedding",
              timeoutSec: 30,
              maxRetries: 1,
              batchSize: 16,
              queryMaxChars: 1500,
            },
          },
          workspaceDirs: {
            notesDir: "inputs/notes",
            promptsDir: "inputs/prompts/guangdong",
            rubricsDir: "inputs/rubrics",
            knowledgeDir: "inputs/knowledge",
            examplesDir: "inputs/examples",
          },
        };
        setConfig(fallbackConfig);
        setCustomPrompt(STRICT_SYSTEM_PROMPT);
        setDemoPrompt(DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(["", "", ""]);
        setPerQuestionDemoPrompts(["", "", ""]);
        setItState((prev) => ({
          ...prev,
          statusMessage: "配置加载失败，已使用默认配置",
        }));
      }
    });
    request("it/listNativeInputs", undefined).then((resp) => {
      if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
        setNativeInputs(resp.content.inputs);
        setSelectedInput(resp.content.inputs[0] || "");
      }
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    applyProfileToForm(config);
    applyRetrievalToForm(config);
    if (config.prompts) {
      setCustomPrompt(config.prompts.evaluationPrompt ?? STRICT_SYSTEM_PROMPT);
      setDemoPrompt(config.prompts.demoPrompt ?? DEFAULT_DEMO_PROMPT);
      setPerQuestionSystemPrompts(
        config.prompts.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
      );
      setPerQuestionDemoPrompts(
        config.prompts.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
      );
    }
    const nextAnswerMode = String(config.evaluation?.answerMode || "two-step");
    setAnswerMode(nextAnswerMode === "single" ? "single" : "two-step");
    const nextTitleMode = String(config.topics?.titleMode || "llm");
    setTopicTitleMode(nextTitleMode === "simple" ? "simple" : "llm");
    const nextTitleLen = Number(config.topics?.maxTitleLen ?? 18);
    setTopicTitleLen(Number.isFinite(nextTitleLen) ? nextTitleLen : 18);
  }, [config, applyProfileToForm, applyRetrievalToForm]);

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

  useEffect(() => {
    setShowRawOutput(false);
  }, [analysisResult]);

  const thinkingVisible = useMemo(() => {
    return itState.steps.some(
      (step) =>
        step.status === "running" &&
        ["question", "acoustic", "asr", "notes", "evaluation"].includes(step.id),
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
  const buildQuestionParseInput = useCallback(() => {
    const text = questionText.trim();
    const list = questionList.trim();
    if (text && list) {
      return `${text}\n\n${list}`;
    }
    return text || list;
  }, [questionText, questionList]);
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
  const transcriptPreview = analysisResult?.transcript || itState.draftTranscript || "";
  const detailedTranscriptPreview =
    analysisResult?.detailedTranscript || itState.draftDetailedTranscript;
  const acousticPreview = analysisResult?.acoustic || itState.draftAcoustic;
  const notesPreview = analysisResult?.notes ?? itState.draftNotes;
  const questionTimingsPreview =
    analysisResult?.questionTimings ?? itState.draftQuestionTimings;
  const questionTimingNotePreview =
    analysisResult?.questionTimingNote ?? itState.draftQuestionTimingNote;
  const evaluationPreview = analysisResult?.evaluation || itState.draftEvaluation || null;
  const retrievalCacheInfo = config?.retrievalCache;
  const corpusCachePath = retrievalCacheInfo?.corpusCacheDir || "";
  const embeddingCachePath = retrievalCacheInfo?.embeddingCacheDir || "";
  const corpusCacheMb = retrievalCacheInfo?.corpusCacheMb;
  const queryCacheSize = retrievalCacheInfo?.queryCacheSize;
  const maxConcurrency = retrievalCacheInfo?.maxConcurrency;
  const hasAnyResult =
    Boolean(analysisResult) ||
    Boolean(itState.draftTranscript) ||
    Boolean(itState.draftDetailedTranscript) ||
    Boolean(itState.draftEvaluation) ||
    Boolean(itState.draftAcoustic) ||
    typeof itState.draftNotes !== "undefined" ||
    Boolean(itState.draftQuestionTimings) ||
    Boolean(itState.draftQuestionTimingNote);

  useEffect(() => {
    if (questionError && hasQuestion) {
      setQuestionError(false);
    }
  }, [questionError, hasQuestion]);

  const handleQuestionTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestionText(event.target.value);
    if (questionParsed) {
      setQuestionParsed(false);
    }
  };

  const handleQuestionListChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestionList(event.target.value);
    if (questionParsed) {
      setQuestionParsed(false);
    }
  };

  const parseQuestionsFromText = useCallback(
    async (
      rawText: string,
      options: { silent?: boolean; fallbackPrompt?: string } = {},
    ) => {
      const input = rawText.trim();
      const fallbackPrompt = options.fallbackPrompt ?? questionText.trim();
      if (!input) {
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "题干内容为空，无法识别题目。",
            lastError: {
              type: "question",
              reason: "题干内容为空",
              solution: "请粘贴题干或小题列表后再识别。",
            },
          }));
        }
        return {
          questionText: fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      }
      setQuestionParsing(true);
      setQuestionParsed(false);
      if (!options.silent) {
        setItState((prev) => ({
          ...prev,
          statusMessage: "题目识别中，请稍候...",
        }));
      }
      try {
        const remote = await it_parseQuestionsRemote(input);
        if (remote && remote.questions.length) {
          const nextPrompt = remote.prompt || fallbackPrompt;
          const nextList = remote.questions;
          setQuestionText(nextPrompt);
          setQuestionList(nextList.join("\n"));
          setQuestionParsed(true);
          setQuestionError(false);
          if (!options.silent) {
            setItState((prev) => ({
              ...prev,
              statusMessage: `题目已识别，识别${nextList.length}题（${remote.source}）。`,
            }));
          }
          return {
            questionText: nextPrompt,
            questionList: nextList,
            recognized: true,
          };
        }
        if (remote?.prompt && !questionText.trim()) {
          setQuestionText(remote.prompt);
        }
        setQuestionParsed(false);
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "未识别到题目，请手动拆分。",
          }));
        }
        return {
          questionText: remote?.prompt || fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      } catch (err) {
        setQuestionParsed(false);
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "题目识别失败，请检查配置或网络。",
            lastError: {
              type: "question",
              reason: err instanceof Error ? err.message : String(err),
              solution: "请检查网络或 LLM 配置后重试。",
            },
          }));
        }
        return {
          questionText: fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      } finally {
        setQuestionParsing(false);
      }
    },
    [parsedQuestionList, questionText],
  );

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
      setQuestionText(text.trim());
      setQuestionList("");
      setQuestionParsed(false);
      setQuestionError(false);
      setItState((prev) => ({
        ...prev,
        statusMessage: `已导入题干：${file.name}（未解析，开始分析时识别）`,
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
    setShowNoteHits(false);
    analysisCancelledRef.current = false;
    analysisRunRef.current += 1;
    const currentRun = analysisRunRef.current;
    const runId = new Date().toISOString();
    setItState((prev) => ({
      ...prev,
      statusMessage: `已发起分析请求（批次：${runId}）`,
    }));
    const finalQuestionText = questionText.trim();
    const finalQuestionList = parsedQuestionList;
    const normalizedPerQuestionSystem = perQuestionSystemPrompts
      .slice(0, 3)
      .map((item) => item.trim());
    const normalizedPerQuestionDemo = perQuestionDemoPrompts
      .slice(0, 3)
      .map((item) => item.trim());
    const hasPerQuestionSystem = normalizedPerQuestionSystem.some(Boolean);
    const hasPerQuestionDemo = normalizedPerQuestionDemo.some(Boolean);
    const payload: ItAnalyzeRequest = {
      audio: audioPayload,
      questionText: finalQuestionText || undefined,
      questionList: finalQuestionList,
      systemPrompt: customPrompt?.trim() || undefined,
      demoPrompt: demoPrompt?.trim() || undefined,
      perQuestionSystemPrompts: hasPerQuestionSystem ? normalizedPerQuestionSystem : undefined,
      perQuestionDemoPrompts: hasPerQuestionDemo ? normalizedPerQuestionDemo : undefined,
      runId,
    };
    try {
      const response = await request("it/analyzeAudio", payload, { timeoutMs: 5 * 60 * 1000 });
      if (analysisCancelledRef.current || currentRun !== analysisRunRef.current) {
        return;
      }
      if (response?.status === "success") {
        setAnalysisResult(response.content);
        const resolvedText = String(response.content?.questionText || "").trim();
        const resolvedList = Array.isArray(response.content?.questionList)
          ? response.content.questionList.map((item: any) => String(item)).filter(Boolean)
          : [];
        if (resolvedText && resolvedText !== questionText.trim()) {
          setQuestionText(resolvedText);
        }
        if (resolvedList.length) {
          setQuestionList(resolvedList.join("\n"));
          setQuestionParsed(true);
          setQuestionError(false);
        }
        setActiveTab("evaluation");
      } else if (response?.error && String(response.error).includes("分析已停止")) {
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析已停止",
          lastError: undefined,
        }));
      } else {
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析失败，请检查配置或网络",
        }));
      }
    } finally {
      if (!analysisCancelledRef.current && currentRun === analysisRunRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const handleRegenerateDemoAnswer = useCallback(
    async (index: number) => {
      const current = analysisResult?.evaluation?.revisedAnswers?.[index];
      if (!current) return;
      setRegeneratingIndex(index);
      try {
        const contextQuestions =
          Array.isArray(analysisResult?.questionList) && analysisResult.questionList.length
            ? analysisResult.questionList
            : parsedQuestionList.length
              ? parsedQuestionList
              : analysisResult?.questionText?.trim()
                ? [analysisResult.questionText.trim()]
                : questionText.trim()
                  ? [questionText.trim()]
                  : [];
        const payload = {
          question: current.question,
          answer: current.original || "",
          questionText: analysisResult?.questionText || questionText.trim(),
          contextQuestions,
          notes: analysisResult?.notes ?? itState.draftNotes ?? [],
          acoustic: analysisResult?.acoustic ?? itState.draftAcoustic,
          systemPrompt: [customPrompt?.trim(), perQuestionSystemPrompts[index]?.trim()]
            .filter(Boolean)
            .join("\n\n"),
          demoPrompt: [demoPrompt?.trim(), perQuestionDemoPrompts[index]?.trim()]
            .filter(Boolean)
            .join("\n\n"),
        };
        const response = await request("it/regenerateDemoAnswer", payload, {
          timeoutMs: 120_000,
        });
        if (response?.status === "success" && response.content) {
          setAnalysisResult((prev) => {
            if (!prev?.evaluation?.revisedAnswers) return prev;
            const revisedAnswers = [...prev.evaluation.revisedAnswers];
            const previous = revisedAnswers[index];
            const updated = { ...previous, ...response.content };
            if (!updated.original) {
              updated.original = previous?.original || "";
            }
            revisedAnswers[index] = updated;
            return {
              ...prev,
              evaluation: {
                ...prev.evaluation,
                revisedAnswers,
              },
            };
          });
        } else {
          setItState((prev) => ({
            ...prev,
            statusMessage: response?.error
              ? `示范重生成失败：${response.error}`
              : "示范重生成失败",
          }));
        }
      } finally {
        setRegeneratingIndex((prev) => (prev === index ? null : prev));
      }
    },
    [
      analysisResult,
      parsedQuestionList,
      questionText,
      customPrompt,
      demoPrompt,
      perQuestionSystemPrompts,
      perQuestionDemoPrompts,
      itState.draftNotes,
      itState.draftAcoustic,
    ],
  );

  const handleCancelAnalyze = async () => {
    if (!isProcessing) return;
    analysisCancelledRef.current = true;
    setIsProcessing(false);
    setItState((prev) => ({
      ...prev,
      statusMessage: "已请求停止分析",
      lastError: undefined,
    }));
    try {
      await request("it/cancelAnalyze");
    } catch {
      // ignore
    }
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
      setActivePage("practice");
    }
  }, []);
  const handleApiFieldChange = (
    scope: "llm" | "asr",
    key: string,
    value: string | number | boolean,
  ) => {
    setLlmTestMessage(null);
    setAsrTestMessage(null);
    setAsrTestRaw(null);
    setApiForm((prev) => {
      if (scope === "llm" && key === "provider") {
        const provider = String(value);
        const providerProfile = providerProfiles?.[provider]?.llm || {};
        const defaults =
          provider === "volc_doubao"
            ? {
                baseUrl: "https://ark.cn-beijing.volces.com",
                model: "doubao-seed-1-8-251228",
                useResponses: true,
                webSearch: true,
                reasoningEffort: "medium",
                maxOutputTokens: 800,
                reusePrefix: true,
              }
            : {
                baseUrl: "https://qianfan.baidubce.com/v2",
                model: "ernie-4.5-turbo-128k",
                useResponses: false,
                webSearch: false,
                reasoningEffort: "medium",
                maxOutputTokens: 800,
                reusePrefix: false,
              };
        const nextProfile =
          (provider === prev.llm.provider ? prev.llm : undefined) ||
          (prev.llmProfiles && prev.llmProfiles[provider]) ||
          providerProfile ||
          {};
        return {
          ...prev,
          llmProfiles: {
            ...prev.llmProfiles,
          },
          llm: {
            ...prev.llm,
            provider,
            baseUrl: nextProfile.base_url || nextProfile.baseUrl || defaults.baseUrl,
            model: nextProfile.model || defaults.model,
            apiKey: nextProfile.api_key || nextProfile.apiKey || prev.llm.apiKey,
            temperature: Number(
              nextProfile.temperature ?? prev.llm.temperature ?? 0.8,
            ),
            topP: Number(nextProfile.top_p ?? nextProfile.topP ?? prev.llm.topP ?? 0.8),
            timeoutSec: Number(
              nextProfile.timeout_sec ?? nextProfile.timeoutSec ?? prev.llm.timeoutSec ?? 60,
            ),
            maxRetries: Number(
              nextProfile.max_retries ?? nextProfile.maxRetries ?? prev.llm.maxRetries ?? 1,
            ),
            antiRepeat: Boolean(
              nextProfile.anti_repeat ?? nextProfile.antiRepeat ?? prev.llm.antiRepeat ?? false,
            ),
            useResponses: Boolean(
              nextProfile.use_responses ??
                nextProfile.useResponses ??
                defaults.useResponses ??
                prev.llm.useResponses,
            ),
            webSearch: Boolean(
              nextProfile.web_search ??
                nextProfile.webSearch ??
                defaults.webSearch ??
                prev.llm.webSearch,
            ),
            reasoningEffort:
              nextProfile.reasoning_effort ??
              nextProfile.reasoningEffort ??
              defaults.reasoningEffort ??
              prev.llm.reasoningEffort,
            maxOutputTokens: Number(
              nextProfile.max_output_tokens ??
                nextProfile.maxOutputTokens ??
                defaults.maxOutputTokens ??
                prev.llm.maxOutputTokens,
            ),
            reusePrefix: Boolean(
              nextProfile.reuse_prefix ??
                nextProfile.reusePrefix ??
                defaults.reusePrefix ??
                prev.llm.reusePrefix,
            ),
          },
        };
      }
      if (scope === "asr" && key === "provider") {
        const provider = String(value);
        const providerProfile = providerProfiles?.[provider]?.asr || {};
        const nextProfile =
          (provider === prev.asr.provider ? prev.asr : undefined) ||
          (prev.asrProfiles && prev.asrProfiles[provider]) ||
          providerProfile ||
          {};
        const defaults = {
          baseUrl: "https://vop.baidu.com/server_api",
          language: "zh",
          devPid: 1537,
          mockText: "",
          maxChunkSec: 50,
          maxConcurrency: 1,
          timeoutSec: 120,
          maxRetries: 1,
        };
        return {
          ...prev,
          asrProfiles: {
            ...prev.asrProfiles,
          },
          asr: {
            ...prev.asr,
            provider,
            baseUrl: nextProfile.base_url || nextProfile.baseUrl || defaults.baseUrl,
            apiKey: nextProfile.api_key || nextProfile.apiKey || prev.asr.apiKey,
            secretKey: nextProfile.secret_key || nextProfile.secretKey || prev.asr.secretKey,
            language: nextProfile.language || prev.asr.language || defaults.language,
            devPid: Number(nextProfile.dev_pid ?? nextProfile.devPid ?? prev.asr.devPid ?? defaults.devPid),
            mockText: nextProfile.mock_text || nextProfile.mockText || prev.asr.mockText || defaults.mockText,
            maxChunkSec: Number(
              nextProfile.max_chunk_sec ?? nextProfile.maxChunkSec ?? prev.asr.maxChunkSec ?? defaults.maxChunkSec,
            ),
            maxConcurrency: Number(
              nextProfile.max_concurrency ??
                nextProfile.maxConcurrency ??
                prev.asr.maxConcurrency ??
                defaults.maxConcurrency,
            ),
            timeoutSec: Number(
              nextProfile.timeout_sec ?? nextProfile.timeoutSec ?? prev.asr.timeoutSec ?? defaults.timeoutSec,
            ),
            maxRetries: Number(
              nextProfile.max_retries ?? nextProfile.maxRetries ?? prev.asr.maxRetries ?? defaults.maxRetries,
            ),
          },
        };
      }
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [key]: value,
        },
      };
    });
  };
  const handleSaveApiConfig = async () => {
    if (!apiForm.environment.trim()) {
      setApiSaveMessage("请填写环境名称（如 prod / test）。");
      return;
    }
    setSavingApiConfig(true);
    setApiSaveMessage(null);
    const payload = {
      environment: apiForm.environment.trim(),
      llm: {
        provider: apiForm.llm.provider,
        baseUrl: apiForm.llm.baseUrl,
        model: apiForm.llm.model,
        apiKey: apiForm.llm.apiKey,
        temperature: Number(apiForm.llm.temperature),
        topP: Number(apiForm.llm.topP),
        timeoutSec: Number(apiForm.llm.timeoutSec),
        maxRetries: Number(apiForm.llm.maxRetries),
        antiRepeat: Boolean(apiForm.llm.antiRepeat),
        useResponses: Boolean(apiForm.llm.useResponses),
        webSearch: Boolean(apiForm.llm.webSearch),
        reasoningEffort: apiForm.llm.reasoningEffort,
        maxOutputTokens: Number(apiForm.llm.maxOutputTokens),
        reusePrefix: Boolean(apiForm.llm.reusePrefix),
      },
      asr: {
        provider: apiForm.asr.provider,
        baseUrl: apiForm.asr.baseUrl,
        apiKey: apiForm.asr.apiKey,
        secretKey: apiForm.asr.secretKey,
        language: apiForm.asr.language,
        devPid: Number(apiForm.asr.devPid),
        mockText: apiForm.asr.mockText,
        maxChunkSec: Number(apiForm.asr.maxChunkSec),
        maxConcurrency: Number(apiForm.asr.maxConcurrency),
        timeoutSec: Number(apiForm.asr.timeoutSec),
        maxRetries: Number(apiForm.asr.maxRetries),
      },
      llmProfiles: {
        ...apiForm.llmProfiles,
        [apiForm.llm.provider]: {
          provider: apiForm.llm.provider,
          base_url: apiForm.llm.baseUrl,
          model: apiForm.llm.model,
          api_key: apiForm.llm.apiKey,
          temperature: Number(apiForm.llm.temperature),
          top_p: Number(apiForm.llm.topP),
          timeout_sec: Number(apiForm.llm.timeoutSec),
          max_retries: Number(apiForm.llm.maxRetries),
          anti_repeat: Boolean(apiForm.llm.antiRepeat),
          use_responses: Boolean(apiForm.llm.useResponses),
          web_search: Boolean(apiForm.llm.webSearch),
          reasoning_effort: apiForm.llm.reasoningEffort,
          max_output_tokens: Number(apiForm.llm.maxOutputTokens),
          reuse_prefix: Boolean(apiForm.llm.reusePrefix),
        },
      },
      asrProfiles: {
        ...apiForm.asrProfiles,
        [apiForm.asr.provider]: {
          provider: apiForm.asr.provider,
          base_url: apiForm.asr.baseUrl,
          api_key: apiForm.asr.apiKey,
          secret_key: apiForm.asr.secretKey,
          language: apiForm.asr.language,
          dev_pid: Number(apiForm.asr.devPid),
          mock_text: apiForm.asr.mockText,
          max_chunk_sec: Number(apiForm.asr.maxChunkSec),
          max_concurrency: Number(apiForm.asr.maxConcurrency),
          timeout_sec: Number(apiForm.asr.timeoutSec),
          max_retries: Number(apiForm.asr.maxRetries),
        },
      },
    };
    try {
      const resp = await request("it/updateApiSettings", payload);
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
          applyProfileToForm(resp.content, payload.llm.provider, payload.asr.provider);
        }
        setApiSaveMessage("已保存，重试录音即可生效。");
      } else {
        setApiSaveMessage("保存失败，请检查输入后重试。");
      }
    } catch (err) {
      setApiSaveMessage(
        `保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingApiConfig(false);
  };
  const handleSavePrompts = async (
    scope: "evaluation" | "demo" | "per-question",
  ) => {
    setPromptSaveMessage(null);
    setPromptSaveScope(scope);
    try {
      await request("it/savePrompts", {
        evaluationPrompt: customPrompt,
        demoPrompt,
        perQuestionSystemPrompts,
        perQuestionDemoPrompts,
        answerMode,
      });
      setPromptSaveMessage("提示词已保存");
    } catch (err) {
      setPromptSaveMessage(
        `提示词保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  const handleSaveTopicSettings = async () => {
    setSavingTopicSettings(true);
    setTopicSaveMessage(null);
    try {
      await request("it/updateTopicSettings", {
        topics: {
          titleMode: topicTitleMode,
          maxTitleLen: Number(topicTitleLen),
        },
      });
      setTopicSaveMessage("命名设置已保存");
    } catch (err) {
      setTopicSaveMessage(
        `命名设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTopicSettings(false);
  };
  const handleRetrievalFieldChange = (
    key:
      | "mode"
      | "topK"
      | "topKNotes"
      | "topKKnowledge"
      | "topKRubrics"
      | "topKExamples"
      | "maxConcurrency"
      | "embeddingMaxConcurrency"
      | "minScore",
    value: any,
  ) => {
    setRetrievalForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  const handleRetrievalVectorChange = (key: keyof typeof retrievalForm.vector, value: any) => {
    setRetrievalForm((prev) => ({
      ...prev,
      vector: {
        ...prev.vector,
        [key]: value,
      },
    }));
  };
  const handleSaveRetrievalSettings = async () => {
    setSavingRetrieval(true);
    setRetrievalSaveMessage(null);
    try {
      const payload = {
        retrieval: {
          enabled: config?.retrievalEnabled ?? true,
          mode: retrievalForm.mode,
          topK: Number(retrievalForm.topK),
          topKNotes: Number(retrievalForm.topKNotes),
          topKKnowledge: Number(retrievalForm.topKKnowledge),
          topKRubrics: Number(retrievalForm.topKRubrics),
          topKExamples: Number(retrievalForm.topKExamples),
          maxConcurrency: Number(retrievalForm.maxConcurrency),
          embeddingMaxConcurrency: Number(retrievalForm.embeddingMaxConcurrency),
          minScore: Number(retrievalForm.minScore),
          embeddingProvider: retrievalForm.vector.provider,
          vector: {
            provider: retrievalForm.vector.provider,
            baseUrl: retrievalForm.vector.baseUrl,
            apiKey: retrievalForm.vector.apiKey,
            model: retrievalForm.vector.model,
            timeoutSec: Number(retrievalForm.vector.timeoutSec),
            maxRetries: Number(retrievalForm.vector.maxRetries),
            batchSize: Number(retrievalForm.vector.batchSize),
            queryMaxChars: Number(retrievalForm.vector.queryMaxChars),
          },
        },
      };
      const resp = await request("it/updateRetrievalSettings", payload);
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
          applyRetrievalToForm(resp.content);
        }
        setRetrievalSaveMessage("检索配置已保存。");
      } else {
        setRetrievalSaveMessage("检索配置保存失败，请检查输入。");
      }
    } catch (err) {
      setRetrievalSaveMessage(
        `检索配置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingRetrieval(false);
  };
  const handleTestEmbedding = async () => {
    setTestingEmbedding(true);
    setEmbeddingTestMessage(null);
    try {
      const resp = await request("it/testEmbedding", {
        embedding: {
          provider: retrievalForm.vector.provider,
          baseUrl: retrievalForm.vector.baseUrl,
          model: retrievalForm.vector.model,
          apiKey: retrievalForm.vector.apiKey,
          timeoutSec: retrievalForm.vector.timeoutSec,
          maxRetries: retrievalForm.vector.maxRetries,
        },
      });
      if (resp?.status === "success") {
        const length = resp.content?.length ?? 0;
        setEmbeddingTestMessage(`Embedding 接口正常：向量维度 ${length}`);
      } else {
        setEmbeddingTestMessage("Embedding 测试失败，请检查配置。");
      }
    } catch (err) {
      setEmbeddingTestMessage(
        `Embedding 测试失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setTestingEmbedding(false);
  };
  const handleCreateProviderConfig = async () => {
    const providerId = providerDraft.id.trim();
    if (!providerId) {
      setProviderCreateMessage("请先填写 Provider Key。");
      return;
    }
    setCreatingProvider(true);
    setProviderCreateMessage(null);
    try {
      const resp = await request("it/createProviderConfig", {
        providerId,
        displayName: providerDraft.name.trim(),
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setProviderDraft({ id: "", name: "" });
        setProviderCreateMessage("已创建提供者配置。");
      } else {
        setProviderCreateMessage("创建失败，请检查名称是否重复。");
      }
    } catch (err) {
      setProviderCreateMessage(
        `创建失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setCreatingProvider(false);
  };
  const handleOpenProviderConfig = async (providerId: string) => {
    await request("it/openProviderConfig", { providerId });
  };
  const handleClearEmbeddingCache = async () => {
    setClearingEmbeddingCache(true);
    setEmbeddingCacheMessage(null);
    try {
      const resp = await request("it/clearEmbeddingCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setEmbeddingCacheMessage(cleared ? "已清理缓存" : "缓存为空，无需清理");
      } else {
        setEmbeddingCacheMessage("清理缓存失败，请重试。");
      }
    } catch (err) {
      setEmbeddingCacheMessage(
        `清理缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingEmbeddingCache(false);
  };
  const handleEnableTraceLogs = async () => {
    try {
      const resp = await request("it/enableTraceLogs", {});
      if (resp?.status === "success") {
        setTraceLogEnabled(true);
      }
    } catch {
      // ignore
    }
  };
  const handleClearCorpusCache = async () => {
    setClearingCorpusCache(true);
    setCorpusCacheMessage(null);
    try {
      const resp = await request("it/clearCorpusCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setCorpusCacheMessage(cleared ? "已清理语料缓存" : "语料缓存为空");
      } else {
        setCorpusCacheMessage("清理语料缓存失败，请重试。");
      }
    } catch (err) {
      setCorpusCacheMessage(
        `清理语料缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingCorpusCache(false);
  };
  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmTestMessage(null);
    try {
      const resp = await request("it/testLlm", {
        environment: apiForm.environment,
        llm: apiForm.llm,
      });
      if (resp?.status === "success") {
        const content = resp.content?.content || resp.content;
        setLlmTestMessage(`LLM 接口正常：${String(content || "").slice(0, 80)}`);
      } else {
        setLlmTestMessage("LLM 测试失败，请检查配置。");
      }
    } catch (err) {
      setLlmTestMessage(
        `LLM 测试失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setTestingLlm(false);
  };
  const handleTestAsr = async () => {
    setTestingAsr(true);
    setAsrTestMessage(null);
    setAsrTestRaw(null);
    try {
      const resp = await request("it/testAsr", { asr: apiForm.asr });
      if (resp?.status === "success") {
        const ok = resp.content?.ok !== false;
        if (ok) {
          const content = resp.content?.content ?? resp.content;
          setAsrTestMessage(
            `ASR 接口正常：${String(content || "").slice(0, 40) || "(无识别结果)"}`,
          );
        } else {
          const error = resp.content?.error || "ASR 测试失败，请检查配置。";
          setAsrTestMessage(`ASR 测试失败：${error}`);
          if (resp.content?.raw) {
            setAsrTestRaw(
              typeof resp.content.raw === "string"
                ? resp.content.raw
                : JSON.stringify(resp.content.raw, null, 2),
            );
          }
        }
      } else {
        const error = resp?.error || "ASR 测试失败，请检查配置。";
        setAsrTestMessage(`ASR 测试失败：${error}`);
        if (resp?.raw) {
          setAsrTestRaw(
            typeof resp.raw === "string" ? resp.raw : JSON.stringify(resp.raw, null, 2),
          );
        }
      }
    } catch (err) {
      setAsrTestMessage(
        `ASR 测试失败：${err instanceof Error ? err.message : String(err)}`,
      );
      setAsrTestRaw(err instanceof Error ? err.stack || err.message : String(err));
    }
    setTestingAsr(false);
  };
  const handleReloadConfig = async () => {
    const resp = await request("it/getConfig", undefined);
    if (resp?.status === "success" && resp.content) {
      setConfig(resp.content);
      setApiSaveMessage("已重新加载配置。");
      applyProfileToForm(resp.content);
      applyRetrievalToForm(resp.content);
      setCustomPrompt(
        resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
      );
      setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
    }
  };
  const handleToggleRetrieval = async (enabled: boolean) => {
    await request("it/setRetrievalEnabled", { enabled });
  };
  const handleSelectWorkspaceDir = async (kind: string) => {
    await request("it/selectWorkspaceDir", { kind });
  };
  const handleRefreshInputs = async () => {
    const resp = await request("it/listNativeInputs", { refresh: true });
    if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
      const inputs = resp.content.inputs;
      setNativeInputs(inputs);
      if (inputs.length && !inputs.includes(selectedInput)) {
        setSelectedInput(inputs[0] || "");
      }
      return;
    }
    setItState((prev) => ({
      ...prev,
      statusMessage: "刷新输入设备失败，请确认 ffmpeg 可用且麦克风权限已授权。",
    }));
  };

  useEffect(() => {
    const disposeHistory = on("it/showHistory", () => {
      void handleLoadHistory();
    });
    const disposeSettings = on("it/showSettings", () => {
      setActivePage("settings");
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
              {step.status !== "pending" && (
                <div className="it-step__progress">{step.progress}%</div>
              )}
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
        <div className="it-page-tabs">
          <button
            className={`it-tab ${activePage === "practice" ? "active" : ""}`}
            onClick={() => setActivePage("practice")}
          >
            练习
          </button>
          <button
            className={`it-tab ${activePage === "settings" ? "active" : ""}`}
            onClick={() => setActivePage("settings")}
          >
            设置
          </button>
        </div>
        {activePage === "practice" && (
          <div className="it-actions">
            <button
              className={`it-button ${itState.recordingState === "recording" ? "it-button--danger" : "it-button--primary"}`}
              disabled={uiLocked}
              onClick={() =>
                itState.recordingState === "recording"
                  ? handleStopRecording()
                  : handleStartRecording()
              }
            >
              {itState.recordingState === "recording" ? "停止录音" : "开始录音"}
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
              className={`it-button ${isProcessing ? "it-button--danger" : ""}`}
              disabled={
                isProcessing
                  ? uiLocked
                  : uiLocked || !audioPayload || !hasQuestion || isImporting
              }
              onClick={isProcessing ? handleCancelAnalyze : handleAnalyze}
            >
              {isProcessing ? "结束分析" : "开始分析"}
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
          </div>
        )}
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

      {activePage === "practice" && (
        <>
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
              <div className="it-question">
                <textarea
                  className={`it-textarea it-textarea--question${questionError ? " it-input--error" : ""}`}
                  placeholder="题干材料（可选）"
                  value={questionText}
                  onChange={handleQuestionTextChange}
                />
                <textarea
                  className={`it-textarea it-textarea--questions${questionError ? " it-input--error" : ""}`}
                  placeholder="小题列表（一行一个，可选）"
                  value={questionList}
                  onChange={handleQuestionListChange}
                />
                <div className="it-question__hint">
                  题干或小题列表为必填；开始分析时自动识别第N题，也可手动点击“识别题目”。
                </div>
                <div className="it-question__status">
                  <span
                    className={`it-status-badge ${
                      questionParsing
                        ? "it-status-badge--running"
                        : questionParsed
                          ? "it-status-badge--ok"
                          : "it-status-badge--idle"
                    }`}
                  >
                    题干状态：
                    {questionParsing
                      ? "识别中"
                      : questionParsed
                        ? "已识别"
                        : hasQuestion
                          ? "待解析"
                          : "未填写"}
                  </span>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || questionParsing || !hasQuestion}
                    onClick={async () => {
                      const merged = buildQuestionParseInput();
                      await parseQuestionsFromText(merged, {
                        fallbackPrompt: questionText.trim(),
                      });
                    }}
                  >
                    {questionParsing ? "识别中..." : "识别题目"}
                  </button>
                </div>
                {typeof notesPreview !== "undefined" && (
                  <div className="it-question__notes">
                    <div className="it-question__notes-header">
                      <span>笔记命中</span>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        type="button"
                        onClick={() => setShowNoteHits((prev) => !prev)}
                      >
                        {showNoteHits ? "收起" : "展开"}
                      </button>
                    </div>
                    {showNoteHits && (
                      <>
                        {config?.retrievalEnabled === false ? (
                          <div className="it-placeholder">检索未启用</div>
                        ) : notesPreview.length > 0 ? (
                          <ul className="it-note-hits">
                            {notesPreview.map((item, idx) => (
                              <li key={`${idx}-${item.source}`} className="it-note-hits__item">
                                <div className="it-note-hits__header">
                                  <span className="it-note-hits__score">
                                    {Number.isFinite(item.score)
                                      ? item.score.toFixed(2)
                                      : "-"}
                                  </span>
                                  <span className="it-note-hits__source">
                                    {item.source}
                                  </span>
                                </div>
                                <div className="it-note-hits__snippet">
                                  {item.snippet}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="it-placeholder">暂无命中</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
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
              {!hasAnyResult && (
                <div className="it-placeholder">等待分析结果...</div>
              )}
              {(analysisResult || itState.draftTranscript || itState.draftDetailedTranscript) &&
                activeTab === "transcript" && (
                <div className="it-transcript">
                  {detailedTranscriptPreview ? (
                    <>
                      <div className="it-section-title">带时间标注</div>
                      <textarea
                        className="it-textarea it-textarea--tall"
                        value={detailedTranscriptPreview}
                        readOnly
                      />
                      <div className="it-section-title">原始转写</div>
                      <textarea
                        className="it-textarea"
                        value={transcriptPreview}
                        readOnly
                      />
                    </>
                  ) : (
                    <textarea
                      className="it-textarea"
                      value={transcriptPreview}
                      readOnly
                    />
                  )}
                </div>
              )}
              {acousticPreview && activeTab === "acoustic" && (
                <div className="it-metrics">
                  <div>时长：{acousticPreview.durationSec.toFixed(2)}s</div>
                  <div>语速：{acousticPreview.speechRateWpm ?? "-"}</div>
                  <div>停顿次数：{acousticPreview.pauseCount}</div>
                  <div>平均停顿：{acousticPreview.pauseAvgSec}s</div>
                  <div>最长停顿：{acousticPreview.pauseMaxSec}s</div>
                  <div>RMS均值：{acousticPreview.rmsDbMean}dB</div>
                  <div>RMS波动：{acousticPreview.rmsDbStd}dB</div>
                  <div>SNR：{acousticPreview.snrDb ?? "-"}</div>
                </div>
              )}
              {activeTab === "evaluation" && (
                <div className="it-evaluation">
                  {questionText.trim() && (
                    <div className="it-evaluation__section">
                      <h4>题干材料</h4>
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        value={questionText}
                        readOnly
                      />
                    </div>
                  )}
                  {parsedQuestionList.length > 0 && (
                    <div className="it-evaluation__section">
                      <h4>题目列表</h4>
                      <ul>
                        {parsedQuestionList.map((item, idx) => (
                          <li key={`${idx}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {questionTimingsPreview && questionTimingsPreview.length > 0 ? (
                    <div className="it-question-timings">
                      <div className="it-question-timings__title">
                        题目用时
                      </div>
                      {questionTimingsPreview.map((item, idx) => (
                        <div key={`${idx}-${item.question}`} className="it-question-timings__item">
                          <div className="it-question-timings__label">
                            {idx + 1}. {item.question}
                          </div>
                          <div className="it-question-timings__value">
                            {`${it_formatSeconds(item.startSec)} - ${it_formatSeconds(item.endSec)} （用时 ${it_formatSeconds(item.durationSec)}${item.note ? `，${item.note}` : ""}）`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : questionTimingNotePreview ? (
                    <div className="it-question-timings">
                      <div className="it-question-timings__title">
                        题目用时
                      </div>
                      <div className="it-question-timings__item">
                        <div className="it-question-timings__label">状态</div>
                        <div className="it-question-timings__value">
                          {questionTimingNotePreview}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {evaluationPreview ? (
                    <>
                      <div className="it-evaluation__summary">
                        {evaluationPreview.topicSummary}
                      </div>
                      <div className="it-evaluation__overall">
                        <span>总分</span>
                        <span className="it-evaluation__overall-value">
                          {evaluationPreview.overallScore ?? "-"}
                        </span>
                      </div>
                      <div className="it-evaluation__scores">
                        {Object.entries(evaluationPreview.scores || {}).map(
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
                          {evaluationPreview.strengths.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="it-evaluation__section">
                        <h4>问题</h4>
                        <ul>
                          {evaluationPreview.issues.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="it-evaluation__section">
                        <h4>改进建议</h4>
                        <ul>
                          {evaluationPreview.improvements.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="it-evaluation__section">
                        <h4>练习重点</h4>
                        <ul>
                          {evaluationPreview.nextFocus.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      {evaluationPreview.revisedAnswers &&
                      evaluationPreview.revisedAnswers.length > 0 && (
                        <div className="it-evaluation__section">
                          <h4>示范性修改</h4>
                          <div className="it-revised-list">
                            {evaluationPreview.revisedAnswers.map((item, idx) => (
                              <div key={`${idx}-${item.question}`} className="it-revised-item">
                                <div className="it-revised-item__title">
                                  <span>
                                    {idx + 1}. {item.question}
                                    {typeof item.estimatedTimeMin === "number"
                                      ? `（建议${item.estimatedTimeMin}分钟）`
                                      : ""}
                                  </span>
                                  <button
                                    className="it-button it-button--compact"
                                    type="button"
                                    disabled={uiLocked || isProcessing || regeneratingIndex === idx}
                                    onClick={() => handleRegenerateDemoAnswer(idx)}
                                  >
                                    {regeneratingIndex === idx ? "生成中..." : "重新生成示范"}
                                  </button>
                                </div>
                                <div className="it-revised-item__block">
                                  <span>原回答：</span>
                                  {it_renderParagraphs(item.original, `${idx}-orig`)}
                                </div>
                                <div className="it-revised-item__block">
                                  <span>答题提纲（你的回答）：</span>
                                  {item.outlineOriginal && item.outlineOriginal.length > 0 ? (
                                    it_renderOutlineTree(
                                      it_buildOutlineTree(item.outlineOriginal),
                                      `${idx}-orig-outline`,
                                    )
                                  ) : (
                                    <span>（未提供）</span>
                                  )}
                                </div>
                                <div className="it-revised-item__block">
                                  <span>示范：</span>
                                  {it_renderParagraphs(item.revised, `${idx}-demo`)}
                                </div>
                                <div className="it-revised-item__block">
                                  <span>答题提纲（示范）：</span>
                                  {item.outlineRevised && item.outlineRevised.length > 0 ? (
                                    it_renderOutlineTree(
                                      it_buildOutlineTree(item.outlineRevised),
                                      `${idx}-demo-outline`,
                                    )
                                  ) : (
                                    <span>（未提供）</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {evaluationPreview.prompt && (
                        <div className="it-evaluation__section">
                          <div className="it-section-header">
                            <h4>示范答题提示词</h4>
                            <button
                              className="it-button it-button--secondary it-button--compact"
                              type="button"
                              onClick={() => setShowDemoPrompt((prev) => !prev)}
                            >
                              {showDemoPrompt ? "收起" : "展开"}
                            </button>
                          </div>
                          {showDemoPrompt && (
                            <textarea
                              className="it-textarea it-textarea--prompt"
                              value={evaluationPreview.prompt}
                              readOnly
                            />
                          )}
                        </div>
                      )}
                      {(evaluationPreview.raw || showRawOutput) && (
                        <div className="it-evaluation__section">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <h4 style={{ margin: 0 }}>原始输出</h4>
                            <button
                              className="it-button it-button--secondary it-button--compact"
                              disabled={!evaluationPreview.raw}
                              onClick={() => setShowRawOutput((prev) => !prev)}
                            >
                              {showRawOutput ? "收起" : "查看原始输出"}
                            </button>
                          </div>
                          {showRawOutput && (
                            <textarea
                              className="it-textarea it-textarea--prompt"
                              value={evaluationPreview.raw || ""}
                              readOnly
                            />
                          )}
                        </div>
                      )}
                      {evaluationPreview.noteUsage &&
                      evaluationPreview.noteUsage.length > 0 && (
                        <div className="it-evaluation__section">
                          <div className="it-section-header">
                            <h4>笔记引用</h4>
                            <button
                              className="it-button it-button--secondary it-button--compact"
                              type="button"
                              onClick={() => setShowNoteUsage((prev) => !prev)}
                            >
                              {showNoteUsage ? "收起" : "展开"}
                            </button>
                          </div>
                          {showNoteUsage && (
                            <ul>
                              {evaluationPreview.noteUsage.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {evaluationPreview.noteSuggestions &&
                      evaluationPreview.noteSuggestions.length > 0 && (
                        <div className="it-evaluation__section">
                          <div className="it-section-header">
                            <h4>可用素材/参考思路</h4>
                            <button
                              className="it-button it-button--secondary it-button--compact"
                              type="button"
                              onClick={() => setShowNoteSuggestions((prev) => !prev)}
                            >
                              {showNoteSuggestions ? "收起" : "展开"}
                            </button>
                          </div>
                          {showNoteSuggestions && (
                            <ul>
                              {evaluationPreview.noteSuggestions.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="it-placeholder">评价生成中...</div>
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

        </>
      )}

      {activePage === "settings" && (
        <div className="it-settings">
          <div className="it-settings__grid">
            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">提供者配置</div>
                  <div className="it-settings__desc">每个 Provider 独立文件，可包含 LLM/Embedding/ASR</div>
                </div>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 110 }}>Provider Key</div>
                <input
                  className="it-input"
                  value={providerDraft.id}
                  onChange={(event) =>
                    setProviderDraft((prev) => ({ ...prev, id: event.target.value }))
                  }
                  placeholder="例如 volc_doubao"
                />
                <div style={{ minWidth: 80 }}>显示名</div>
                <input
                  className="it-input"
                  value={providerDraft.name}
                  onChange={(event) =>
                    setProviderDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="可选"
                />
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || creatingProvider}
                  onClick={handleCreateProviderConfig}
                >
                  {creatingProvider ? "添加中..." : "添加提供者配置"}
                </button>
              </div>
              {providerCreateMessage && (
                <div className="it-settings__hint">{providerCreateMessage}</div>
              )}
              <div className="it-settings__hint" style={{ whiteSpace: "pre-wrap" }}>
                {"教程：Provider 文件在 `interview_trainer/providers/` 下。模板示例：\n" +
                  "provider: your_provider\n" +
                  "llm: { provider: your_provider, base_url: https://..., model: ..., api_key: ... }\n" +
                  "embedding: { provider: your_provider, base_url: https://..., model: ..., api_key: ... }\n" +
                  "asr: { provider: ..., base_url: ..., api_key: ..., secret_key: ... }"}
              </div>
              {providerList.length > 0 && (
                <div className="it-retrieval__list">
                  {providerList.map((item) => (
                    <div key={item} className="it-retrieval__item">
                      <div className="it-retrieval__label">{getProviderLabel(item)}</div>
                      <div className="it-retrieval__path">{item}</div>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked}
                        onClick={() => handleOpenProviderConfig(item)}
                      >
                        打开文件
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">通用配置</div>
                  <div className="it-settings__desc">ASR / LLM / 保存目录 · 直接在此修改</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--primary it-button--compact"
                    disabled={uiLocked || savingApiConfig}
                    onClick={handleSaveApiConfig}
                  >
                    {savingApiConfig ? "保存中..." : "保存接口配置"}
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={handleReloadConfig}
                  >
                    重载配置
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    onClick={() => request("it/openSettings", undefined)}
                  >
                    查看配置文件
                  </button>
                </div>
              </div>
              {config ? (
                <>
                  <div className="it-input-row">
                    <div style={{ minWidth: 64 }}>环境</div>
                    <input
                      className="it-input"
                      list="it-env-list"
                      value={apiForm.environment}
                      onChange={(event) =>
                        setApiForm((prev) => ({ ...prev, environment: event.target.value }))
                      }
                      placeholder="prod / test / dev"
                    />
                    <datalist id="it-env-list">
                      {(config.envList || []).map((env) => (
                        <option key={env} value={env} />
                      ))}
                    </datalist>
                    <span className="it-settings__hint">
                      可直接输入新环境名称，保存后自动创建并切换
                    </span>
                  </div>
                  <div className="it-settings__meta">
                    <span>ASR: {config.asrProvider}</span>
                    <span>LLM: {config.llmProvider}</span>
                    <span>当前环境: {config.activeEnvironment}</span>
                    <span>保存目录: {config.sessionsDir}</span>
                  </div>
                  <div className="it-settings__hint">
                    API Key 会保存到本地配置并同步到 VS Code Secret，请注意保管。
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div className="it-question">
                      <div className="it-settings__title">LLM（评分/问答）</div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Provider</div>
                        <select
                          className="it-select"
                          value={apiForm.llm.provider}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "provider", event.target.value)
                          }
                        >
                          {llmProviders.map((item) => (
                            <option key={item} value={item}>
                              {item === "heuristic" ? "heuristic（本地规则）" : getProviderLabel(item)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Model</div>
                        <input
                          className="it-input"
                          value={apiForm.llm.model}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "model", event.target.value)
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Base URL</div>
                        <input
                          className="it-input"
                          value={apiForm.llm.baseUrl}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "baseUrl", event.target.value)
                          }
                          placeholder="https://qianfan.baidubce.com/v2"
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>API Key</div>
                        <input
                          className="it-input"
                          type="text"
                          value={apiForm.llm.apiKey}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "apiKey", event.target.value)
                          }
                        />
                      </div>
                      <div className="it-input-row it-input-row--nowrap">
                        <div style={{ minWidth: 80 }}>温度</div>
                        <input
                          className="it-input"
                          type="number"
                          step="0.05"
                          value={apiForm.llm.temperature}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "temperature", Number(event.target.value))
                          }
                        />
                        <div style={{ minWidth: 70 }}>Top P</div>
                        <input
                          className="it-input"
                          type="number"
                          step="0.05"
                          value={apiForm.llm.topP}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "topP", Number(event.target.value))
                          }
                        />
                      </div>
                      <div className="it-input-row it-input-row--nowrap">
                        <div style={{ minWidth: 80 }}>超时(s)</div>
                        <input
                          className="it-input"
                          type="number"
                          value={apiForm.llm.timeoutSec}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "timeoutSec", Number(event.target.value))
                          }
                        />
                        <div style={{ minWidth: 80 }}>重试</div>
                        <input
                          className="it-input"
                          type="number"
                          value={apiForm.llm.maxRetries}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "maxRetries", Number(event.target.value))
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>防重复</div>
                        <label className="it-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(apiForm.llm.antiRepeat)}
                            onChange={(event) =>
                              handleApiFieldChange("llm", "antiRepeat", event.target.checked)
                            }
                          />
                          <span>加入随机标记</span>
                        </label>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Responses</div>
                        <label className="it-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(apiForm.llm.useResponses)}
                            onChange={(event) =>
                              handleApiFieldChange("llm", "useResponses", event.target.checked)
                            }
                          />
                          <span>启用 Responses API</span>
                        </label>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>前缀复用</div>
                        <label className="it-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(apiForm.llm.reusePrefix)}
                            onChange={(event) =>
                              handleApiFieldChange("llm", "reusePrefix", event.target.checked)
                            }
                          />
                          <span>仅复用提示词与题干</span>
                        </label>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>联网检索</div>
                        <label className="it-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(apiForm.llm.webSearch)}
                            onChange={(event) =>
                              handleApiFieldChange("llm", "webSearch", event.target.checked)
                            }
                          />
                          <span>启用 web_search</span>
                        </label>
                      </div>
                      <div className="it-input-row it-input-row--nowrap">
                        <div style={{ minWidth: 80 }}>深度思考</div>
                        <select
                          className="it-select"
                          value={apiForm.llm.reasoningEffort || "medium"}
                          onChange={(event) =>
                            handleApiFieldChange("llm", "reasoningEffort", event.target.value)
                          }
                        >
                          <option value="minimal">minimal</option>
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                        <div style={{ minWidth: 90 }}>输出上限</div>
                        <input
                          className="it-input"
                          type="number"
                          value={apiForm.llm.maxOutputTokens}
                          onChange={(event) =>
                            handleApiFieldChange(
                              "llm",
                              "maxOutputTokens",
                              Number(event.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="it-settings__hint">
                        Responses、深度思考与 web_search 会增加调用耗时与费用；前缀复用仅当前会话有效。
                      </div>
                      <div className="it-settings__actions">
                        <button
                          className="it-button it-button--secondary it-button--compact"
                          disabled={uiLocked || testingLlm}
                          onClick={handleTestLlm}
                        >
                          {testingLlm ? "测试中..." : "测试 LLM 接口"}
                        </button>
                      </div>
                      {llmTestMessage && (
                        <div className="it-settings__hint">{llmTestMessage}</div>
                      )}
                    </div>

                    <div className="it-question">
                      <div className="it-settings__title">ASR（语音转写）</div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Provider</div>
                        <select
                          className="it-select"
                          value={apiForm.asr.provider}
                          onChange={(event) =>
                            handleApiFieldChange("asr", "provider", event.target.value)
                          }
                        >
                          {asrProviders.map((item) => (
                            <option key={item} value={item}>
                              {item === "mock" ? "mock（使用示例文本）" : getProviderLabel(item)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Base URL</div>
                        <input
                          className="it-input"
                          value={apiForm.asr.baseUrl}
                          onChange={(event) =>
                            handleApiFieldChange("asr", "baseUrl", event.target.value)
                          }
                          placeholder="https://vop.baidu.com/server_api"
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>API Key</div>
                        <input
                          className="it-input"
                          type="text"
                          value={apiForm.asr.apiKey}
                          onChange={(event) =>
                            handleApiFieldChange("asr", "apiKey", event.target.value)
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Secret</div>
                        <input
                          className="it-input"
                          type="text"
                          value={apiForm.asr.secretKey}
                          onChange={(event) =>
                            handleApiFieldChange("asr", "secretKey", event.target.value)
                          }
                        />
                      </div>
                      <div className="it-input-row it-input-row--pairs">
                        <div className="it-input-pair">
                          <div>语言</div>
                          <input
                            className="it-input"
                            value={apiForm.asr.language}
                            onChange={(event) =>
                              handleApiFieldChange("asr", "language", event.target.value)
                            }
                          />
                        </div>
                        <div className="it-input-pair">
                          <div>dev_pid</div>
                          <input
                            className="it-input"
                            type="number"
                            value={apiForm.asr.devPid}
                            onChange={(event) =>
                              handleApiFieldChange("asr", "devPid", Number(event.target.value))
                            }
                          />
                        </div>
                      </div>
                      <div className="it-input-row it-input-row--pairs">
                        <div className="it-input-pair">
                          <div>分片(s)</div>
                          <input
                            className="it-input"
                            type="number"
                            value={apiForm.asr.maxChunkSec}
                            onChange={(event) =>
                              handleApiFieldChange("asr", "maxChunkSec", Number(event.target.value))
                            }
                          />
                        </div>
                        <div className="it-input-pair">
                          <div>并发</div>
                          <input
                            className="it-input"
                            type="number"
                            value={apiForm.asr.maxConcurrency}
                            onChange={(event) =>
                              handleApiFieldChange(
                                "asr",
                                "maxConcurrency",
                                Number(event.target.value),
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="it-input-row it-input-row--pairs">
                        <div className="it-input-pair">
                          <div>超时(s)</div>
                          <input
                            className="it-input"
                            type="number"
                            value={apiForm.asr.timeoutSec}
                            onChange={(event) =>
                              handleApiFieldChange("asr", "timeoutSec", Number(event.target.value))
                            }
                          />
                        </div>
                        <div className="it-input-pair">
                          <div>重试</div>
                          <input
                            className="it-input"
                            type="number"
                            value={apiForm.asr.maxRetries}
                            onChange={(event) =>
                              handleApiFieldChange("asr", "maxRetries", Number(event.target.value))
                            }
                          />
                        </div>
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 80 }}>Mock 文本</div>
                        <input
                          className="it-input"
                          value={apiForm.asr.mockText}
                        onChange={(event) =>
                          handleApiFieldChange("asr", "mockText", event.target.value)
                        }
                        placeholder="仅在 provider=mock 时使用"
                      />
                    </div>
                    <div className="it-settings__actions">
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || testingAsr}
                        onClick={handleTestAsr}
                      >
                        {testingAsr ? "测试中..." : "测试 ASR 接口"}
                      </button>
                    </div>
                    {asrTestMessage && (
                      <div className="it-settings__hint">{asrTestMessage}</div>
                    )}
                    {asrTestRaw && (
                      <pre className="it-settings__raw">{asrTestRaw}</pre>
                    )}
                  </div>
                </div>
                  {apiSaveMessage && <div className="it-settings__hint">{apiSaveMessage}</div>}
                </>
              ) : (
                <div className="it-placeholder">配置加载中...</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">评分提示词</div>
                  <div className="it-settings__desc">严格高标准，不输出安慰语</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("evaluation")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <textarea
                className="it-textarea it-textarea--prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
              />
              {promptSaveScope === "evaluation" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">示范答案提示词</div>
                  <div className="it-settings__desc">控制总时长≤10分钟，公务员思维、结构清晰</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("demo")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <textarea
                className="it-textarea it-textarea--prompt"
                value={demoPrompt}
                onChange={(event) => setDemoPrompt(event.target.value)}
              />
              <div className="it-input-row">
                <div style={{ minWidth: 120 }}>示范生成方式</div>
                <select
                  className="it-select"
                  value={answerMode}
                  onChange={(event) =>
                    setAnswerMode(event.target.value === "single" ? "single" : "two-step")
                  }
                >
                  <option value="two-step">两步法：先提纲后整篇</option>
                  <option value="single">单次：提纲+整篇一次输出</option>
                </select>
              </div>
              <div className="it-settings__hint">
                两步法会额外调用一次 LLM，成本与耗时更高，但更稳定。
              </div>
              {promptSaveScope === "demo" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">每题独立提示词（最多3题）</div>
                  <div className="it-settings__desc">持久化保存，逐题覆盖总体提示词</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("per-question")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <div className="it-question-prompts">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="it-question-prompts__item">
                    <div className="it-question-prompts__title">第 {idx + 1} 题</div>
                    <div className="it-question-prompts__pair">
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        placeholder="本题评分提示词（可选）"
                        value={perQuestionSystemPrompts[idx] || ""}
                        onChange={(event) => {
                          const next = [...perQuestionSystemPrompts];
                          next[idx] = event.target.value;
                          setPerQuestionSystemPrompts(next);
                        }}
                      />
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        placeholder="本题示范提示词（可选）"
                        value={perQuestionDemoPrompts[idx] || ""}
                        onChange={(event) => {
                          const next = [...perQuestionDemoPrompts];
                          next[idx] = event.target.value;
                          setPerQuestionDemoPrompts(next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {promptSaveScope === "per-question" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">输入设备</div>
                  <div className="it-settings__desc">选择录音采集的麦克风来源</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={handleRefreshInputs}
                  >
                    刷新列表
                  </button>
                </div>
              </div>
              <div className="it-input-row">
                <select
                  className="it-select"
                  value={selectedInput}
                  onChange={(event) => setSelectedInput(event.target.value)}
                  disabled={uiLocked}
                >
                  <option value="">系统默认</option>
                  {nativeInputs.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="it-settings__hint">
                未选择时使用系统默认输入设备；若需要手动指定 ffmpeg 输入，可在环境变量 IT_FFMPEG_INPUT 中填 audio=设备名。
              </div>
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">检索配置</div>
                  <div className="it-settings__desc">知识库目录与开关</div>
                </div>
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
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>模式</div>
                <select
                  className="it-select"
                  value={retrievalForm.mode}
                  disabled={uiLocked}
                  onChange={(event) => handleRetrievalFieldChange("mode", event.target.value)}
                >
                  <option value="vector">向量语义</option>
                  <option value="keyword">词面匹配</option>
                </select>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>Top K</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topK}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topK", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>Min Score</div>
                <input
                  className="it-input"
                  type="number"
                  step="0.05"
                  value={retrievalForm.minScore}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("minScore", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>检索并行</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.maxConcurrency}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange(
                      "maxConcurrency",
                      Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>笔记TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKNotes}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKNotes", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>知识库TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKKnowledge}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKKnowledge", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>评分标准TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKRubrics}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKRubrics", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>示例答案TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKExamples}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKExamples", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>Provider</div>
                <select
                  className="it-select"
                  value={retrievalForm.vector.provider}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("provider", event.target.value)
                  }
                >
                  {embeddingProviders.map((item) => (
                    <option key={item} value={item}>
                      {getProviderLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>Model</div>
                <input
                  className="it-input"
                  value={retrievalForm.vector.model}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("model", event.target.value)
                  }
                  placeholder="按平台填写 embedding 模型"
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>Base URL</div>
                <input
                  className="it-input"
                  value={retrievalForm.vector.baseUrl}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("baseUrl", event.target.value)
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>API Key</div>
                <input
                  className="it-input"
                  value={retrievalForm.vector.apiKey}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("apiKey", event.target.value)
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>超时(s)</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.timeoutSec}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("timeoutSec", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 70 }}>重试</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.maxRetries}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("maxRetries", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>批大小</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.batchSize}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("batchSize", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 80 }}>Query 上限</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.queryMaxChars}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("queryMaxChars", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>学习并行</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.embeddingMaxConcurrency}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalFieldChange(
                      "embeddingMaxConcurrency",
                      Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="it-settings__actions">
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingRetrieval}
                  onClick={handleSaveRetrievalSettings}
                >
                  {savingRetrieval ? "保存中..." : "保存检索配置"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || testingEmbedding}
                  onClick={handleTestEmbedding}
                >
                  {testingEmbedding ? "测试中..." : "测试 Embedding 接口"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || clearingEmbeddingCache}
                  onClick={handleClearEmbeddingCache}
                >
                  {clearingEmbeddingCache ? "清理中..." : "清理向量缓存"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || clearingCorpusCache}
                  onClick={handleClearCorpusCache}
                >
                  {clearingCorpusCache ? "清理中..." : "清理语料索引缓存"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || traceLogEnabled}
                  onClick={handleEnableTraceLogs}
                >
                  {traceLogEnabled ? "日志已开启" : "开启日志输出"}
                </button>
              </div>
              {retrievalSaveMessage && (
                <div className="it-settings__hint">{retrievalSaveMessage}</div>
              )}
              {embeddingTestMessage && (
                <div className="it-settings__hint">{embeddingTestMessage}</div>
              )}
              {embeddingCacheMessage && (
                <div className="it-settings__hint">{embeddingCacheMessage}</div>
              )}
              {corpusCacheMessage && (
                <div className="it-settings__hint">{corpusCacheMessage}</div>
              )}
              {showEmbeddingWarmup && embeddingWarmup && (
                <div className="it-progress it-progress--compact">
                  <div className="it-progress__label">
                    <span>向量预计算</span>
                    <span>
                      {embeddingWarmup.message ||
                        `${embeddingWarmup.done}/${embeddingWarmup.total}`}
                    </span>
                  </div>
                  <div className="it-progress__bar">
                    <div
                      className="it-progress__fill"
                      style={{ width: `${embeddingWarmup.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="it-settings__hint">
                索引与向量缓存会落盘保存，目录变更后会自动重新索引。
              </div>
              <div className="it-settings__hint">
                需要排查笔记学习时，点击“开启日志输出”后会在输出面板显示相关日志。
              </div>
              {retrievalCacheInfo && (
                <>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>语料缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {corpusCachePath || "-"}
                    </div>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>向量缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {embeddingCachePath || "-"}
                    </div>
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>缓存上限</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof corpusCacheMb === "number" ? `${corpusCacheMb} MB` : "-"}
                    </div>
                    <div style={{ minWidth: 80 }}>并发</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof maxConcurrency === "number" ? maxConcurrency : "-"}
                    </div>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>Query 缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof queryCacheSize === "number" ? queryCacheSize : "-"}
                    </div>
                  </div>
                </>
              )}
              <div className="it-settings__hint">
                向量检索会调用 embedding 接口，模型名称请按平台实际填入。
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>保存目录</div>
                <div className="it-settings__meta" style={{ flex: 1 }}>
                  {config?.sessionsDir || "sessions"}
                </div>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked}
                  onClick={() => request("it/selectSessionsDir", undefined)}
                >
                  选择保存目录
                </button>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>历史命名</div>
                <select
                  className="it-select"
                  value={topicTitleMode}
                  disabled={uiLocked || savingTopicSettings}
                  onChange={(event) =>
                    setTopicTitleMode(event.target.value === "simple" ? "simple" : "llm")
                  }
                >
                  <option value="llm">LLM 摘要</option>
                  <option value="simple">题干前缀</option>
                </select>
                <div style={{ minWidth: 60 }}>长度</div>
                <input
                  className="it-input"
                  type="number"
                  min={4}
                  max={18}
                  value={topicTitleLen}
                  disabled={uiLocked || savingTopicSettings}
                  onChange={(event) => setTopicTitleLen(Number(event.target.value))}
                  style={{ width: 90 }}
                />
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingTopicSettings}
                  onClick={handleSaveTopicSettings}
                >
                  {savingTopicSettings ? "保存中..." : "保存命名"}
                </button>
              </div>
              <div className="it-settings__hint">
                选择“LLM 摘要”会额外调用一次 LLM，增加耗时与费用。
              </div>
              {topicSaveMessage && (
                <div className="it-settings__hint">{topicSaveMessage}</div>
              )}
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

          </div>
        </div>
      )}

    </div>
  );
};

export default InterviewTrainer;
