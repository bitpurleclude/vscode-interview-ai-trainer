import path from "path";
import type {
  ItAnalyzeResponse,
  ItAudioSegment,
  ItNoteHit,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type { ItTemplateRuntime } from "../../infra/api/it_templateExecutor";
import { it_hashText } from "../../infra/utils/it_text";
import type { ItCorpusItem } from "../notes";
import { it_createRetrievalMetrics, it_retrieveNotesMulti } from "../../infra/notes";
import { it_buildRetrievalQueries, it_mergeNoteHitsAll } from "./result";
import { it_collectAnswersFromSegments } from "./questions";
import { it_normalizeWorkspaceKey } from "./flow_helpers";
import type { ItAnalyzeDeps } from "./flow_types";

type RetrievalStageInput = {
  deps: ItAnalyzeDeps;
  cacheRoot: string | undefined;
  retrievalEnabled: boolean;
  retrievalMode: string;
  retrievalCfg: Record<string, any>;
  embeddingRuntime: ItTemplateRuntime | null;
  questionList: string[];
  questionText: string;
  questionAnswers?: Array<{ question: string; answer: string }>;
  questionTimings: ItQuestionTiming[];
  audioSegments?: ItAudioSegment[];
  transcript: string;
  corpusPromise: Promise<{
    corpus: ItCorpusItem[];
    sourceCount: number;
    scanElapsedSec: string;
  }> | null;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
};

export type RetrievalStageResult = {
  notes: ItAnalyzeResponse["notes"];
  notesByQuestion: ItNoteHit[][];
};

export async function it_runRetrievalStage({
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
}: RetrievalStageInput): Promise<RetrievalStageResult> {
  let notes: ItAnalyzeResponse["notes"] = [];
  let notesByQuestion: ItNoteHit[][] = [];
  if (!retrievalEnabled) {
    reportProgress("notes", 100, "笔记检索 已关闭", "success");
    return { notes, notesByQuestion };
  }

  const retrievalLabel = retrievalMode === "keyword" ? "词面" : "向量";
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
  const queryCacheKey = it_hashText(`${workspaceKey}:${sourceCount}:${corpus.length}`);
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
        const fallbackQuery = transcript.trim() ? [transcript.trim().slice(0, 240)] : [];
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
  const slowHint = sourceCount > 200 ? "文件较多，建议精简 inputs 目录" : undefined;
  const notesMessage = notesError
    ? `${notesErrorStage === "load" ? "笔记加载失败" : "向量检索失败"}：${notesError}`
    : `${retrievalLabel}检索 100%：${sourceCount}份 · ${corpus.length}段 · 命中 ${notes.length} 条 · ${notesElapsedSec}s${
        slowHint ? `，${slowHint}` : ""
      }`;
  reportProgress("notes", 100, notesMessage, notesError ? "error" : "success");
  return { notes, notesByQuestion };
}
