import path from "path";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";

import { ItApiConfig, ItTemplatesConfig } from "../../infra/api/it_apiConfig";
import { ItLlmConfig } from "../../infra/api/it_llmTypes";
import {
  it_resolveBindingTemplate,
  ItTemplateRuntime,
} from "../../infra/api/it_templateExecutor";
import { it_evaluateAnswer } from "../../core/it_evaluation";
import {
  ItCorpusItem,
  it_buildCorpusAsync,
  it_createRetrievalMetrics,
  it_retrieveNotesMulti,
} from "../../core/it_notes";
import {
  it_nextAttemptIndexAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
} from "../../infra/storage/it_sessions";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../../infra/storage/it_questionCache";
import {
  it_summarizeAudioMetrics,
  it_buildDetailedTranscript,
} from "../../infra/utils/it_audio";
import { it_hashText } from "../../infra/utils/it_text";
import { it_parseQuestions } from "../../core/it_questionParser";
import { it_storeRecordingAsync } from "./audio";
import { it_transcribeAudio } from "./asr";
import {
  it_alignAnswerToSegments,
  it_assignSegmentsWithLlm,
  it_collectAnswersFromSegments,
  it_splitAnswersWithLlm,
} from "./questions";
import { it_buildAcousticForTiming, it_mergeEvaluations } from "./evaluation";
import {
  it_buildRetrievalQueries,
  it_deriveTopicTitle,
  it_generateTopicTitleWithLlm,
  it_mergeNoteHitsAll,
  it_persistAnalysis,
} from "./result";

function it_splitFallbackQuestions(text: string): string[] {
  const raw = text.trim();
  if (!raw) {
    return [];
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\、\)\s]+/);
    if (!match) {
      continue;
    }
    const trimmed = line.slice(match[0].length).trim();
    if (trimmed) {
      numbered.push(trimmed);
    }
  }
  if (numbered.length > 1) {
    return numbered;
  }
  const joined = lines.join(" ");
  const parts = joined
    .split(/[?？]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => `${part}？`);
  }
  return [];
}

function it_normalizeWorkspaceKey(root: string): string {
  const resolved = path.resolve(String(root || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

interface ItAnalyzeDeps {
  context: vscode.ExtensionContext;
  apiConfig: ItApiConfig;
  templatesConfig: ItTemplatesConfig;
  skillConfig: Record<string, any>;
  workspaceRoot: string;
  onProgress?: (update: ItAnalyzeProgress) => void;
  onPartial?: (partial: {
    transcript?: string;
    detailedTranscript?: string;
    acoustic?: ItAcousticMetrics;
    notes?: ItNoteHit[];
    questionTimings?: ItQuestionTiming[];
    questionTimingNote?: string;
    evaluation?: ItEvaluation;
  }) => void;
  onStream?: (update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  onEvalStream?: (update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  onCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
  corpusDirty?: boolean;
  corpusDirtyFiles?: string[];
  abortSignal?: { aborted: boolean };
}

interface ItAnalyzeProgress {
  step: ItWorkflowStep;
  progress: number;
  message?: string;
  status?: ItStepStatus;
}

function it_buildTemplateRuntime(
  deps: ItAnalyzeDeps,
  template: ItTemplateRuntime["template"] | null,
): ItTemplateRuntime | null {
  if (!template) {
    return null;
  }
  const env = deps.apiConfig.active?.environment || "prod";
  return {
    template,
    environment: env,
    context: deps.context,
  };
}

function it_buildTemplateLlmConfig(
  runtime: ItTemplateRuntime,
  overrides?: Partial<ItLlmConfig>,
): ItLlmConfig {
  const streamEnabled =
    runtime.template.request?.stream === true ||
    runtime.template.response?.mode === "sse";
  const base: ItLlmConfig = {
    provider: "template",
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: 0.8,
    topP: 0.8,
    timeoutSec: Number(runtime.template.request?.timeoutSec ?? 60),
    maxRetries: 1,
    antiRepeat: false,
    useResponses: false,
    apiMode: "chat",
    responsesPath: "",
    toolsPreset: "",
    webSearch: false,
    reasoningEffort: undefined,
    maxOutputTokens: 0,
    reusePrefix: false,
    stream: streamEnabled,
  };
  return {
    ...base,
    ...(overrides || {}),
    template: runtime.template,
    templateEnv: runtime.environment,
    templateContext: runtime.context,
  };
}

export async function it_runAnalysis(
  deps: ItAnalyzeDeps,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  const ensureNotAborted = () => {
    if (deps.abortSignal?.aborted) {
      throw new Error("分析已停止");
    }
  };
  const reportProgress = (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => {
    deps.onProgress?.({
      step,
      progress,
      message,
      status,
    });
  };
  const env = deps.apiConfig.active?.environment || "prod";
  const templatesConfig = deps.templatesConfig || { version: 1, environments: {} };
  const questionParseTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "llm",
    "questionParse",
  );
  const questionParseRuntime = it_buildTemplateRuntime(deps, questionParseTemplate);
  const asrTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "asr",
    "transcription",
  );
  const asrRuntime = it_buildTemplateRuntime(deps, asrTemplate);
  if (!asrRuntime) {
    throw new Error("ASR 模板未绑定：请在设置中绑定转写模板。");
  }
  const evaluationTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "llm",
    "evaluation",
  );
  const evaluationRuntime = it_buildTemplateRuntime(deps, evaluationTemplate);
  if (!evaluationRuntime) {
    throw new Error("LLM 模板未绑定：请在设置中绑定评价模板。");
  }
  const segmentTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "llm",
    "segment",
  );
  const segmentRuntime = it_buildTemplateRuntime(deps, segmentTemplate);
  const embeddingTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "embedding",
    "retrieval",
  );
  const embeddingRuntime = it_buildTemplateRuntime(deps, embeddingTemplate);
  const cacheRoot = deps.context.globalStorageUri?.fsPath;
  let questionText = request.questionText?.trim() || "";
  let questionList = (request.questionList ?? []).filter((q) => q.trim());
  const needsQuestionParse = questionList.length === 0;
  if (needsQuestionParse && questionText && !questionParseRuntime) {
    throw new Error("LLM 模板未绑定：请在设置中绑定题目解析模板。");
  }
  const questionParseLlmConfig = questionParseRuntime
    ? it_buildTemplateLlmConfig(questionParseRuntime)
    : null;
  const titleLlmConfig = questionParseRuntime
    ? questionParseLlmConfig
    : it_buildTemplateLlmConfig(evaluationRuntime);
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }
  ensureNotAborted();

  const parseStart = Date.now();
  let parsePromise: Promise<void> | null = null;
  const parseInput = questionText;
  if (questionList.length) {
    reportProgress(
      "question",
      100,
      `题目已提供 · ${questionList.length}题 · 本地`,
      "success",
    );
  } else {
    const cached = cacheRoot
      ? await it_readQuestionParseCache(cacheRoot, parseInput)
      : null;
    const hasCachedQuestions = Boolean(cached && cached.questions.length);
    if (hasCachedQuestions) {
      if (cached?.material) {
        questionText = cached.material;
      }
      questionList = cached?.questions ?? [];
      reportProgress(
        "question",
        100,
        `题目解析 100% · 缓存 · ${questionList.length}题`,
        "success",
      );
    } else {
      const prefix =
        cached && (cached.material || cached.questions.length)
          ? "题目解析 5% · 缓存未识别，重新解析"
          : "题目解析 5% · 本地";
      reportProgress("question", 5, prefix, "running");
      parsePromise = (async () => {
        const parsed = await it_parseQuestions(
          questionText,
          questionParseLlmConfig,
          deps.onStream
            ? (update) => deps.onStream?.({ step: "question", ...update })
            : undefined,
          deps.onCorpusTrace,
        );
        const elapsed = ((Date.now() - parseStart) / 1000).toFixed(1);
        const sourceLabel = parsed.source === "llm" ? "API" : "本地";
        if (parsed.material) {
          questionText = parsed.material;
        }
        if (parsed.questions.length) {
          questionList = parsed.questions;
        }
        if (cacheRoot && (parsed.material || parsed.questions.length)) {
          await it_writeQuestionParseCache(cacheRoot, parseInput, {
            material: parsed.material || "",
            questions: parsed.questions || [],
            source: parsed.source,
          });
        }
        if (questionList.length) {
          reportProgress(
            "question",
            100,
            `题目解析 100% · ${questionList.length}题 · ${elapsed}s · ${sourceLabel}`,
            "success",
          );
        } else {
          reportProgress(
            "question",
            100,
            `题目解析完成 · 未识别题目 · ${elapsed}s · ${sourceLabel}`,
            "error",
          );
        }
      })().catch(() => {
        reportProgress("question", 100, "题目解析失败，使用原题干", "error");
      });
    }
  }

  const workspaceCfg = deps.skillConfig.workspace ?? {};
  const retrievalCfg = deps.skillConfig.retrieval ?? {};
  const retrievalEnabled = retrievalCfg.enabled !== false;
  const retrievalMode = String(retrievalCfg.mode || "vector");
  if (retrievalEnabled && retrievalMode !== "keyword" && !embeddingRuntime) {
    throw new Error(
      "Embedding 模板未绑定：请在设置中绑定检索模板或关闭向量检索。",
    );
  }
  const retrievalLabel = retrievalMode === "keyword" ? "词面" : "向量";
  const corpusCacheMb = Number(
    retrievalCfg.corpus_cache_mb ?? retrievalCfg.corpus_cache_max_mb ?? 25,
  );
  const corpusCacheBytes = Number.isFinite(corpusCacheMb)
    ? Math.max(0, corpusCacheMb) * 1024 * 1024
    : undefined;
  let corpusPromise: Promise<{
    corpus: ItCorpusItem[];
    sourceCount: number;
    scanElapsedSec: string;
  }> | null = null;
  if (retrievalEnabled) {
    const notesStart = Date.now();
    const skipMtimeCheck = deps.corpusDirty === false;
    reportProgress(
      "notes",
      5,
      `${retrievalLabel}语料扫描 5%${skipMtimeCheck ? "（复用缓存）" : ""}`,
      "running",
    );
    corpusPromise = it_buildCorpusAsync(
      {
        notes: path.join(deps.workspaceRoot, workspaceCfg.notes_dir || "inputs/notes"),
        prompts: path.join(
          deps.workspaceRoot,
          workspaceCfg.prompts_dir || "inputs/prompts/guangdong",
        ),
        rubrics: path.join(
          deps.workspaceRoot,
          workspaceCfg.rubrics_dir || "inputs/rubrics",
        ),
        knowledge: path.join(
          deps.workspaceRoot,
          workspaceCfg.knowledge_dir || "inputs/knowledge",
        ),
        examples: path.join(
          deps.workspaceRoot,
          workspaceCfg.examples_dir || "inputs/examples",
        ),
      },
      {
        cacheDir: cacheRoot,
        maxCacheBytes: corpusCacheBytes,
        skipMtimeCheck,
        dirtyFiles: deps.corpusDirtyFiles,
        onTrace: deps.onCorpusTrace,
      },
    ).then((corpus) => {
      const scanElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
      const sourceCount = new Set(corpus.map((item) => item.source)).size;
      reportProgress(
        "notes",
        30,
        `语料就绪 30%：${sourceCount}份 · ${corpus.length}段 · ${scanElapsedSec}s`,
        "running",
      );
      return { corpus, sourceCount, scanElapsedSec };
    });
  }

  const asrCfg = deps.skillConfig.asr ?? {};
  const transcript = await it_transcribeAudio(
    request,
    asrCfg,
    asrRuntime,
    reportProgress,
    deps.onCorpusTrace,
  );
  ensureNotAborted();
  deps.onPartial?.({ transcript });
  if (retrievalEnabled) {
    reportProgress("notes", 50, "语料就绪，等待检索准备", "running");
  }

  reportProgress("acoustic", 20, "声学分析 20% · 本地", "running");
  const acoustic =
    request.audio.format === "pcm"
      ? it_summarizeAudioMetrics(
          request.audio.base64,
          request.audio.sampleRate,
          transcript,
        )
      : {
          durationSec: request.audio.durationSec || 0,
          speechDurationSec: request.audio.durationSec || 0,
          speechRateWpm: undefined,
          pauseCount: 0,
          pauseAvgSec: 0,
          pauseMaxSec: 0,
          rmsDbMean: 0,
          rmsDbStd: 0,
          snrDb: undefined,
        };
  reportProgress("acoustic", 100, "声学分析 100% · 本地", "success");
  ensureNotAborted();
  deps.onPartial?.({ acoustic });

  let detailedTranscript: string | undefined = undefined;
  let audioSegments = undefined;
  if (request.audio.format === "pcm") {
    const detailed = it_buildDetailedTranscript(
      request.audio.base64,
      request.audio.sampleRate,
      transcript,
    );
    detailedTranscript = detailed.detailedTranscript;
    audioSegments = detailed.segments;
    if (detailedTranscript) {
      deps.onPartial?.({ detailedTranscript });
    }
  }

  if (parsePromise) {
    await parsePromise;
    ensureNotAborted();
  }
  if (questionList.length <= 1) {
    const fallbackQuestions = it_splitFallbackQuestions(questionText);
    if (fallbackQuestions.length > 1) {
      questionList = fallbackQuestions;
      reportProgress(
        "question",
        100,
        `题目解析 100% · 本地补全 · ${questionList.length}题`,
        "success",
      );
    }
  }

  const segmentLlmConfig = segmentRuntime
    ? it_buildTemplateLlmConfig(segmentRuntime, { maxOutputTokens: 0 })
    : null;
  const multiQuestion = questionList.length > 1;
  if (multiQuestion && !segmentLlmConfig) {
    throw new Error("LLM 模板未绑定：请在设置中绑定分段模板。");
  }
  if (multiQuestion) {
    reportProgress("segment", 5, "多题分段 5% · 准备中", "running");
  } else {
    reportProgress("segment", 100, "多题分段 跳过 · 单题", "success");
  }

  let questionTimings: ItQuestionTiming[] = [];
  let questionTimingNote: string | undefined = undefined;
  let questionAnswers: Array<{ question: string; answer: string }> | undefined =
    undefined;
  let llmTimingAttempted = false;
  let llmTimingFailed = false;
  if (multiQuestion) {
    if (audioSegments && segmentLlmConfig) {
      llmTimingAttempted = true;
      reportProgress("segment", 25, "多题分段 25% · 正在分段", "running");
      const splitAnswers = await it_splitAnswersWithLlm(
        segmentLlmConfig,
        questionList,
        transcript,
        deps.onCorpusTrace,
        deps.onStream
          ? (update) => deps.onStream?.({ step: "segment", ...update })
          : undefined,
      );
      reportProgress("segment", 45, "多题分段 45% · 正在本地对齐", "running");
      if (splitAnswers) {
        questionAnswers = splitAnswers;
        const alignedTimings: ItQuestionTiming[] = [];
        let alignedCount = 0;
        let missingAlignment = false;
        for (let idx = 0; idx < splitAnswers.length; idx += 1) {
          const answerText = splitAnswers[idx].answer.trim();
          if (!answerText) {
            continue;
          }
          const aligned = it_alignAnswerToSegments(answerText, audioSegments);
          if (!aligned) {
            missingAlignment = true;
            continue;
          }
          alignedTimings[idx] = {
            question: splitAnswers[idx].question,
            startSec: aligned.startSec,
            endSec: aligned.endSec,
            durationSec: Math.max(0, aligned.endSec - aligned.startSec),
            note: "LLM逐题对齐",
          };
          alignedCount += 1;
        }
        if (alignedCount) {
          questionTimings = alignedTimings;
        }
        if (missingAlignment) {
          reportProgress("segment", 65, "多题分段 65% · 正在远程对齐", "running");
          const assigned = await it_assignSegmentsWithLlm(
            segmentLlmConfig,
            questionList,
            audioSegments,
            deps.onCorpusTrace,
            deps.onStream
              ? (update) => deps.onStream?.({ step: "segment", ...update })
              : undefined,
          );
          if (assigned) {
            questionTimings = assigned.timings;
            questionAnswers = questionAnswers
              ? questionAnswers.map((item, idx) => ({
                  question: item.question,
                  answer: item.answer.trim()
                    ? item.answer
                    : assigned.answers[idx]?.answer || "",
                }))
              : assigned.answers;
          } else if (!questionTimings.length) {
            llmTimingFailed = true;
          }
        }
      }
      if (!questionTimings.length) {
        reportProgress("segment", 80, "多题分段 80% · 正在远程兜底", "running");
        const assigned = await it_assignSegmentsWithLlm(
          segmentLlmConfig,
          questionList,
          audioSegments,
          deps.onCorpusTrace,
          deps.onStream
            ? (update) => deps.onStream?.({ step: "segment", ...update })
            : undefined,
        );
        if (assigned) {
          questionTimings = assigned.timings;
          if (!questionAnswers) {
            questionAnswers = assigned.answers;
          }
        } else {
          llmTimingFailed = true;
        }
      }
      if (!questionTimings.length) {
        llmTimingFailed = true;
      }
    } else {
      llmTimingAttempted = true;
      llmTimingFailed = true;
      reportProgress("segment", 100, "多题分段 100% · 缺少转写分段或LLM", "error");
    }
  } else if (questionList.length === 1 && !questionAnswers) {
    questionAnswers = [{ question: questionList[0], answer: transcript }];
  }
  if (!questionTimings.length && questionList.length && llmTimingFailed) {
    questionTimingNote = "无法计算（LLM分段失败）";
  }
  if (!questionAnswers && questionList.length) {
    questionAnswers = questionList.map((q) => ({
      question: q,
      answer: "",
    }));
  }
  if (questionTimings.length || questionTimingNote) {
    deps.onPartial?.({
      questionTimings: questionTimings.length ? questionTimings : undefined,
      questionTimingNote,
    });
  }
  if (multiQuestion && llmTimingAttempted) {
    reportProgress(
      "segment",
      100,
      llmTimingFailed ? "多题分段 100% · 失败" : "多题分段 100% · LLM",
      llmTimingFailed ? "error" : "success",
    );
  }

  let notes: ItAnalyzeResponse["notes"] = [];
  let notesByQuestion: ItNoteHit[][] = [];
  if (!retrievalEnabled) {
    reportProgress("notes", 100, "笔记检索 已关闭", "success");
  } else {
    let corpus: ItCorpusItem[] = [];
    let sourceCount = 0;
    let scanElapsedSec = "0.0";
    let notesError: string | undefined;
    let notesErrorStage: "load" | "retrieve" | undefined;
    if (corpusPromise) {
      try {
        const result = await corpusPromise;
        corpus = result.corpus;
        sourceCount = result.sourceCount;
        scanElapsedSec = result.scanElapsedSec;
        reportProgress(
          "notes",
          40,
          `笔记加载 40%：${sourceCount}份 · ${corpus.length}段 · ${scanElapsedSec}s`,
          "running",
        );
      } catch (err) {
        notesError = err instanceof Error ? err.message : String(err);
        notesErrorStage = "load";
      }
    }
    if (notesError) {
      reportProgress("notes", 100, `笔记加载失败：${notesError}`, "error");
    }
    const notesStart = Date.now();
    const vectorCfg = retrievalCfg.vector ?? {};
    const resolvedVector = {
      provider: "template",
      base_url: "",
      api_key: "",
      model: vectorCfg.model || "",
      timeout_sec: Number(vectorCfg.timeout_sec ?? 30),
      max_retries: Number(vectorCfg.max_retries ?? 1),
      batch_size: Number(vectorCfg.batch_size ?? 16),
      query_max_chars: Number(vectorCfg.query_max_chars ?? 1500),
      template: embeddingRuntime?.template,
      templateEnv: embeddingRuntime?.environment,
      templateContext: embeddingRuntime?.context,
    };
    if (!embeddingRuntime && retrievalMode !== "keyword") {
      notesError = "Embedding 模板未绑定";
      notesErrorStage = "retrieve";
    }

    const notesTopK = Number(retrievalCfg.top_k ?? 5);
    const notesTopKNotes = Number(retrievalCfg.top_k_notes ?? notesTopK);
    const notesTopKKnowledge = Number(retrievalCfg.top_k_knowledge ?? notesTopK);
    const notesTopKRubrics = Number(retrievalCfg.top_k_rubrics ?? notesTopK);
    const notesTopKExamples = Number(retrievalCfg.top_k_examples ?? notesTopK);
    const notesMinScore = Number(retrievalCfg.min_score ?? 0.2);
    const workspaceKey = it_normalizeWorkspaceKey(deps.workspaceRoot);
    const notesCacheDir = cacheRoot
      ? path.join(cacheRoot, "embedding_cache", it_hashText(workspaceKey))
      : undefined;
    const queryCacheSize = Number(retrievalCfg.query_cache_size ?? 200);
    const maxConcurrency = Number(retrievalCfg.max_concurrency ?? 3);
    const queryCacheKey = it_hashText(
      `${workspaceKey}:${sourceCount}:${corpus.length}`,
    );
    let retrievalAnswers = questionAnswers;
    if (
      (!retrievalAnswers || retrievalAnswers.length !== questionList.length) &&
      audioSegments &&
      questionTimings.length
    ) {
      retrievalAnswers = it_collectAnswersFromSegments(questionTimings, audioSegments);
    }
    const kindLabels: Record<string, string> = {
      notes: "笔记",
      knowledge: "知识库",
      rubrics: "评分标准",
      examples: "示例答案",
    };
    const corpusByKind = {
      notes: corpus.filter((item) => item.kind === "notes"),
      knowledge: corpus.filter(
        (item) => item.kind === "knowledge" || item.kind === "prompts",
      ),
      rubrics: corpus.filter((item) => item.kind === "rubrics"),
      examples: corpus.filter((item) => item.kind === "examples"),
    };
    const kindTopK = {
      notes: notesTopKNotes,
      knowledge: notesTopKKnowledge,
      rubrics: notesTopKRubrics,
      examples: notesTopKExamples,
    };
    let notesPhase = "生成查询向量";
    let notesPercent = 70;
    let notesTasksTotal = 1;
    let notesTasksDone = 0;
    const concurrencyHint = maxConcurrency > 1 ? ` · 并行x${maxConcurrency}` : "";
    const updateNotesProgress = (percent: number) => {
      notesPercent = percent;
      const taskHint = notesTasksTotal ? ` · ${notesTasksDone}/${notesTasksTotal}` : "";
      reportProgress(
        "notes",
        percent,
        `${retrievalLabel}检索 ${percent}%${concurrencyHint}${taskHint} · ${notesPhase}`,
        "running",
      );
    };
    const setNotesPhase = (phase: string) => {
      if (!phase || phase === notesPhase) {
        return;
      }
      notesPhase = phase;
      updateNotesProgress(notesPercent);
    };
    const retrieveByKind = async (
      kind: keyof typeof corpusByKind,
      queryList: string[],
    ): Promise<ItNoteHit[]> => {
      const filtered = corpusByKind[kind];
      const topK = kindTopK[kind];
      if (!filtered.length || topK <= 0) {
        return [];
      }
      const label = kindLabels[kind] || kind;
      const metrics = it_createRetrievalMetrics();
      const startedAt = Date.now();
      const hits = await it_retrieveNotesMulti(queryList, filtered, {
        mode: retrievalMode === "keyword" ? "keyword" : "vector",
        topK,
        minScore: notesMinScore,
        cacheDir: notesCacheDir,
        cacheKey: `${queryCacheKey}:${kind}`,
        queryCacheSize,
        maxConcurrency,
        metrics,
        onPhase: setNotesPhase,
        onTrace: deps.onCorpusTrace,
        vector: {
          provider: resolvedVector.provider || "",
          apiKey: resolvedVector.api_key || "",
          baseUrl: resolvedVector.base_url || "",
          model: resolvedVector.model || "",
          timeoutSec: Number(resolvedVector.timeout_sec ?? 30),
          maxRetries: Number(resolvedVector.max_retries ?? 1),
          batchSize: Number(resolvedVector.batch_size ?? 16),
          queryMaxChars: Number(resolvedVector.query_max_chars ?? 1500),
          template: resolvedVector.template,
          templateEnv: resolvedVector.templateEnv,
          templateContext: resolvedVector.templateContext,
        },
      });
      const elapsedMs = Date.now() - startedAt;
      deps.onCorpusTrace?.("检索统计", {
        语料: label,
        query数: metrics.queryCount,
        query向量缓存命中: metrics.queryEmbeddingHit,
        query向量缓存缺失: metrics.queryEmbeddingMiss,
        语料补算待处理: metrics.embeddingMissing,
        语料补算新增: metrics.embeddingCreated,
        耗时ms: elapsedMs,
      });
      return hits.map((hit) => ({
        ...hit,
        source: `[${label}] ${hit.source}`,
      }));
    };

    if (!notesError) {
      try {
        const questionsForNotes = questionList.length
          ? questionList
          : questionText
            ? [questionText]
            : [];
        const resolvedAnswers =
          retrievalAnswers && retrievalAnswers.length === questionsForNotes.length
            ? retrievalAnswers
            : questionsForNotes.map((question) => ({ question, answer: "" }));
        notesTasksTotal = questionsForNotes.length || 1;
        notesTasksDone = 0;
        notesPhase = "生成查询向量";
        updateNotesProgress(70);
        const bumpNotesProgress = () => {
          if (!notesTasksTotal) {
            return;
          }
          notesTasksDone = Math.min(notesTasksTotal, notesTasksDone + 1);
          const percent = 70 + Math.round((notesTasksDone / notesTasksTotal) * 25);
          updateNotesProgress(Math.min(95, percent));
        };
        if (questionsForNotes.length) {
          notesByQuestion = new Array(questionsForNotes.length);
          const noteTasks = questionsForNotes.map((question, idx) => {
            const answer = resolvedAnswers[idx]?.answer || "";
            const queries = it_buildRetrievalQueries({
              questionText: question,
              questionList: [question],
              transcript: answer || transcript,
              answers: answer ? [{ question, answer }] : undefined,
            });
            const queryList = queries.length ? queries : [question];
            return Promise.all([
              retrieveByKind("notes", queryList),
              retrieveByKind("knowledge", queryList),
              retrieveByKind("rubrics", queryList),
              retrieveByKind("examples", queryList),
            ])
              .then((results) => {
                const combined = results.flat();
                notesByQuestion[idx] = combined;
                return combined;
              })
              .finally(bumpNotesProgress);
          });
          await Promise.all(noteTasks);
          notes = it_mergeNoteHitsAll(notesByQuestion);
        } else {
          const fallbackQuery = transcript.trim()
            ? [transcript.trim().slice(0, 240)]
            : [];
          if (fallbackQuery.length) {
            const results = await Promise.all([
              retrieveByKind("notes", fallbackQuery),
              retrieveByKind("knowledge", fallbackQuery),
              retrieveByKind("rubrics", fallbackQuery),
              retrieveByKind("examples", fallbackQuery),
            ]);
            notes = results.flat();
          } else {
            notes = [];
          }
          bumpNotesProgress();
        }
      } catch (err) {
        notesError = err instanceof Error ? err.message : String(err);
        notesErrorStage = "retrieve";
      }
    }
    const notesElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
    const slowHint =
      sourceCount > 200 ? "文件较多，建议精简 inputs 目录" : undefined;
    const notesMessage = notesError
      ? `${notesErrorStage === "load" ? "笔记加载失败" : "向量检索失败"}：${notesError}`
      : `${retrievalLabel}检索 100%：${sourceCount}份 · ${corpus.length}段 · 命中 ${notes.length} 条 · ${notesElapsedSec}s${
          slowHint ? `，${slowHint}` : ""
        }`;
    reportProgress("notes", 100, notesMessage, notesError ? "error" : "success");
  }
  deps.onPartial?.({ notes });
  ensureNotAborted();
  const topicCfg = deps.skillConfig.topics ?? {};
  const maxTitleLen = Number(topicCfg.max_title_len ?? 18);
  const titleModeRaw = String(topicCfg.title_mode ?? topicCfg.titleMode ?? "llm");
  const titleMode = titleModeRaw === "simple" ? "simple" : "llm";
  let topicTitle = it_deriveTopicTitle(
    questionText,
    questionList,
    transcript,
    maxTitleLen,
  );
  if (titleMode === "llm") {
    const generatedTitle = await it_generateTopicTitleWithLlm(
      titleLlmConfig,
      questionText,
      questionList,
      maxTitleLen,
    );
    if (generatedTitle) {
      topicTitle = generatedTitle;
    }
  }

  const topicDir = await it_resolveTopicDirAsync(
    deps.workspaceRoot,
    topicTitle,
    questionText,
    questionList,
    {
      sessionsDir: deps.skillConfig.sessions_dir || "sessions",
      allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
      maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
      similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
    },
  );

  const reportPath = await it_reportPathForTopicAsync(topicDir, topicTitle, {
    sessionsDir: deps.skillConfig.sessions_dir || "sessions",
    allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
    maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
    similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
  });

  const attemptIndex = await it_nextAttemptIndexAsync(reportPath);
  const storedAudioPath = await it_storeRecordingAsync(
    topicDir,
    attemptIndex,
    request.audio,
  );

  const evaluationLlmConfig = it_buildTemplateLlmConfig(evaluationRuntime, {
    maxOutputTokens: 0,
  });
  const evalProvider = evaluationLlmConfig.provider || "template";
  const evaluationConfig = {
    provider: evalProvider,
    model: evaluationLlmConfig.model || "",
    baseUrl: evaluationLlmConfig.baseUrl || "",
    apiKey: "",
    temperature: Number(evaluationLlmConfig.temperature ?? 0.8),
    topP: Number(evaluationLlmConfig.topP ?? 0.8),
    timeoutSec: Number(evaluationLlmConfig.timeoutSec ?? 60),
    maxRetries: Math.max(
      5,
      Number(evaluationLlmConfig.maxRetries ?? 1),
    ),
    antiRepeat: Boolean(evaluationLlmConfig.antiRepeat ?? false),
    useResponses: Boolean(evaluationLlmConfig.useResponses ?? false),
    apiMode:
      evaluationLlmConfig.apiMode ??
      ((evaluationLlmConfig.useResponses ?? false) ? "responses" : "chat"),
    responsesPath: evaluationLlmConfig.responsesPath ?? "",
    toolsPreset: evaluationLlmConfig.toolsPreset ?? "",
    webSearch: Boolean(evaluationLlmConfig.webSearch ?? false),
    reasoningEffort: evaluationLlmConfig.reasoningEffort ?? undefined,
    maxOutputTokens: 0,
    reusePrefix: Boolean(evaluationLlmConfig.reusePrefix ?? false),
    stream: evaluationLlmConfig.stream ?? true,
    template: evaluationLlmConfig.template,
    templateEnv: evaluationLlmConfig.templateEnv,
    templateContext: evaluationLlmConfig.templateContext,
    templateVars: evaluationLlmConfig.templateVars,
    templateMaxRetries: evaluationLlmConfig.templateMaxRetries,
    language: deps.skillConfig.evaluation?.language || "zh-CN",
    dimensions: deps.skillConfig.evaluation?.dimensions ?? [],
    answerMode:
      deps.skillConfig.evaluation?.answer_mode ??
      deps.skillConfig.evaluation?.answerMode ??
      "two-step",
  };

  const evalUsesApi = Boolean(evaluationLlmConfig?.template);
  const evalLabel = evalUsesApi ? "API" : "LLM不可用";
  const evalModeLabel = evaluationConfig.answerMode === "two-step" ? "两步法" : "单次";
  reportProgress(
    "evaluation",
    5,
    `面试评价 5% · 准备 · ${evalLabel} · ${evalModeLabel}`,
    "running",
  );

  const timePlan = [4, 3, 3];
  const evalQuestions = questionList.length
    ? questionList
    : questionText
      ? [questionText]
      : [topicTitle];
  const evalAnswers =
    questionAnswers && questionAnswers.length === evalQuestions.length
      ? questionAnswers
      : evalQuestions.map((question) => ({ question, answer: "" }));
  const evalNotes =
    notesByQuestion.length === evalQuestions.length
      ? notesByQuestion
      : evalQuestions.map(() => notes);
  const evalAcoustics = evalQuestions.map((_, idx) =>
    it_buildAcousticForTiming(
      questionTimings[idx],
      audioSegments,
      evalAnswers[idx]?.answer || "",
    ),
  );

  const totalQuestions = evalQuestions.length || 1;
  let completed = 0;
  const baseProgress = 15;
  const spanProgress = 75;
  reportProgress(
    "evaluation",
    baseProgress,
    `面试评价 ${baseProgress}% · 生成中 · ${evalLabel} · ${evalModeLabel}`,
    "running",
  );
  const evaluations: ItEvaluation[] = [];
  const streamEnabled = Boolean(deps.onStream || deps.onEvalStream);
  if (streamEnabled) {
    const tasks = evalQuestions.map((question, idx) =>
      (async () => {
        const streamHandler =
          deps.onStream || deps.onEvalStream
            ? (update: { text: string; done?: boolean; reset?: boolean }) => {
                deps.onStream?.({ step: "evaluation", ...update });
                deps.onEvalStream?.({ questionIndex: idx, ...update });
              }
            : undefined;
        const result = await it_evaluateAnswer(
          question,
          evalAnswers[idx]?.answer || "",
          evalAcoustics[idx],
          evalNotes[idx] || [],
          evaluationConfig,
          [question],
          [{ question, answer: evalAnswers[idx]?.answer || "" }],
          questionText,
          evalQuestions,
          [
            request.systemPrompt?.trim(),
            request.perQuestionSystemPrompts?.[idx]?.trim(),
          ]
            .filter(Boolean)
            .join("\n\n") || undefined,
          [
            request.demoPrompt?.trim(),
            request.perQuestionDemoPrompts?.[idx]?.trim(),
          ]
            .filter(Boolean)
            .join("\n\n") || undefined,
          deps.onCorpusTrace,
          streamHandler,
        );
        evaluations[idx] = result;
        completed += 1;
        const progress = Math.min(
          95,
          baseProgress + Math.round((spanProgress * completed) / totalQuestions),
        );
        reportProgress(
          "evaluation",
          progress,
          `面试评价 ${progress}% · ${evalLabel} · ${evalModeLabel} · 第${completed}/${totalQuestions}题`,
          "running",
        );
        return result;
      })(),
    );
    await Promise.all(tasks);
  } else {
    const parallel = await Promise.all(
      evalQuestions.map((question, idx) =>
        (async () => {
          const result = await it_evaluateAnswer(
            question,
            evalAnswers[idx]?.answer || "",
            evalAcoustics[idx],
            evalNotes[idx] || [],
            evaluationConfig,
            [question],
            [{ question, answer: evalAnswers[idx]?.answer || "" }],
            questionText,
            evalQuestions,
            [
              request.systemPrompt?.trim(),
              request.perQuestionSystemPrompts?.[idx]?.trim(),
            ]
              .filter(Boolean)
              .join("\n\n") || undefined,
            [
              request.demoPrompt?.trim(),
              request.perQuestionDemoPrompts?.[idx]?.trim(),
            ]
              .filter(Boolean)
              .join("\n\n") || undefined,
            deps.onCorpusTrace,
            undefined,
          );
          completed += 1;
          const progress = Math.min(
            95,
            baseProgress + Math.round((spanProgress * completed) / totalQuestions),
          );
          reportProgress(
            "evaluation",
            progress,
            `面试评价 ${progress}% · ${evalLabel} · ${evalModeLabel} · 第${completed}/${totalQuestions}题`,
            "running",
          );
          return result;
        })(),
      ),
    );
    evaluations.push(...parallel);
  }

  const evaluation: ItEvaluation = it_mergeEvaluations({
    topicTitle: questionText || topicTitle,
    questions: evalQuestions,
    answers: evalAnswers,
    evaluations,
    timePlan,
  });
  reportProgress("evaluation", 95, "面试评价 95% · 汇总", "running");
  reportProgress("evaluation", 100, `面试评价 100% · ${evalLabel}`, "success");
  deps.onPartial?.({ evaluation });
  ensureNotAborted();

  const response: ItAnalyzeResponse = {
    transcript,
    detailedTranscript,
    acoustic,
    evaluation,
    notes,
    audioSegments,
    questionTimings,
    questionTimingNote,
    questionText,
    questionList,
    reportPath,
    topicDir,
    audioPath: storedAudioPath,
  };

  await it_persistAnalysis({
    questionText,
    questionList,
    topicTitle,
    topicDir,
    reportPath,
    attemptIndex,
    response,
    reportProgress,
  });

  return response;
}
