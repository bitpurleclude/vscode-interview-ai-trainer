import path from "path";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItEvaluation,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../../protocol/interviewTrainer";
import { it_evaluateAnswer } from "../../services/it_evaluation";
import { it_resolveBindingTemplate } from "../../services/it_templateGateway";
import {
  it_nextAttemptIndexAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
} from "../../services/it_storageGateway";
import type { ItCorpusItem } from "../../../domain/notes";
import { it_buildCorpusAsync } from "../../services/it_notesGateway";
import { it_storeRecordingAsync } from "../../services/it_recordingGateway";
import { it_buildAcousticForTiming, it_mergeEvaluations } from "../../../domain/analyze/evaluation";
import { it_deriveTopicTitle } from "../../../domain/analyze/result";
import { it_generateTopicTitleWithLlm } from "../../services/it_topicTitle";
import { it_persistAnalysis } from "../../services/it_analysisPersistence";
import { it_resolveWorkspaceDirPaths } from "../../services/it_workspaceDirs";
import { it_buildTemplateLlmConfig, it_buildTemplateRuntime, it_splitFallbackQuestions } from "./flow_helpers";
import { it_runAudioStage } from "./flow_audioStage";
import { it_prepareQuestionParseStage } from "./flow_questionStage";
import { it_runSegmentStage } from "./flow_segmentStage";
import { it_runRetrievalStage } from "./flow_retrievalStage";
import type { ItAnalyzeDeps, ItAnalyzeProgress } from "./flow_types";

function it_flowErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
  const flowStartedAt = Date.now();
  const runId = request.runId || "";
  const it_traceFlow = (
    action: string,
    status: string,
    detail?: Record<string, unknown>,
    level: "debug" | "info" | "warn" | "error" = "info",
  ) => {
    deps.onCorpusTrace?.(`analysis flow ${action} ${status}`, {
      event: `application.analysis_flow.${action}`,
      status,
      level,
      module: "flow",
      runId,
      ...(detail || {}),
    });
  };
  it_traceFlow(
    "run",
    "start",
    {
      questionTextLength: String(request.questionText || "").length,
      questionCount: Array.isArray(request.questionList) ? request.questionList.length : 0,
      audioFormat: request.audio?.format || "",
      audioByteLength: Number(request.audio?.byteLength || 0),
    },
    "debug",
  );
  const env = deps.apiConfig.active?.environment || "prod";
  const templatesConfig = deps.templatesConfig || { version: 1, environments: {} };
  const questionParseTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "llm",
    "questionParse",
  );
  const questionParseRuntime = it_buildTemplateRuntime(deps, questionParseTemplate);
  const titleTemplate = it_resolveBindingTemplate(templatesConfig, env, "llm", "title");
  const titleRuntime = it_buildTemplateRuntime(deps, titleTemplate);
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
  const questionParseLlmConfig = questionParseRuntime
    ? it_buildTemplateLlmConfig(questionParseRuntime)
    : null;
  const titleLlmConfig = titleRuntime
    ? it_buildTemplateLlmConfig(titleRuntime)
    : questionParseRuntime
      ? questionParseLlmConfig
      : it_buildTemplateLlmConfig(evaluationRuntime);
  const titleTemplateId =
    titleRuntime?.template?.id ||
    questionParseRuntime?.template?.id ||
    evaluationRuntime?.template?.id ||
    "";
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }
  ensureNotAborted();
  const { questionState, parsePromise } = it_prepareQuestionParseStage({
    deps,
    questionText,
    questionList,
    questionParseRuntime,
    questionParseLlmConfig,
    cacheRoot,
    reportProgress,
  });
  questionText = questionState.text;
  questionList = questionState.list;

  const workspaceDirs = it_resolveWorkspaceDirPaths(deps.workspaceRoot, deps.skillConfig);
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
        notes: workspaceDirs.notes,
        prompts: workspaceDirs.prompts,
        rubrics: workspaceDirs.rubrics,
        knowledge: workspaceDirs.knowledge,
        examples: workspaceDirs.examples,
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
  const audioStageStartedAt = Date.now();
  it_traceFlow(
    "audio_stage",
    "start",
    {
      provider: String(asrCfg.provider || ""),
      timeoutSec: Number(asrCfg.timeout_sec || 0),
    },
    "debug",
  );
  let audioResult: Awaited<ReturnType<typeof it_runAudioStage>>;
  try {
    audioResult = await it_runAudioStage({
      deps,
      request,
      asrCfg,
      asrRuntime,
      reportProgress,
    });
    it_traceFlow("audio_stage", "success", {
      durationMs: Date.now() - audioStageStartedAt,
      transcriptLength: String(audioResult.transcript || "").length,
      segmentCount: Array.isArray(audioResult.audioSegments) ? audioResult.audioSegments.length : 0,
    });
  } catch (error) {
    it_traceFlow(
      "audio_stage",
      "error",
      {
        durationMs: Date.now() - audioStageStartedAt,
        errorCode: "audio_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
  }
  const { transcript, acoustic, detailedTranscript, audioSegments } = audioResult;
  ensureNotAborted();
  if (retrievalEnabled) {
    reportProgress("notes", 50, "语料就绪，等待检索准备", "running");
  }

  if (parsePromise) {
    await parsePromise;
    ensureNotAborted();
    questionText = questionState.text;
    questionList = questionState.list;
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
    it_traceFlow(
      "segment_stage",
      "skipped",
      {
        reason: "single_question",
      },
      "debug",
    );
  }

  let questionTimings: ItQuestionTiming[] = [];
  let questionTimingNote: string | undefined = undefined;
  let questionAnswers: Array<{ question: string; answer: string }> | undefined = undefined;
  let llmTimingAttempted = false;
  let llmTimingFailed = false;

  if (multiQuestion && segmentLlmConfig) {
    const segmentStageStartedAt = Date.now();
    it_traceFlow(
      "segment_stage",
      "start",
      {
        questionCount: questionList.length,
      },
      "debug",
    );
    try {
      const segmentResult = await it_runSegmentStage({
        deps,
        segmentLlmConfig,
        questionList,
        transcript,
        audioSegments,
        reportProgress,
      });
      questionTimings = segmentResult.questionTimings;
      questionTimingNote = segmentResult.questionTimingNote;
      questionAnswers = segmentResult.questionAnswers;
      llmTimingAttempted = segmentResult.llmTimingAttempted;
      llmTimingFailed = segmentResult.llmTimingFailed;
      it_traceFlow(
        "segment_stage",
        "success",
        {
          durationMs: Date.now() - segmentStageStartedAt,
          questionTimingCount: questionTimings.length,
          llmTimingFailed,
        },
      );
    } catch (error) {
      it_traceFlow(
        "segment_stage",
        "error",
        {
          durationMs: Date.now() - segmentStageStartedAt,
          errorCode: "segment_stage_failed",
          error: it_flowErrorMessage(error),
        },
        "error",
      );
      throw error;
    }
  } else if (questionList.length === 1 && !questionAnswers) {
    questionAnswers = [{ question: questionList[0], answer: transcript }];
  }
  if (!questionAnswers && questionList.length) {
    questionAnswers = questionList.map((q) => ({
      question: q,
      answer: "",
    }));
  }
  if (multiQuestion && llmTimingAttempted) {
    reportProgress(
      "segment",
      100,
      llmTimingFailed ? "多题分段 100% · 失败" : "多题分段 100% · LLM",
      llmTimingFailed ? "error" : "success",
    );
  }

  const retrievalStageStartedAt = Date.now();
  it_traceFlow(
    "retrieval_stage",
    "start",
    {
      retrievalEnabled,
      retrievalMode,
      questionCount: questionList.length,
    },
    "debug",
  );
  let retrievalResult: Awaited<ReturnType<typeof it_runRetrievalStage>>;
  try {
    retrievalResult = await it_runRetrievalStage({
      deps,
      cacheRoot,
      retrievalEnabled,
      retrievalMode,
      retrievalCfg,
      embeddingRuntime,
      questionList,
      questionText,
      questionAnswers,
      questionTimings,
      audioSegments,
      transcript,
      corpusPromise,
      reportProgress,
    });
    it_traceFlow(
      "retrieval_stage",
      "success",
      {
        durationMs: Date.now() - retrievalStageStartedAt,
        notesCount: retrievalResult.notes.length,
        notesGroupCount: retrievalResult.notesByQuestion.length,
      },
    );
  } catch (error) {
    it_traceFlow(
      "retrieval_stage",
      "error",
      {
        durationMs: Date.now() - retrievalStageStartedAt,
        errorCode: "retrieval_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
  }
  const notes = retrievalResult.notes;
  const notesByQuestion = retrievalResult.notesByQuestion;
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
    } else {
      deps.onCorpusTrace?.("文件命名 LLM 失败，已回退", {
        templateId: titleTemplateId,
      });
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
  const evaluationStageStartedAt = Date.now();
  it_traceFlow(
    "evaluation_stage",
    "start",
    {
      questionCount: evalQuestions.length,
      streamEnabled,
    },
    "debug",
  );
  try {
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
        deps.onPartial?.({
          evaluation: it_mergeEvaluations({
            topicTitle: questionText || topicTitle,
            questions: evalQuestions,
            answers: evalAnswers,
            evaluations,
            timePlan,
          }),
        });
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
    await Promise.all(
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
          evaluations[idx] = result;
          deps.onPartial?.({
            evaluation: it_mergeEvaluations({
              topicTitle: questionText || topicTitle,
              questions: evalQuestions,
              answers: evalAnswers,
              evaluations,
              timePlan,
            }),
          });
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
  }
  } catch (error) {
    it_traceFlow(
      "evaluation_stage",
      "error",
      {
        durationMs: Date.now() - evaluationStageStartedAt,
        questionCount: evalQuestions.length,
        streamEnabled,
        errorCode: "evaluation_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
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
  it_traceFlow(
    "evaluation_stage",
    "success",
    {
      durationMs: Date.now() - evaluationStageStartedAt,
      questionCount: evalQuestions.length,
      streamEnabled,
    },
  );

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

  const persistStageStartedAt = Date.now();
  it_traceFlow(
    "persist_stage",
    "start",
    {
      reportPath,
      topicDir,
      attemptIndex,
    },
    "debug",
  );
  try {
    await it_persistAnalysis({
      questionText,
      questionList,
      topicTitle,
      topicDir,
      reportPath,
      attemptIndex,
      response,
      reportProgress,
      onTrace: deps.onCorpusTrace,
    });
    it_traceFlow(
      "persist_stage",
      "success",
      {
        durationMs: Date.now() - persistStageStartedAt,
        reportPath,
        topicDir,
        attemptIndex,
      },
    );
  } catch (error) {
    it_traceFlow(
      "persist_stage",
      "error",
      {
        durationMs: Date.now() - persistStageStartedAt,
        reportPath,
        topicDir,
        attemptIndex,
        errorCode: "persist_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
  }

  it_traceFlow(
    "run",
    "success",
    {
      durationMs: Date.now() - flowStartedAt,
      reportPath,
      topicDir,
      questionCount: questionList.length,
    },
  );

  return response;
}
