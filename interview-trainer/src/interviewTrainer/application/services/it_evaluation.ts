import {
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
} from "../../../protocol/interviewTrainer";
import { it_requestLlmChatStreaming } from "../../infra/clients/llmClient";
import { it_createTraceLogger } from "../../infra/logging/it_traceLogger";
import type { ItEvaluationConfig } from "../../domain/evaluation/types";
import { it_canUseLlm, it_splitTranscriptByQuestions } from "../../domain/evaluation/prompt";
import { it_extractJsonPayload, it_pickRevisedAnswers } from "../../domain/evaluation/parser";
import { it_normalizeDimensions } from "../../domain/evaluation/scoring";
import { it_buildUnavailableEvaluation } from "./it_evaluationFallback";
import {
  it_buildDynamicPromptParts,
  it_buildPromptText,
  it_buildStaticPromptParts,
  it_buildSystemPrompt,
} from "./it_evaluationPrompt";
import { it_buildEvaluationFromParsed } from "./it_evaluationResult";

export type { ItEvaluationConfig } from "../../domain/evaluation/types";

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

  const systemPrompt = it_buildSystemPrompt(customSystemPrompt);
  const demoPrompt = customDemoPrompt?.trim();
  const material = materialText?.trim() || "";
  const backgroundQuestions =
    contextQuestions && contextQuestions.length ? contextQuestions : [];
  const staticPromptParts = it_buildStaticPromptParts({
    demoPrompt,
    material,
    backgroundQuestions,
    questions,
    question,
    dimensions,
    notes,
  });
  const dynamicPromptParts = it_buildDynamicPromptParts({
    transcript,
    resolvedAnswers,
    questions,
    acoustic,
  });

  const staticPrompt = staticPromptParts.join("\n\n");
  const dynamicPrompt = dynamicPromptParts.join("\n\n");
  const promptText = it_buildPromptText(systemPrompt, staticPrompt, dynamicPrompt);

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
    finalPromptText = it_buildPromptText(systemPrompt, staticPrompt, attemptDynamicPrompt);
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
      promptCacheKey: config.promptCacheKey,
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
      await trace.logLlmTemplateRequest(
        "面试评价（评审）",
        callConfig,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: attemptPrompt },
        ],
        callConfig.stream,
      );
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
    return await it_buildEvaluationFromParsed({
      parsed,
      parsedRevised,
      question,
      questions,
      resolvedAnswers,
      notes,
      dimensions,
      config,
      timePlan,
      demoPrompt,
      material,
      backgroundQuestions,
      onTrace,
      onStream,
      content,
      finalPromptText,
    });
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