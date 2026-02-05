import {
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
} from "../../protocol/interviewTrainer";
import { it_requestLlmChatStreaming } from "./clients/llmClient";
import { it_createTraceLogger } from "./logging/it_traceLogger";
import type { ItEvaluationConfig } from "./evaluation/types";
import {
  it_buildSummary,
  it_canUseLlm,
  it_generateOutlines,
  it_generateRevisedByOutline,
  it_splitTranscriptByQuestions,
} from "./evaluation/prompt";
import {
  it_extractJsonPayload,
  it_isOutlineKeywordLike,
  it_outlineHasIndent,
  it_pickRevisedAnswers,
  it_toOutlineArray,
  it_toStringArray,
} from "./evaluation/parser";
import {
  it_computeOverallScore,
  it_extractScoreData,
  it_normalizeDimensions,
} from "./evaluation/scoring";

export type { ItEvaluationConfig } from "./evaluation/types";

function it_buildUnavailableEvaluation(params: {
  question: string;
  reason: string;
  dimensions: string[];
  notes: ItNoteHit[];
  promptText?: string;
  raw?: string;
}): ItEvaluation {
  const scores: Record<string, number> = {};
  const noteUsage = params.notes.length
    ? params.notes.slice(0, 3).map((note) => `${note.source} :: ${note.snippet}`)
    : [];
  const noteSuggestions = params.notes.length
    ? params.notes.slice(0, 3).map((note) => `可参考 ${note.snippet}`)
    : [];
  return {
    topicTitle: params.question || "未命名",
    topicSummary: params.reason,
    scores,
    overallScore: 0,
    strengths: [],
    issues: [params.reason],
    improvements: [],
    nextFocus: [],
    noteUsage,
    noteSuggestions,
    revisedAnswers: [],
    mode: "heuristic",
    raw: params.raw,
    prompt: params.promptText,
  };
}

export async function it_evaluateAnswer(
  question: string,
  transcript: string,
  acoustic: ItAcousticMetrics,
  notes: ItNoteHit[],
  config: ItEvaluationConfig,
  questionList: string[],
  questionAnswers?: Array<{ question: string; answer: string }>,
  materialText?: string,
  contextQuestions?: string[],
  customSystemPrompt?: string,
  customDemoPrompt?: string,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void,
): Promise<ItEvaluation> {
  const trace = it_createTraceLogger(onTrace);
  const lowSpeech =
    (acoustic.speechDurationSec ?? 0) < 2 || transcript.trim().length < 10;
  const dimensions = it_normalizeDimensions(config.dimensions);
  const questions = questionList.length ? questionList : question ? [question] : [];
  const timePlan = [4, 3, 3];
  const resolvedAnswers =
    questionAnswers && questionAnswers.length
      ? questionAnswers
      : it_splitTranscriptByQuestions(questions, transcript);

  if (lowSpeech) {
    return it_buildUnavailableEvaluation({
      question: question || "无有效回答",
      reason: "未检测到有效语音内容，请确保麦克风输入正常并重新作答。",
      dimensions,
      notes,
      raw: "no_speech_detected",
    });
  }

  const systemPrompt =
    customSystemPrompt?.trim() ||
    [
      "你是严格、直接的中文面试评审，仅输出 JSON，不要出现英语标签、客套或安慰语。",
      "评分规则（1-10，整数）：10=卓越/完整无明显缺陷；8=良好仅有轻微问题；6=基本达标但有明显缺口；4=不达标；2=严重不足/几乎无有效内容；1=违禁或完全失败。",
      "若语音时长极短、长时间静音或回答缺失，整体与各维度不得高于2，并在 issues 中说明原因。",
      "若未覆盖题干要点、逻辑混乱或无可执行对策，相关维度不高于4。",
      "严禁使用“继续加油”等安慰式措辞，问题描述必须直白、具体、可执行。",
      "strengths/issues/improvements 至少各3条；nextFocus 至少2条。",
      "revised 必须分段输出，至少3段，段落之间空一行，段落内容按步骤/要点展开。",
      "输出前自检：revised 至少包含两处空行（\\n\\n）。若未满足，请先调整为多段后再输出。",
      "先生成 outlineRevised，再按 outlineRevised 的一级标题组织 revised，一级标题必须作为段落标题单独成行。",
      "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
      "outlineOriginal/outlineRevised 必须为 Markdown 列表文本字符串（每题8-18条），分别对应本题“原回答提纲”与“示范提纲”。",
      "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级，至少两级，且必须出现二级缩进（两个空格+ -），禁止使用箭头符号与平铺列表。",
      "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
      "每条<=20字。",
      "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
      "如提供检索笔记，必须在 noteUsage/noteSuggestions 中列出可用素材与可参考思路（至少2条），格式: source :: 用法/思路。",
    ].join("\n");
  const demoPrompt = customDemoPrompt?.trim();
  const material = materialText?.trim() || "";
  const backgroundQuestions =
    contextQuestions && contextQuestions.length ? contextQuestions : [];
  const staticPromptParts = [
    demoPrompt ? `示范补充要求:\n${demoPrompt}` : "示范补充要求: 无",
    material ? `材料:\n${material}` : "材料: 无",
    backgroundQuestions.length
      ? `背景题目列表(仅供参考):\n${backgroundQuestions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "背景题目列表(仅供参考): 无",
    questions.length
      ? `本次评审题目列表:\n${questions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "本次评审题目列表: 无",
    `本题题干:\n${question || "未提供"}`,
    `评分维度(每项1-10分): ${dimensions.join("。")}`,
    "评分输出字段必须使用 overallScore 与 scores（维度:分数），禁止使用“评分/维度评分/维度Scores”等变体。",
    "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
    "outlineOriginal/outlineRevised 必须为 Markdown 列表文本字符串（每题8-18条），分别对应本题“原回答提纲”与“示范提纲”。",
    "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级，至少两级，禁止使用箭头符号。",
    "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
    "每条<=20字。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    notes.length
      ? `检索笔记:\n${notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\n")}`
      : "检索笔记: 无",
  ];

  const dynamicPromptParts = [
    `本题回答:\n${transcript || "未提供"}`,
    questions.length
      ? `本次评审回答:\n${resolvedAnswers
          .map((item, idx) => `${idx + 1}. ${item.answer || "（空）"}`)
          .join("\n")}`
      : "本次评审回答: 无",
    `声学摘要:\n${it_buildSummary(acoustic)}`,
  ];

  const staticPrompt = staticPromptParts.join("\n\n");
  const dynamicPrompt = dynamicPromptParts.join("\n\n");
  const userPrompt = [staticPrompt, dynamicPrompt].filter(Boolean).join("\n\n");
  const promptText = `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`;

  if (!it_canUseLlm(config) || config.provider === "heuristic") {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 未配置或不可用，无法生成评分与示范。",
      dimensions,
      notes,
      promptText,
    });
  }

  const retryValue = Number(config.maxRetries ?? 1);
  const resolvedRetries = Number.isFinite(retryValue) ? Math.max(0, retryValue) : 1;
  const formatGuard =
    "上次输出未通过 JSON 校验。请仅输出合法 JSON 对象，不要代码块或多余文本。";
  const parseAttempts = 2;
  let content = "";
  let parsed: any | null = null;
  let parsedRevised: any[] = [];
  let lastError: string | undefined;
  let finalPromptText = promptText;
  for (let attempt = 0; attempt < parseAttempts; attempt += 1) {
    const attemptDynamicPrompt =
      attempt === 0 ? dynamicPrompt : `${dynamicPrompt}\n\n${formatGuard}`;
    const attemptPrompt = [staticPrompt, attemptDynamicPrompt]
      .filter(Boolean)
      .join("\n\n");
    finalPromptText = `System:\n${systemPrompt}\n\nUser:\n${attemptPrompt}`;
    const callConfig = {
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        topP: config.topP,
        timeoutSec: config.timeoutSec,
        maxRetries: resolvedRetries,
        antiRepeat: config.antiRepeat,
        useResponses: config.useResponses,
        apiMode: config.apiMode,
        responsesPath: config.responsesPath,
        toolsPreset: config.toolsPreset,
        include: config.include,
        store: config.store,
        promptCacheKey: config.promptCacheKey,
        webSearch: config.webSearch,
        reasoningEffort: config.reasoningEffort,
        maxOutputTokens: config.maxOutputTokens,
        reusePrefix: config.reusePrefix,
        stream: config.stream,
        template: config.template,
        templateEnv: config.templateEnv,
        templateContext: config.templateContext,
        templateVars: config.templateVars,
        templateMaxRetries: config.templateMaxRetries,
      };
    try {
      onStream?.({ text: "", reset: true });
      await trace.logLlmTemplateRequest("面试评价（评审）", callConfig, [
        { role: "system", content: systemPrompt },
        { role: "user", content: attemptPrompt },
      ], callConfig.stream);
      content = await it_requestLlmChatStreaming(
        callConfig,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: attemptPrompt },
        ],
        {
          onDelta: onStream ? (_delta, full) => onStream({ text: full }) : undefined,
          stream: callConfig.stream,
        },
      );
      onStream?.({ text: content, done: true });
      trace.logLlmTemplateResponse("面试评价（评审）", callConfig, content);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      trace.logLlmTemplateError("面试评价（评审）", callConfig, err);
      continue;
    }
    parsed = it_extractJsonPayload(content);
    if (parsed) {
      parsedRevised = it_pickRevisedAnswers(parsed);
      if (parsedRevised.length) {
        break;
      }
    }
  }

  if (!parsed) {
    return it_buildUnavailableEvaluation({
      question,
      reason: lastError
        ? "LLM 调用失败，无法生成评分与示范。"
        : "LLM 输出解析失败，无法生成评分与示范。",
      dimensions,
      notes,
      raw: lastError || content,
      promptText: finalPromptText,
    });
  }
  if (!parsedRevised.length) {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 输出缺少 revisedAnswers，无法生成评分与示范。",
      dimensions,
      notes,
      raw: content,
      promptText: finalPromptText,
    });
  }

  try {
    const scoreData = it_extractScoreData(parsed);
    const mappedScores = scoreData.scores;
    const overallScore =
      Number.isFinite(scoreData.overall)
        ? (scoreData.overall as number)
        : it_computeOverallScore(mappedScores, dimensions);
    const parsedImprovements = it_toStringArray(parsed.improvements);
    const parsedNoteUsage = it_toStringArray(
      parsed.noteUsage ?? parsed.note_usage ?? parsed.noteUse ?? parsed.note_use,
    );
    const parsedNoteSuggestions = it_toStringArray(
      parsed.noteSuggestions ??
        parsed.note_suggestions ??
        parsed.noteSuggestion ??
        parsed.note_suggestion,
    );
    const fallbackNoteUsage =
      notes.length && !parsedNoteUsage.length
        ? notes.slice(0, 3).map((note) => `${note.source} :: ${note.snippet}`)
        : parsedNoteUsage;
    const fallbackNoteSuggestions =
      notes.length && !parsedNoteSuggestions.length
        ? notes.slice(0, 3).map((note) => `可参考：${note.snippet}`)
        : parsedNoteSuggestions;
    const revisedAnswers = parsedRevised.map((item: any, idx: number) => {
      const estimated =
        Number(item?.estimatedTimeMin ?? item?.estimated_time_min) ||
        timePlan[idx] ||
        3;
      const outlineOriginalRaw = it_toOutlineArray(
        item?.outlineOriginal ??
          item?.outline_original ??
          item?.outlineUser ??
          item?.outline_user ??
          item?.outlineMine ??
          item?.outline_mine ??
          item?.originalOutline ??
          item?.original_outline,
      );
      const outlineRevisedRaw = it_toOutlineArray(
        item?.outlineRevised ??
          item?.outline_revised ??
          item?.outlineDemo ??
          item?.outline_demo ??
          item?.revisedOutline ??
          item?.revised_outline,
      );
      return {
        question: String(item?.question || questions[idx] || `第${idx + 1}题`),
        original: String(item?.original || resolvedAnswers[idx]?.answer || ""),
        revised: String(item?.revised || ""),
        estimatedTimeMin: estimated,
        outlineOriginal: outlineOriginalRaw.length ? outlineOriginalRaw : undefined,
        outlineRevised: outlineRevisedRaw.length ? outlineRevisedRaw : undefined,
      };
    });

    const needOutlineFix = revisedAnswers.some(
      (item) =>
        !it_isOutlineKeywordLike(item.outlineOriginal) ||
        !it_isOutlineKeywordLike(item.outlineRevised) ||
        !it_outlineHasIndent(item.outlineOriginal) ||
        !it_outlineHasIndent(item.outlineRevised),
    );
    if (needOutlineFix && it_canUseLlm(config)) {
      const regenerated = await it_generateOutlines(
        config,
        revisedAnswers.map((item) => ({
          question: item.question,
          original: item.original,
          revised: item.revised,
        })),
        onTrace,
        onStream,
      );
      if (regenerated && regenerated.length) {
        regenerated.forEach((entry, idx) => {
          const original = it_isOutlineKeywordLike(entry.outlineOriginal)
            ? entry.outlineOriginal
            : undefined;
          const revised = it_isOutlineKeywordLike(entry.outlineRevised)
            ? entry.outlineRevised
            : undefined;
          if (revisedAnswers[idx]) {
            revisedAnswers[idx].outlineOriginal = original ?? revisedAnswers[idx].outlineOriginal;
            revisedAnswers[idx].outlineRevised = revised ?? revisedAnswers[idx].outlineRevised;
          }
        });
      }
    }
    const hasRevisedOutline = revisedAnswers.every(
      (item) => Array.isArray(item.outlineRevised) && item.outlineRevised.length,
    );
    const answerMode = config.answerMode || "two-step";
    if (answerMode === "two-step" && hasRevisedOutline && it_canUseLlm(config)) {
      const regeneratedRevised = await it_generateRevisedByOutline(
        config,
        revisedAnswers.map((item) => ({
          question: item.question,
          outlineRevised: item.outlineRevised,
          notes,
        })),
        demoPrompt,
        material,
        backgroundQuestions,
        onTrace,
        onStream,
      );
      if (regeneratedRevised && regeneratedRevised.length) {
        regeneratedRevised.forEach((text, idx) => {
          if (revisedAnswers[idx] && String(text || "").trim()) {
            revisedAnswers[idx].revised = String(text || "");
          }
        });
      }
    }
    return {
      topicTitle: parsed.topicTitle || question || "未命名",
      topicSummary: parsed.topicSummary || "",
      scores: mappedScores,
      overallScore,
      strengths: it_toStringArray(parsed.strengths),
      issues: it_toStringArray(parsed.issues),
      improvements: parsedImprovements,
      nextFocus: it_toStringArray(parsed.nextFocus),
      noteUsage: fallbackNoteUsage,
      noteSuggestions: fallbackNoteSuggestions,
      revisedAnswers,
      mode: "llm",
      raw: content,
      prompt: finalPromptText,
    };
  } catch {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 输出解析失败，无法生成评分与示范。",
      dimensions,
      notes,
      raw: content,
      promptText: finalPromptText,
    });
  }
}
