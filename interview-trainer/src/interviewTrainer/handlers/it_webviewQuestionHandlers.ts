import type {
  ItAcousticMetrics,
  ItNoteHit,
  ItRevisedAnswer,
} from "../../protocol/interviewTrainer";
import { it_applySecretOverrides } from "../api/it_apiConfig";
import { it_evaluateAnswer } from "../core/it_evaluation";
import { it_parseQuestions } from "../core/it_questionParser";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../storage/it_questionCache";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerQuestionHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/parseQuestions", async (msg) => {
    const text = String(msg.data?.text || "");
    host.configBundle = host.configService.loadBundle();
    host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);
    host.configBundle.api = await it_applySecretOverrides(
      host.context,
      host.configBundle.api,
    );
    const cacheRoot = host.context.globalStorageUri?.fsPath;
    if (cacheRoot && text.trim()) {
      const cached = await it_readQuestionParseCache(cacheRoot, text);
      if (cached && (cached.material || cached.questions.length)) {
        return {
          material: cached.material,
          questions: cached.questions,
          source: cached.source || "cache",
        };
      }
    }
    const taskCfg = host.configBundle.skill.llm_tasks || {};
    const taskProfile =
      String(taskCfg.question_parse || taskCfg.questionParse || "").trim() || undefined;
    const llmConfig = host.it_getLlmConfig(taskProfile);
    const parsed = await it_parseQuestions(text, llmConfig);
    if (parsed.debug?.request) {
      host.logCorpusTrace("题目解析 LLM 请求", parsed.debug.request);
    } else if (parsed.error === "LLM not configured") {
      host.logCorpusTrace("题目解析 LLM 未配置", {});
    }
    if (parsed.debug?.response) {
      host.logCorpusTrace("题目解析 LLM 返回", parsed.debug.response);
    }
    if (parsed.error && parsed.error !== "LLM not configured") {
      host.logCorpusTrace("题目解析 LLM 失败", { error: parsed.error });
    }
    if (parsed.source === "llm" && !parsed.questions.length && parsed.raw) {
      host.logCorpusTrace("题目解析 LLM 返回不完整", {
        raw: String(parsed.raw).slice(0, 500),
      });
    }
    if (cacheRoot && (parsed.material || parsed.questions.length)) {
      await it_writeQuestionParseCache(cacheRoot, text, {
        material: parsed.material || "",
        questions: parsed.questions || [],
        source: parsed.source,
      });
    }
    return parsed;
  });
  host.webviewProtocol.on("it/regenerateDemoAnswer", async (msg) => {
    const payload = msg.data || {};
    const question = String(payload.question || "").trim();
    if (!question) {
      throw new Error("题目为空，无法重新生成示范回答。");
    }
    const rawIndex = Number(payload.questionIndex ?? 0);
    const questionIndex =
      Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
    const answer = String(payload.answer || "");
    const questionText = String(payload.questionText || "");
    const contextQuestions = Array.isArray(payload.contextQuestions)
      ? payload.contextQuestions.map((item: any) => String(item)).filter(Boolean)
      : [];
    const notes: ItNoteHit[] = Array.isArray(payload.notes)
      ? payload.notes
          .map((item: any) => ({
            score: Number(item?.score ?? 0),
            source: String(item?.source || ""),
            snippet: String(item?.snippet || ""),
          }))
          .filter((item: ItNoteHit) => item.source || item.snippet)
      : [];
    const incomingAcoustic = payload.acoustic as ItAcousticMetrics | undefined;
    const fallbackDuration = Math.max(10, Math.round(answer.trim().length / 4));
    const acoustic: ItAcousticMetrics = incomingAcoustic && incomingAcoustic.durationSec
      ? incomingAcoustic
      : {
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

    host.configBundle = host.configService.loadBundle();
    host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);
    host.configBundle.api = await it_applySecretOverrides(
      host.context,
      host.configBundle.api,
    );
    const env = host.configBundle.api.active?.environment || "prod";
    const envConfig = host.configBundle.api.environments?.[env] ?? {};
    const taskCfg = host.configBundle.skill.llm_tasks || {};
    const evalProfileId = String(taskCfg.evaluation || taskCfg.evaluate || "").trim() || undefined;
    const evalLlmConfig = host.it_getLlmConfig(evalProfileId);
    if (evalLlmConfig) {
      evalLlmConfig.maxOutputTokens = 0;
    }
    const evalProvider = evalLlmConfig?.provider || envConfig.llm?.provider || "heuristic";
    const evalIsDoubao = evalProvider === "volc_doubao";
    const evalDefaultBase = evalIsDoubao
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
    const evalDefaultModel = evalIsDoubao
      ? "doubao-seed-1-8-251228"
      : "ernie-4.5-turbo-128k";
    const evaluationConfig = {
      provider: evalProvider,
      model: evalLlmConfig?.model || envConfig.llm?.model || evalDefaultModel,
      baseUrl: evalLlmConfig?.baseUrl || envConfig.llm?.base_url || evalDefaultBase,
      apiKey: evalLlmConfig?.apiKey || envConfig.llm?.api_key || "",
      temperature: Number(evalLlmConfig?.temperature ?? envConfig.llm?.temperature ?? 0.8),
      topP: Number(evalLlmConfig?.topP ?? envConfig.llm?.top_p ?? 0.8),
      timeoutSec: Number(evalLlmConfig?.timeoutSec ?? envConfig.llm?.timeout_sec ?? 60),
      maxRetries: Math.max(
        5,
        Number(evalLlmConfig?.maxRetries ?? envConfig.llm?.max_retries ?? 1),
      ),
      useResponses: Boolean(
        evalLlmConfig?.useResponses ??
          envConfig.llm?.use_responses ??
          envConfig.llm?.useResponses ??
          (evalIsDoubao ? true : false),
      ),
      webSearch: Boolean(
        evalLlmConfig?.webSearch ??
          envConfig.llm?.web_search ??
          envConfig.llm?.webSearch ??
          (evalIsDoubao ? true : false),
      ),
      reasoningEffort:
        evalLlmConfig?.reasoningEffort ??
        envConfig.llm?.reasoning_effort ??
        envConfig.llm?.reasoningEffort ??
        (evalIsDoubao ? "medium" : undefined),
      maxOutputTokens: 0,
      reusePrefix: Boolean(
        evalLlmConfig?.reusePrefix ??
          envConfig.llm?.reuse_prefix ??
          envConfig.llm?.reusePrefix ??
          (evalIsDoubao ? true : false),
      ),
      language: host.configBundle.skill.evaluation?.language || "zh-CN",
      dimensions: host.configBundle.skill.evaluation?.dimensions ?? [],
      answerMode:
        host.configBundle.skill.evaluation?.answer_mode ??
        host.configBundle.skill.evaluation?.answerMode ??
        "two-step",
    };
    const streamHandler = (update: {
      text: string;
      done?: boolean;
      reset?: boolean;
    }) => {
      if (host.configSnapshot?.streaming?.enabled === false) {
        return;
      }
      host.webviewProtocol.send("it/evaluationStreamUpdate", {
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
      payload.systemPrompt,
      payload.demoPrompt,
      undefined,
      streamHandler,
    );
    const revised: ItRevisedAnswer | undefined = evaluation.revisedAnswers?.[0];
    if (!revised) {
      throw new Error("未生成有效示范回答。");
    }
    return revised;
  });
}
