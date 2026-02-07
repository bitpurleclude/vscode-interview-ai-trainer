import type * as vscode from "vscode";
import type {
  ItAcousticMetrics,
  ItNoteHit,
  ItRevisedAnswer,
} from "../../../protocol/interviewTrainer";
import { it_evaluateAnswer } from "../services/it_evaluation";
import type { ItLlmConfig } from "../services/it_llmGateway";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../services/it_storageGateway";
import {
  it_resolveBindingTemplate,
  type ItTemplateRuntime,
} from "../services/it_templateGateway";
import { it_parseQuestions, type ItParsedQuestions } from "../services/it_questionParser";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";

export type ItQuestionUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  isStreamingEnabled: () => boolean;
  emitEvaluationStreamUpdate: (update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
};

export type ItQuestionParseResult = {
  configBundle: ItConfigBundle;
  parsed: ItParsedQuestions;
};

export type ItRegenerateDemoResult = {
  configBundle: ItConfigBundle;
  revised: ItRevisedAnswer;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_buildTemplateLlmConfig(runtime: ItTemplateRuntime): ItLlmConfig {
  const fallback: ItLlmConfig = {
    provider: "openai_compatible",
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: 0.8,
    topP: 0.8,
    timeoutSec: 60,
    maxRetries: 0,
    antiRepeat: false,
    useResponses: false,
    apiMode: "chat",
    responsesPath: "",
    reasoningEffort: undefined,
    maxOutputTokens: 0,
    reusePrefix: false,
    stream: true,
  };
  return {
    ...fallback,
    template: runtime.template,
    templateEnv: runtime.environment,
    templateContext: runtime.context,
  };
}

async function it_loadTemplateReadyBundle(
  context: ItQuestionUseCaseContext,
): Promise<ItConfigBundle> {
  const configBundle = context.configService.loadBundle();
  const ensured = await context.configService.ensureTemplatesConfig(configBundle);
  ensured.api = context.resolveApiConfigWithProviders(ensured.api);
  return ensured;
}


function it_toParsedSource(value: unknown): "llm" | "heuristic" {
  return value === "llm" ? "llm" : "heuristic";
}

function it_toQuestionIndex(value: unknown): number {
  const raw = Number(value ?? 0);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

function it_toQuestionList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
}

function it_toNotes(value: unknown): ItNoteHit[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const record = it_asRecord(item);
      return {
        score: Number(record.score ?? 0),
        source: String(record.source || ""),
        snippet: String(record.snippet || ""),
      };
    })
    .filter((item) => item.source || item.snippet);
}

function it_resolveAcoustic(
  value: unknown,
  answer: string,
): ItAcousticMetrics {
  const incoming = value as ItAcousticMetrics | undefined;
  const fallbackDuration = Math.max(10, Math.round(answer.trim().length / 4));
  if (incoming && incoming.durationSec) {
    return incoming;
  }
  return {
    durationSec: fallbackDuration,
    speechDurationSec: Math.max(2, fallbackDuration - 1),
    speechRateWpm: undefined,
    pauseCount: 0,
    pauseAvgSec: 0,
    pauseMaxSec: 0,
    rmsDbMean: -20,
    rmsDbStd: 0,
    snrDb: undefined,
  };
}

export async function it_parseQuestionsFromWebview(params: {
  context: ItQuestionUseCaseContext;
  payload: unknown;
}): Promise<ItQuestionParseResult> {
  const payload = it_asRecord(params.payload);
  const text = String(payload.text || "");
  const configBundle = await it_loadTemplateReadyBundle(params.context);
  const environment = configBundle.api.active?.environment || "prod";
  const templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const cacheRoot = params.context.extensionContext.globalStorageUri?.fsPath;

  if (cacheRoot && text.trim()) {
    const cached = await it_readQuestionParseCache(cacheRoot, text);
    if (cached && (cached.material || cached.questions.length)) {
      return {
        configBundle,
        parsed: {
          material: cached.material,
          questions: cached.questions,
          source: it_toParsedSource(cached.source),
        },
      };
    }
  }

  const parseTemplate = it_resolveBindingTemplate(
    templatesConfig,
    environment,
    "llm",
    "questionParse",
  );
  if (!parseTemplate) {
    throw new Error("LLM ????????????????????");
  }

  const llmConfig = it_buildTemplateLlmConfig({
    template: parseTemplate,
    environment,
    context: params.context.extensionContext,
  });
  const parsed = await it_parseQuestions(
    text,
    llmConfig,
    undefined,
    params.context.logCorpusTrace,
  );

  if (cacheRoot && (parsed.material || parsed.questions.length)) {
    await it_writeQuestionParseCache(cacheRoot, text, {
      material: parsed.material || "",
      questions: parsed.questions || [],
      source: parsed.source,
    });
  }

  return { configBundle, parsed };
}

export async function it_regenerateDemoAnswerFromWebview(params: {
  context: ItQuestionUseCaseContext;
  payload: unknown;
}): Promise<ItRegenerateDemoResult> {
  const payload = it_asRecord(params.payload);
  const question = String(payload.question || "").trim();
  if (!question) {
    throw new Error("????????????????");
  }

  const questionIndex = it_toQuestionIndex(payload.questionIndex);
  const answer = String(payload.answer || "");
  const questionText = String(payload.questionText || "");
  const contextQuestions = it_toQuestionList(payload.contextQuestions);
  const notes = it_toNotes(payload.notes);
  const acoustic = it_resolveAcoustic(payload.acoustic, answer);
  const configBundle = await it_loadTemplateReadyBundle(params.context);
  const environment = configBundle.api.active?.environment || "prod";
  const templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const evaluationTemplate = it_resolveBindingTemplate(
    templatesConfig,
    environment,
    "llm",
    "evaluation",
  );
  if (!evaluationTemplate) {
    throw new Error("LLM ??????????????????");
  }

  const evalLlmConfig = it_buildTemplateLlmConfig({
    template: evaluationTemplate,
    environment,
    context: params.context.extensionContext,
  });
  evalLlmConfig.maxOutputTokens = 0;

  const evaluationConfig = {
    provider: evalLlmConfig.provider || "template",
    model: evalLlmConfig.model || "",
    baseUrl: evalLlmConfig.baseUrl || "",
    apiKey: "",
    temperature: Number(evalLlmConfig.temperature ?? 0.8),
    topP: Number(evalLlmConfig.topP ?? 0.8),
    timeoutSec: Number(evalLlmConfig.timeoutSec ?? 60),
    maxRetries: Math.max(5, Number(evalLlmConfig.maxRetries ?? 1)),
    useResponses: Boolean(evalLlmConfig.useResponses ?? false),
    reasoningEffort: evalLlmConfig.reasoningEffort ?? undefined,
    maxOutputTokens: 0,
    reusePrefix: Boolean(evalLlmConfig.reusePrefix ?? false),
    template: evalLlmConfig.template,
    templateEnv: evalLlmConfig.templateEnv,
    templateContext: evalLlmConfig.templateContext,
    templateVars: evalLlmConfig.templateVars,
    templateMaxRetries: evalLlmConfig.templateMaxRetries,
    language: configBundle.skill.evaluation?.language || "zh-CN",
    dimensions: configBundle.skill.evaluation?.dimensions ?? [],
    answerMode:
      configBundle.skill.evaluation?.answer_mode ??
      configBundle.skill.evaluation?.answerMode ??
      "two-step",
  };

  const streamHandler = (update: { text: string; done?: boolean; reset?: boolean }) => {
    if (!params.context.isStreamingEnabled()) {
      return;
    }
    params.context.emitEvaluationStreamUpdate({
      questionIndex,
      ...update,
    });
  };

  const evaluation = await it_evaluateAnswer(
    question,
    answer,
    acoustic,
    notes,
    evaluationConfig,
    [question],
    [{ question, answer }],
    questionText,
    contextQuestions,
    typeof payload.systemPrompt === "string" ? payload.systemPrompt : undefined,
    typeof payload.demoPrompt === "string" ? payload.demoPrompt : undefined,
    params.context.logCorpusTrace,
    streamHandler,
  );

  const revised = evaluation.revisedAnswers?.[0];
  if (!revised) {
    throw new Error("??????????");
  }

  return { configBundle, revised };
}
