import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItApiTemplate,
  ItConfigSnapshot,
  ItHistoryItem,
  ItState,
  ItStepState,
  ItTemplateBindings,
  ItTemplateCategory,
  ItTemplateParamCatalog,
  ItTemplateParamUsage,
} from "./types";
import { on, request } from "./messenger";
import { StreamCard } from "./components/StreamCard";
import { SettingsPage } from "./components/settings/SettingsPage";
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

function it_cloneTemplate(template: ItApiTemplate): ItApiTemplate {
  return JSON.parse(JSON.stringify(template)) as ItApiTemplate;
}

function it_formatJson(value: unknown, fallback = "{}"): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function it_parseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  const [streamingSettings, setStreamingSettings] = useState({
    enabled: true,
    autoCollapse: true,
    previewChars: 200,
  });
  const [templateCategory, setTemplateCategory] = useState<ItTemplateCategory>("llm");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateDraft, setTemplateDraft] = useState<ItApiTemplate | null>(null);
  const [templateDraftOrigin, setTemplateDraftOrigin] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateJsonDraft, setTemplateJsonDraft] = useState({
    headers: "{\n  \"Content-Type\": \"application/json\"\n}",
    query: "{}",
    body: "{}",
  });
  const [templateJsonErrors, setTemplateJsonErrors] = useState<
    Partial<Record<"headers" | "query" | "body", string>>
  >({});
  const [templateSaveMessage, setTemplateSaveMessage] = useState<string | null>(null);
  const [templateBindings, setTemplateBindings] = useState<ItTemplateBindings>({
    llm: {},
    asr: {},
    embedding: {},
  });
  const [templateParamOptions, setTemplateParamOptions] = useState<string[]>([]);
  const [templateParamInput, setTemplateParamInput] = useState("");
  const [templateSecrets, setTemplateSecrets] = useState<string[]>([]);
  const [secretDraft, setSecretDraft] = useState({ name: "", value: "" });
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [envDraftName, setEnvDraftName] = useState("");
  const [envMessage, setEnvMessage] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingBindings, setSavingBindings] = useState(false);
  const [savingParamOptions, setSavingParamOptions] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [savingEnvironment, setSavingEnvironment] = useState(false);
  const [savingLlmParams, setSavingLlmParams] = useState(false);
  const [savingAsrParams, setSavingAsrParams] = useState(false);
  const [llmParamsMessage, setLlmParamsMessage] = useState<string | null>(null);
  const [asrParamsMessage, setAsrParamsMessage] = useState<string | null>(null);
  const [stepStreams, setStepStreams] = useState<
    Record<
      string,
      {
        text: string;
        collapsed: boolean;
        done?: boolean;
      }
    >
  >({});
  const [evaluationStreams, setEvaluationStreams] = useState<
    Record<
      number,
      {
        text: string;
        collapsed: boolean;
        done?: boolean;
      }
    >
  >({});
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
  const [apiForm, setApiForm] = useState({
    llm: {
      model: "",
      reasoningEffort: "",
      webSearch: false,
      stream: true,
      timeoutSec: 60,
      maxRetries: 1,
      antiRepeat: false,
      reusePrefix: false,
    },
    asr: {
      language: "zh",
      devPid: 1537,
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
      batchSize: 16,
      queryMaxChars: 1500,
    },
  });
  const [savingRetrieval, setSavingRetrieval] = useState(false);
  const [retrievalSaveMessage, setRetrievalSaveMessage] = useState<string | null>(null);
  const [clearingEmbeddingCache, setClearingEmbeddingCache] = useState(false);
  const [embeddingCacheMessage, setEmbeddingCacheMessage] = useState<string | null>(
    null,
  );
  const [clearingCorpusCache, setClearingCorpusCache] = useState(false);
  const [corpusCacheMessage, setCorpusCacheMessage] = useState<string | null>(null);
  const [traceLogEnabled, setTraceLogEnabled] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [saveResultMessage, setSaveResultMessage] = useState<string | null>(null);
  const [promptSaveMessage, setPromptSaveMessage] = useState<string | null>(null);
  const [promptSaveScope, setPromptSaveScope] = useState<
    "evaluation" | "demo" | "per-question" | null
  >(null);
  const [topicTitleMode, setTopicTitleMode] = useState<"llm" | "simple">("llm");
  const [topicTitleLen, setTopicTitleLen] = useState(18);
  const [savingTopicSettings, setSavingTopicSettings] = useState(false);
  const [topicSaveMessage, setTopicSaveMessage] = useState<string | null>(null);
  const [savingStreamingSettings, setSavingStreamingSettings] = useState(false);
  const [streamingSaveMessage, setStreamingSaveMessage] = useState<string | null>(
    null,
  );
  const [showRawOutput, setShowRawOutput] = useState(false);
  const applyProfileToForm = useCallback((cfg: ItConfigSnapshot | null) => {
    if (!cfg) return;
    setApiForm((prev) => ({
      ...prev,
      llm: {
        ...prev.llm,
        model: cfg.llm?.model || "",
        reasoningEffort: cfg.llm?.reasoningEffort || "",
        webSearch: Boolean(cfg.llm?.webSearch ?? false),
        stream: Boolean(cfg.llm?.stream ?? true),
        timeoutSec: Number(cfg.llm?.timeoutSec ?? 60),
        maxRetries: Number(cfg.llm?.maxRetries ?? 1),
        antiRepeat: Boolean(cfg.llm?.antiRepeat ?? false),
        reusePrefix: Boolean(cfg.llm?.reusePrefix ?? false),
      },
      asr: {
        ...prev.asr,
        language: cfg.asr?.language || "zh",
        devPid: Number(cfg.asr?.devPid ?? 1537),
        maxChunkSec: Number(cfg.asr?.maxChunkSec ?? 50),
        maxConcurrency: Number(cfg.asr?.maxConcurrency ?? 1),
        timeoutSec: Number(cfg.asr?.timeoutSec ?? 120),
        maxRetries: Number(cfg.asr?.maxRetries ?? 1),
      },
    }));
  }, []);
  const applyRetrievalToForm = useCallback((cfg: ItConfigSnapshot | null) => {
    if (!cfg) return;
    const retrieval = cfg.retrieval || ({} as ItConfigSnapshot["retrieval"]);
    const vector = retrieval.vector || ({} as ItConfigSnapshot["retrieval"]["vector"]);
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
  const templatesSnapshot = config?.templates;
  const templatesList = useMemo(
    () => templatesSnapshot?.templates ?? [],
    [templatesSnapshot],
  );
  const templatesByCategory = useMemo(
    () =>
      templatesList.filter((template) => template.category === templateCategory),
    [templatesList, templateCategory],
  );
  const selectedTemplate = useMemo(
    () => templatesList.find((item) => item.id === selectedTemplateId) || null,
    [templatesList, selectedTemplateId],
  );
  const templateParamCatalog: ItTemplateParamCatalog | undefined =
    templatesSnapshot?.paramCatalog;
  const templateParamUsage: ItTemplateParamUsage | undefined =
    templatesSnapshot?.paramUsage?.[selectedTemplate?.id || ""];
  const paramCatalogList = useMemo(() => {
    const common = templateParamCatalog?.common ?? [];
    const scoped =
      templateCategory === "llm"
        ? templateParamCatalog?.llm ?? []
        : templateCategory === "asr"
          ? templateParamCatalog?.asr ?? []
          : templateCategory === "embedding"
            ? templateParamCatalog?.embedding ?? []
            : [];
    return Array.from(new Set([...common, ...scoped]));
  }, [templateParamCatalog, templateCategory]);
  const templateUsageSets = useMemo(
    () => ({
      used: new Set(templateParamUsage?.used ?? []),
      unused: new Set(templateParamUsage?.unused ?? []),
      unknown: new Set(templateParamUsage?.unknown ?? []),
      empty: new Set(templateParamUsage?.empty ?? []),
    }),
    [templateParamUsage],
  );
  const llmTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "llm"),
    [templatesList],
  );
  const asrTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "asr"),
    [templatesList],
  );
  const embeddingTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "embedding"),
    [templatesList],
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
          llmTasks: {
            questionParse: "",
            segment: "",
            evaluation: "",
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
            useResponses: false,
            apiMode: "chat",
            responsesPath: "/v1/responses",
            toolsPreset: "",
            webSearch: false,
            reasoningEffort: "medium",
            maxOutputTokens: 800,
            reusePrefix: false,
            stream: true,
          },
          templates: {
            templates: [],
            bindings: { llm: {}, asr: {}, embedding: {} },
            paramCatalog: {
              common: ["apiKey", "secretKey", "timeoutSec", "stream"],
              llm: [
                "model",
                "messages",
                "input",
                "instructions",
                "temperature",
                "topP",
                "reasoningEffort",
                "maxOutputTokens",
                "webSearch",
                "reusePrefix",
              ],
              asr: ["audioFile", "asr.lang", "asr.dev_pid"],
              embedding: ["embeddingInput", "model"],
            },
            paramUsage: {},
            paramOptions: { reasoningEffort: ["low", "medium", "high", "xhigh"] },
            secretNames: [],
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
    if (config.streaming) {
      const nextPreview = Number(config.streaming.previewChars ?? 200);
      setStreamingSettings({
        enabled: config.streaming.enabled !== false,
        autoCollapse: config.streaming.autoCollapse !== false,
        previewChars: Number.isFinite(nextPreview) ? Math.max(50, nextPreview) : 200,
      });
    }
    if (config.templates) {
      setTemplateBindings(config.templates.bindings || { llm: {}, asr: {}, embedding: {} });
      setTemplateParamOptions(
        config.templates.paramOptions?.reasoningEffort ?? ["low", "medium", "high", "xhigh"],
      );
      setTemplateSecrets(config.templates.secretNames ?? []);
    }
  }, [config, applyProfileToForm, applyRetrievalToForm]);

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!templatesByCategory.length) {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    if (!selectedTemplateId || !templatesByCategory.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(templatesByCategory[0].id);
    }
  }, [templatesByCategory, selectedTemplateId, isCreatingTemplate]);

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!selectedTemplate) {
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    setTemplateDraft(it_cloneTemplate(selectedTemplate));
    setTemplateDraftOrigin(selectedTemplate.id);
    setTemplateJsonDraft({
      headers: it_formatJson(selectedTemplate.request?.headers, "{}"),
      query: it_formatJson(selectedTemplate.request?.query, "{}"),
      body: it_formatJson(selectedTemplate.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
  }, [selectedTemplate, isCreatingTemplate]);

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
    const disposeStream = on("it/stepStreamUpdate", (data) => {
      if (!streamingSettings.enabled) {
        return;
      }
      const step = String(data?.step || "");
      if (!step) {
        return;
      }
      setStepStreams((prev) => {
        const current = prev[step] || { text: "", collapsed: false, done: false };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const previewLimit = Math.max(50, streamingSettings.previewChars || 200);
        const nextText =
          rawText.length > previewLimit ? rawText.slice(-previewLimit) : rawText;
        let collapsed = reset ? false : current.collapsed;
        if (done && streamingSettings.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [step]: {
            text: nextText,
            collapsed,
            done,
          },
        };
      });
    });
    return () => {
      disposeStream();
    };
  }, [on, streamingSettings.enabled, streamingSettings.autoCollapse, streamingSettings.previewChars]);

  useEffect(() => {
    const disposeStream = on("it/evaluationStreamUpdate", (data) => {
      if (!streamingSettings.enabled) {
        return;
      }
      const index = Number(data?.questionIndex ?? 0);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      setEvaluationStreams((prev) => {
        const current = prev[index] || { text: "", collapsed: false, done: false };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const previewLimit = Math.max(50, streamingSettings.previewChars || 200);
        const nextText =
          rawText.length > previewLimit ? rawText.slice(-previewLimit) : rawText;
        let collapsed = reset ? false : current.collapsed;
        if (done && streamingSettings.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [index]: {
            text: nextText,
            collapsed,
            done,
          },
        };
      });
    });
    return () => {
      disposeStream();
    };
  }, [on, streamingSettings.enabled, streamingSettings.autoCollapse, streamingSettings.previewChars]);

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
  const evaluationStreamQuestions = useMemo(() => {
    const list =
      (analysisResult?.questionList && analysisResult.questionList.length
        ? analysisResult.questionList
        : parsedQuestionList) || [];
    if (list.length) {
      return list.slice(0, 3);
    }
    const fallback = questionText.trim();
    return fallback ? [fallback] : [];
  }, [analysisResult, parsedQuestionList, questionText]);
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
    setStepStreams({});
    setEvaluationStreams({});
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
      setEvaluationStreams((prev) => ({
        ...prev,
        [index]: { text: "", collapsed: false, done: false },
      }));
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
          questionIndex: index,
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

  const handleSaveResult = async () => {
    if (!analysisResult) {
      setSaveResultMessage("暂无可保存的结果");
      return;
    }
    setSavingResult(true);
    setSaveResultMessage(null);
    try {
      const resp = await request("it/saveCurrentResult", {
        response: analysisResult,
        questionText: questionText.trim(),
        questionList: parsedQuestionList,
        topicTitle: analysisResult.evaluation?.topicTitle || "",
      });
      if (resp?.status === "success") {
        setSaveResultMessage("结果已写入");
      } else {
        setSaveResultMessage("保存失败，请重试");
      }
    } catch (err) {
      setSaveResultMessage(
        `保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingResult(false);
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
    setLlmParamsMessage(null);
    setAsrParamsMessage(null);
    setApiForm((prev) => ({
      ...prev,
      [scope]: {
        ...prev[scope],
        [key]: value,
      },
    }));
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
  const handleSaveStreamingSettings = async () => {
    setSavingStreamingSettings(true);
    setStreamingSaveMessage(null);
    try {
      const resp = await request("it/updateStreamingSettings", {
        streaming: {
          enabled: Boolean(streamingSettings.enabled),
          autoCollapse: Boolean(streamingSettings.autoCollapse),
          previewChars: Number(streamingSettings.previewChars),
        },
      });
      if (resp?.status === "success") {
        if (resp.content?.streaming) {
          const preview = Number(resp.content.streaming.previewChars ?? 200);
          setStreamingSettings({
            enabled: resp.content.streaming.enabled !== false,
            autoCollapse: resp.content.streaming.autoCollapse !== false,
            previewChars: Number.isFinite(preview) ? Math.max(50, preview) : 200,
          });
        }
        setStreamingSaveMessage("实时输出设置已保存");
      } else {
        setStreamingSaveMessage("实时输出设置保存失败，请重试。");
      }
    } catch (err) {
      setStreamingSaveMessage(
        `实时输出设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingStreamingSettings(false);
  };
  const buildDefaultTemplate = useCallback(
    (category: ItTemplateCategory): ItApiTemplate => {
      const mode = category === "llm" ? "sse" : "json";
      return {
        id: "",
        name: "",
        category,
        request: {
          method: "POST",
          url: "",
          headers: {
            Authorization: "Bearer {{apiKey}}",
            "Content-Type": "application/json",
          },
          body: {},
          stream: mode === "sse",
        },
        response: {
          mode,
          textPath: "",
        },
        streaming:
          mode === "sse"
            ? {
                eventDelimiter: "\n\n",
                dataPrefix: "data:",
                deltaPath: "",
                doneSignals: ["[DONE]"],
              }
            : undefined,
        updatedAt: new Date().toISOString(),
      };
    },
    [],
  );
  const updateTemplateRequest = useCallback(
    (patch: Partial<ItApiTemplate["request"]>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              request: {
                ...(prev.request || { method: "POST", url: "" }),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const updateTemplateResponse = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["response"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              response: {
                ...(prev.response || { mode: "json" }),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const updateTemplateStreaming = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["streaming"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              streaming: {
                ...(prev.streaming || {}),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const handleCreateTemplate = useCallback(() => {
    const next = buildDefaultTemplate(templateCategory);
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: it_formatJson(next.request?.headers, "{}"),
      query: it_formatJson(next.request?.query, "{}"),
      body: it_formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [buildDefaultTemplate, templateCategory]);
  const handleDuplicateTemplate = useCallback(() => {
    if (!selectedTemplate) {
      return;
    }
    const next = it_cloneTemplate(selectedTemplate);
    next.id = "";
    next.name = `${next.name || selectedTemplate.id}-copy`;
    next.updatedAt = new Date().toISOString();
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: it_formatJson(next.request?.headers, "{}"),
      query: it_formatJson(next.request?.query, "{}"),
      body: it_formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [selectedTemplate]);
  const handleCancelTemplateDraft = useCallback(() => {
    setIsCreatingTemplate(false);
    setTemplateSaveMessage(null);
    if (templatesByCategory.length) {
      setSelectedTemplateId(templatesByCategory[0].id);
    } else {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
    }
  }, [templatesByCategory]);
  const handleSaveTemplate = async () => {
    if (!templateDraft) {
      return;
    }
    const id = String(templateDraft.id || "").trim();
    if (!id) {
      setTemplateSaveMessage("请填写模板 ID。");
      return;
    }
    const headersParsed = it_parseJson(templateJsonDraft.headers);
    const queryParsed = it_parseJson(templateJsonDraft.query);
    const bodyParsed = it_parseJson(templateJsonDraft.body);
    const errors: Partial<Record<"headers" | "query" | "body", string>> = {};
    if (!headersParsed.ok) {
      errors.headers = headersParsed.error;
    }
    if (!queryParsed.ok) {
      errors.query = queryParsed.error;
    }
    if (!bodyParsed.ok) {
      errors.body = bodyParsed.error;
    }
    setTemplateJsonErrors(errors);
    if (Object.keys(errors).length) {
      setTemplateSaveMessage("模板 JSON 格式错误，请修正后再保存。");
      return;
    }
    const responseMode = templateDraft.response?.mode || "json";
    const nextTemplate: ItApiTemplate = {
      ...templateDraft,
      id,
      name: String(templateDraft.name || id).trim() || id,
      request: {
        ...(templateDraft.request || { method: "POST", url: "" }),
        headers: headersParsed.ok ? headersParsed.value : undefined,
        query: queryParsed.ok ? queryParsed.value : undefined,
        body: bodyParsed.ok ? bodyParsed.value : undefined,
      },
      response: {
        mode: responseMode,
        textPath: templateDraft.response?.textPath || undefined,
        jsonPath: templateDraft.response?.jsonPath || undefined,
        errorPath: templateDraft.response?.errorPath || undefined,
        statusPath: templateDraft.response?.statusPath || undefined,
        doneSignal: templateDraft.response?.doneSignal || undefined,
      },
      streaming:
        responseMode === "sse"
          ? {
              eventDelimiter: templateDraft.streaming?.eventDelimiter || undefined,
              dataPrefix: templateDraft.streaming?.dataPrefix || undefined,
              deltaPath: templateDraft.streaming?.deltaPath || undefined,
              doneSignals:
                templateDraft.streaming?.doneSignals &&
                templateDraft.streaming.doneSignals.filter(Boolean).length
                  ? templateDraft.streaming.doneSignals.filter(Boolean)
                  : undefined,
              heartbeatPattern: templateDraft.streaming?.heartbeatPattern || undefined,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/saveTemplate", { template: nextTemplate });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setIsCreatingTemplate(false);
        setSelectedTemplateId(nextTemplate.id);
        setTemplateSaveMessage("模板已保存。");
      } else {
        setTemplateSaveMessage("模板保存失败，请检查输入。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `模板保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTemplate(false);
  };
  const handleDeleteTemplate = async () => {
    const templateId = selectedTemplate?.id || "";
    if (!templateId) {
      return;
    }
    const confirmed = window.confirm(`确认删除模板 ${templateId}？`);
    if (!confirmed) {
      return;
    }
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/deleteTemplate", { templateId });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("模板已删除。");
      } else {
        setTemplateSaveMessage("删除失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `删除失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTemplate(false);
  };
  const handleSaveTemplateBindings = async () => {
    setSavingBindings(true);
    try {
      const resp = await request("it/saveTemplateBindings", { bindings: templateBindings });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("绑定已保存。");
      } else {
        setTemplateSaveMessage("绑定保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `绑定保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingBindings(false);
  };
  const handleSaveParamOptions = async () => {
    setSavingParamOptions(true);
    try {
      const options = Array.from(new Set(templateParamOptions.map((item) => String(item).trim())))
        .filter(Boolean);
      const resp = await request("it/saveTemplateParamOptions", {
        options: { reasoning_effort: options },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("参数选项已保存。");
      } else {
        setTemplateSaveMessage("参数选项保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `参数选项保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingParamOptions(false);
  };
  const handleAddParamOption = () => {
    const raw = templateParamInput.trim();
    if (!raw) {
      return;
    }
    if (!templateParamOptions.includes(raw)) {
      setTemplateParamOptions((prev) => [...prev, raw]);
    }
    setTemplateParamInput("");
  };
  const handleSaveSecret = async () => {
    const name = secretDraft.name.trim();
    if (!name) {
      setSecretMessage("请填写密钥名称。");
      return;
    }
    setSavingSecret(true);
    setSecretMessage(null);
    try {
      const resp = await request("it/saveTemplateSecret", {
        name,
        value: secretDraft.value,
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setSecretMessage("密钥已保存。");
        setSecretDraft({ name: "", value: "" });
      } else {
        setSecretMessage("密钥保存失败，请重试。");
      }
    } catch (err) {
      setSecretMessage(`密钥保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingSecret(false);
  };
  const handleDeleteSecret = async (name: string) => {
    const confirmed = window.confirm(`确认删除密钥 ${name}？`);
    if (!confirmed) {
      return;
    }
    setSavingSecret(true);
    setSecretMessage(null);
    try {
      const resp = await request("it/deleteTemplateSecret", { name });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setSecretMessage("密钥已删除。");
      } else {
        setSecretMessage("密钥删除失败，请重试。");
      }
    } catch (err) {
      setSecretMessage(`密钥删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingSecret(false);
  };
  const handleSetActiveEnvironment = async (environment: string) => {
    if (!environment) {
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/setActiveEnvironment", { environment });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvMessage(`已切换到 ${environment}`);
      } else {
        setEnvMessage("环境切换失败。");
      }
    } catch (err) {
      setEnvMessage(`环境切换失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleCreateEnvironment = async (cloneFrom?: string) => {
    const environment = envDraftName.trim();
    if (!environment) {
      setEnvMessage("请填写环境名称。");
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/createTemplateEnvironment", {
        environment,
        cloneFrom: cloneFrom || "",
      });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvDraftName("");
        setEnvMessage("环境已创建并切换。");
      } else {
        setEnvMessage("环境创建失败。");
      }
    } catch (err) {
      setEnvMessage(`环境创建失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleDeleteEnvironment = async (environment: string) => {
    if (!environment) {
      return;
    }
    const confirmed = window.confirm(`确认删除环境 ${environment}？`);
    if (!confirmed) {
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/deleteTemplateEnvironment", { environment });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvMessage("环境已删除。");
      } else {
        setEnvMessage("环境删除失败。");
      }
    } catch (err) {
      setEnvMessage(`环境删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleSaveLlmParams = async () => {
    setSavingLlmParams(true);
    setLlmParamsMessage(null);
    try {
      const reasoningEffort = String(apiForm.llm.reasoningEffort || "").trim();
      const resp = await request("it/updateApiSettings", {
        environment: config?.activeEnvironment,
        llm: {
          model: apiForm.llm.model,
          reasoningEffort: reasoningEffort || undefined,
          timeoutSec: Number(apiForm.llm.timeoutSec),
          maxRetries: Number(apiForm.llm.maxRetries),
          antiRepeat: Boolean(apiForm.llm.antiRepeat),
          webSearch: Boolean(apiForm.llm.webSearch),
          reusePrefix: Boolean(apiForm.llm.reusePrefix),
          stream: Boolean(apiForm.llm.stream),
        },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setLlmParamsMessage("LLM 参数已保存。");
      } else {
        setLlmParamsMessage("LLM 参数保存失败，请重试。");
      }
    } catch (err) {
      setLlmParamsMessage(
        `LLM 参数保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingLlmParams(false);
  };
  const handleSaveAsrParams = async () => {
    setSavingAsrParams(true);
    setAsrParamsMessage(null);
    try {
      const resp = await request("it/updateApiSettings", {
        environment: config?.activeEnvironment,
        asr: {
          language: apiForm.asr.language,
          devPid: Number(apiForm.asr.devPid),
          maxChunkSec: Number(apiForm.asr.maxChunkSec),
          maxConcurrency: Number(apiForm.asr.maxConcurrency),
          timeoutSec: Number(apiForm.asr.timeoutSec),
          maxRetries: Number(apiForm.asr.maxRetries),
        },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setAsrParamsMessage("ASR 参数已保存。");
      } else {
        setAsrParamsMessage("ASR 参数保存失败，请重试。");
      }
    } catch (err) {
      setAsrParamsMessage(
        `ASR 参数保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingAsrParams(false);
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
          vector: {
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
  const handleReloadConfig = async () => {
    const resp = await request("it/getConfig", undefined);
    if (resp?.status === "success" && resp.content) {
      setConfig(resp.content);
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
        {steps.map((step) => {
          const stream = stepStreams[step.id];
          const isEvaluationStep = step.id === "evaluation";
          const showStream = streamingSettings.enabled && stream?.text && !isEvaluationStep;
          const previewChars = Math.max(50, streamingSettings.previewChars || 200);
          return (
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
            {isEvaluationStep && streamingSettings.enabled && (
              <div className="it-step__evaluation-streams">
                <div className="it-step__evaluation-title">
                  面试评价实时输出（仅保留最新 {previewChars} 字）
                </div>
                <div className="it-evaluation__stream-grid">
                  {[0, 1, 2].map((idx) => {
                    const evalStream = evaluationStreams[idx];
                    const label = evaluationStreamQuestions[idx] || `第${idx + 1}题`;
                    const isActive = Boolean(evalStream?.text);
                    const status = evalStream?.done
                      ? "完成"
                      : isActive
                        ? "输出中"
                        : "等待";
                    return (
                      <StreamCard
                        key={`eval-stream-${idx}`}
                        variant="evaluation"
                        title={label}
                        status={status}
                        text={evalStream?.text}
                        collapsed={evalStream?.collapsed}
                        done={evalStream?.done}
                        showToggle={isActive}
                        previewLimit={previewChars}
                        onToggle={() =>
                          setEvaluationStreams((prev) => ({
                            ...prev,
                            [idx]: {
                              ...(prev[idx] || {
                                text: "",
                                collapsed: false,
                                done: false,
                              }),
                              collapsed: !prev[idx]?.collapsed,
                            },
                          }))
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {showStream && (
              <StreamCard
                variant="step"
                title="实时输出"
                text={stream?.text}
                collapsed={stream?.collapsed}
                showToggle
                previewLimit={previewChars}
                onToggle={() =>
                  setStepStreams((prev) => {
                    const current = prev[step.id];
                    if (!current) {
                      return prev;
                    }
                    return {
                      ...prev,
                      [step.id]: {
                        ...current,
                        collapsed: !current.collapsed,
                      },
                    };
                  })
                }
              />
            )}
          </div>
        );
        })}
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
              disabled={uiLocked || savingResult}
              onClick={handleSaveResult}
            >
              {savingResult ? "保存中..." : "保存结果"}
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
        {saveResultMessage && (
          <span className="it-status__hint">{saveResultMessage}</span>
        )}
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
        <SettingsPage
          uiLocked={uiLocked}
          config={config}
          streamingSettings={streamingSettings}
          setStreamingSettings={setStreamingSettings}
          savingStreamingSettings={savingStreamingSettings}
          streamingSaveMessage={streamingSaveMessage}
          handleSaveStreamingSettings={handleSaveStreamingSettings}
          envDraftName={envDraftName}
          setEnvDraftName={setEnvDraftName}
          envMessage={envMessage}
          savingEnvironment={savingEnvironment}
          handleSetActiveEnvironment={handleSetActiveEnvironment}
          handleCreateEnvironment={handleCreateEnvironment}
          handleDeleteEnvironment={handleDeleteEnvironment}
          handleReloadConfig={handleReloadConfig}
          traceLogEnabled={traceLogEnabled}
          handleEnableTraceLogs={handleEnableTraceLogs}
          templateCategory={templateCategory}
          setTemplateCategory={setTemplateCategory}
          templatesByCategory={templatesByCategory}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          selectedTemplate={selectedTemplate}
          templateDraft={templateDraft}
          setTemplateDraft={setTemplateDraft}
          templateJsonDraft={templateJsonDraft}
          setTemplateJsonDraft={setTemplateJsonDraft}
          templateJsonErrors={templateJsonErrors}
          templateSaveMessage={templateSaveMessage}
          savingTemplate={savingTemplate}
          isCreatingTemplate={isCreatingTemplate}
          handleCreateTemplate={handleCreateTemplate}
          handleDuplicateTemplate={handleDuplicateTemplate}
          handleDeleteTemplate={handleDeleteTemplate}
          handleCancelTemplateDraft={handleCancelTemplateDraft}
          handleSaveTemplate={handleSaveTemplate}
          updateTemplateRequest={updateTemplateRequest}
          updateTemplateResponse={updateTemplateResponse}
          updateTemplateStreaming={updateTemplateStreaming}
          paramCatalogList={paramCatalogList}
          templateUsageSets={templateUsageSets}
          templateSecrets={templateSecrets}
          secretDraft={secretDraft}
          setSecretDraft={setSecretDraft}
          savingSecret={savingSecret}
          secretMessage={secretMessage}
          handleSaveSecret={handleSaveSecret}
          handleDeleteSecret={handleDeleteSecret}
          templateParamOptions={templateParamOptions}
          templateParamInput={templateParamInput}
          setTemplateParamInput={setTemplateParamInput}
          savingParamOptions={savingParamOptions}
          handleAddParamOption={handleAddParamOption}
          handleSaveParamOptions={handleSaveParamOptions}
          templateBindings={templateBindings}
          setTemplateBindings={setTemplateBindings}
          llmTemplates={llmTemplates}
          asrTemplates={asrTemplates}
          embeddingTemplates={embeddingTemplates}
          savingBindings={savingBindings}
          handleSaveBindings={handleSaveBindings}
          apiForm={apiForm}
          handleApiFieldChange={handleApiFieldChange}
          llmParamsMessage={llmParamsMessage}
          savingLlmParams={savingLlmParams}
          handleSaveLlmParams={handleSaveLlmParams}
          asrParamsMessage={asrParamsMessage}
          savingAsrParams={savingAsrParams}
          handleSaveAsrParams={handleSaveAsrParams}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          demoPrompt={demoPrompt}
          setDemoPrompt={setDemoPrompt}
          answerMode={answerMode}
          setAnswerMode={setAnswerMode}
          perQuestionSystemPrompts={perQuestionSystemPrompts}
          setPerQuestionSystemPrompts={setPerQuestionSystemPrompts}
          perQuestionDemoPrompts={perQuestionDemoPrompts}
          setPerQuestionDemoPrompts={setPerQuestionDemoPrompts}
          promptSaveMessage={promptSaveMessage}
          promptSaveScope={promptSaveScope}
          handleSavePrompts={handleSavePrompts}
          nativeInputs={nativeInputs}
          selectedInput={selectedInput}
          setSelectedInput={setSelectedInput}
          handleRefreshInputs={handleRefreshInputs}
          retrievalForm={retrievalForm}
          handleRetrievalFieldChange={handleRetrievalFieldChange}
          handleRetrievalVectorChange={handleRetrievalVectorChange}
          savingRetrieval={savingRetrieval}
          retrievalSaveMessage={retrievalSaveMessage}
          handleSaveRetrievalSettings={handleSaveRetrievalSettings}
          clearingEmbeddingCache={clearingEmbeddingCache}
          embeddingCacheMessage={embeddingCacheMessage}
          handleClearEmbeddingCache={handleClearEmbeddingCache}
          clearingCorpusCache={clearingCorpusCache}
          corpusCacheMessage={corpusCacheMessage}
          handleClearCorpusCache={handleClearCorpusCache}
          showEmbeddingWarmup={showEmbeddingWarmup}
          embeddingWarmup={embeddingWarmup}
          retrievalCacheInfo={retrievalCacheInfo}
          corpusCachePath={corpusCachePath}
          embeddingCachePath={embeddingCachePath}
          corpusCacheMb={corpusCacheMb}
          queryCacheSize={queryCacheSize}
          maxConcurrency={maxConcurrency}
          topicTitleMode={topicTitleMode}
          setTopicTitleMode={setTopicTitleMode}
          topicTitleLen={topicTitleLen}
          setTopicTitleLen={setTopicTitleLen}
          savingTopicSettings={savingTopicSettings}
          handleSaveTopicSettings={handleSaveTopicSettings}
          topicSaveMessage={topicSaveMessage}
          retrievalDirs={retrievalDirs}
          handleSelectWorkspaceDir={handleSelectWorkspaceDir}
        />
      )}

    </div>
  );
};

export default InterviewTrainer;
