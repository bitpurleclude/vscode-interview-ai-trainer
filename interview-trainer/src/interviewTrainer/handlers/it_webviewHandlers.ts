import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import * as vscode from "vscode";
import {
  ItAcousticMetrics,
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItNoteHit,
  ItRevisedAnswer,
  ItState,
} from "../../protocol/interviewTrainer";
import {
  ItApiConfig,
  ItConfigBundle,
  it_applySecretOverrides,
  it_ensureConfigFiles,
  it_getUserProviderDir,
} from "../api/it_apiConfig";
import { ItConfigService } from "../api/it_configService";
import { it_callLlmChat } from "../api/it_llm";
import { ItLlmConfig } from "../api/it_llmTypes";
import { it_callBaiduAsr } from "../api/it_baidu";
import { it_callVolcAsr } from "../api/it_volc_asr";
import { it_callEmbedding } from "../api/it_embedding";
import { it_appendReportAsync, it_updateReferenceNotesFileAsync } from "../core/it_report";
import { it_evaluateAnswer } from "../core/it_evaluation";
import { it_clearEmbeddingMemoryCache } from "../core/it_notes";
import { it_listHistoryItems } from "../storage/it_history";
import {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_writeTopicMetaAsync,
} from "../storage/it_sessions";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../storage/it_questionCache";
import { it_parseQuestions } from "../core/it_questionParser";
import { it_hashText, it_normalizeText } from "../utils/it_text";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import { WebviewProtocol } from "../../webview/WebviewProtocol";

export type ItWebviewHandlersHost = {
  context: vscode.ExtensionContext;
  webviewProtocol: WebviewProtocol;
  outputChannel: vscode.OutputChannel;
  traceLogsEnabled: boolean;
  state: ItState;
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  configService: ItConfigService;
  corpusDirty: boolean;
  detectedInput: string | null;
  availableInputs: string[] | null;
  analysisAbort: { aborted: boolean } | null;
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  requireWorkspaceRoot: () => string;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  updateEmbeddingWarmup: (next: Partial<ItEmbeddingWarmupState>) => void;
  updateState: (next: Partial<ItState>) => void;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  logEmbeddingTestFailure: (error: unknown) => void;
  logLlmTestFailure: (error: unknown, detail?: Record<string, unknown>) => void;
  it_getLlmConfig: (profileId?: string) => ItLlmConfig | null;
  it_findFfmpeg: () => Promise<string | null>;
  it_listInputs: (ffmpeg: string) => Promise<string[]>;
  it_startNativeRecording: (device?: string) => Promise<{ tmpDir: string; tmpPath: string; startedAt: number }>;
  it_stopNativeRecording: () => Promise<{ audio: ItAnalyzeRequest["audio"]; locked?: string[] }>;
  handleAnalyze: (request: ItAnalyzeRequest) => Promise<ItAnalyzeResponse>;
  it_firstNonEmpty: (...values: Array<string | undefined | null>) => string;
  normalizeWorkspaceKey: (root: string) => string;
};

export function it_registerHandlers(host: ItWebviewHandlersHost): void {
    host.webviewProtocol.on("it/getState", () => host.state);
    host.webviewProtocol.on("it/getConfig", async () => {
      const snapshot = await host.refreshConfigSnapshot();
      host.scheduleEmbeddingWarmup("config");
      return snapshot;
    });
    host.webviewProtocol.on("it/enableTraceLogs", () => {
      host.traceLogsEnabled = true;
      host.outputChannel.show(true);
      host.outputChannel.appendLine(
        `[${new Date().toISOString()}] 已开启笔记学习日志输出`,
      );
      return { enabled: true };
    });
    host.webviewProtocol.on("it/listHistory", async (msg) => {
      const workspaceRoot = host.requireWorkspaceRoot();
      const sessionsRoot = path.join(
        workspaceRoot,
        host.configBundle.skill.sessions_dir || "sessions",
      );
      const filenames = host.configBundle.skill.filenames ?? {};
      const topics = host.configBundle.skill.topics ?? {};
      return await it_listHistoryItems(
        sessionsRoot,
        msg.data?.query,
        msg.data?.limit,
        {
          allowUnicode: filenames.allow_unicode ?? true,
          maxSlugLen: filenames.max_slug_len ?? 16,
          centerSubdir: topics.center_subdir || "",
        },
      );
    });
    host.webviewProtocol.on("it/openSettings", async () => {
      it_ensureConfigFiles(host.context);
      const configDir = host.context.globalStorageUri.fsPath;
      const target = path.join(configDir, "interview_trainer", "api_config.yaml");
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(target),
      );
    });
    host.webviewProtocol.on("it/openMicSettings", async () => {
      if (process.platform === "win32") {
        await vscode.env.openExternal(
          vscode.Uri.parse("ms-settings:privacy-microphone"),
        );
        return;
      }
      if (process.platform === "darwin") {
        await vscode.env.openExternal(
          vscode.Uri.parse(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
          ),
        );
        return;
      }
      void vscode.window.showInformationMessage(
        "请在系统设置中开启麦克风权限后重试。",
      );
    });
    host.webviewProtocol.on("it/reloadWindow", async () => {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
    host.webviewProtocol.on("it/startNativeRecording", async (msg) => {
      const device = msg.data?.device ? String(msg.data.device) : undefined;
      return await host.it_startNativeRecording(device);
    });
    host.webviewProtocol.on("it/stopNativeRecording", async () => {
      return await host.it_stopNativeRecording();
    });
    host.webviewProtocol.on("it/listNativeInputs", async (msg) => {
      if (msg?.data?.refresh) {
        host.availableInputs = null;
        host.detectedInput = null;
      }
      const ffmpeg = await host.it_findFfmpeg();
      if (!ffmpeg) {
        throw new Error("未找到 ffmpeg，无法列出输入设备");
      }
      const inputs = await host.it_listInputs(ffmpeg);
      return { inputs };
    });
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
      );
      const revised: ItRevisedAnswer | undefined = evaluation.revisedAnswers?.[0];
      if (!revised) {
        throw new Error("未生成有效示范回答。");
      }
      return revised;
    });
    host.webviewProtocol.on("it/setRetrievalEnabled", async (msg) => {
      const enabled = Boolean(msg.data?.enabled);
      host.configBundle = host.configService.loadBundle();
      host.configBundle.skill = {
        ...host.configBundle.skill,
        retrieval: {
          ...host.configBundle.skill.retrieval,
          enabled,
        },
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      if (enabled) {
        host.scheduleEmbeddingWarmup("retrieval-toggle");
      }
      return { enabled };
    });
    host.webviewProtocol.on("it/updateRetrievalSettings", async (msg) => {
      const payload = msg.data || {};
      const incoming = payload.retrieval || {};
      host.configBundle = host.configService.loadBundle();
      const current = host.configBundle.skill.retrieval || {};
      const currentVector = current.vector || {};
      const incomingVector = incoming.vector || {};
      const env = host.configBundle.api.active?.environment || "prod";
      const storedEmbeddingKey =
        (await host.context.secrets.get(`interviewTrainer.${env}.embedding.apiKey`)) ||
        "";
      host.configBundle.skill = {
        ...host.configBundle.skill,
        retrieval: {
          ...current,
          enabled: incoming.enabled ?? current.enabled,
          mode: incoming.mode || current.mode || "vector",
          top_k: Number(incoming.topK ?? current.top_k ?? 5),
          top_k_notes: Number(incoming.topKNotes ?? current.top_k_notes ?? current.top_k ?? 5),
          top_k_knowledge: Number(incoming.topKKnowledge ?? current.top_k_knowledge ?? current.top_k ?? 5),
          top_k_rubrics: Number(incoming.topKRubrics ?? current.top_k_rubrics ?? current.top_k ?? 5),
          top_k_examples: Number(incoming.topKExamples ?? current.top_k_examples ?? current.top_k ?? 5),
          max_concurrency: Number(incoming.maxConcurrency ?? current.max_concurrency ?? 3),
          embedding_max_concurrency: Number(
            incoming.embeddingMaxConcurrency ?? current.embedding_max_concurrency ?? 1,
          ),
          min_score: Number(incoming.minScore ?? current.min_score ?? 0.2),
          embedding_provider:
            incoming.embeddingProvider ||
            current.embedding_provider ||
            incomingVector.provider ||
            currentVector.provider,
          vector: {
            ...currentVector,
            provider: incomingVector.provider ?? currentVector.provider ?? "volc_doubao",
            base_url:
              incomingVector.baseUrl ??
              currentVector.base_url ??
              "https://ark.cn-beijing.volces.com",
            api_key: host.it_firstNonEmpty(
              incomingVector.apiKey,
              currentVector.api_key,
              storedEmbeddingKey,
            ),
            model: incomingVector.model ?? currentVector.model ?? "doubao-embedding",
            timeout_sec: Number(incomingVector.timeoutSec ?? currentVector.timeout_sec ?? 30),
            max_retries: Number(incomingVector.maxRetries ?? currentVector.max_retries ?? 1),
            batch_size: Number(incomingVector.batchSize ?? currentVector.batch_size ?? 16),
            query_max_chars: Number(
              incomingVector.queryMaxChars ?? currentVector.query_max_chars ?? 1500,
            ),
          },
        },
      };
      const embeddingProvider =
        incoming.embeddingProvider ||
        current.embedding_provider ||
        incomingVector.provider ||
        currentVector.provider;
      if (embeddingProvider) {
        const existing = host.configBundle.providers?.[embeddingProvider] || {
          provider: embeddingProvider,
        };
        host.configService.saveProviderConfig(embeddingProvider, {
          ...existing,
          provider: embeddingProvider,
          embedding: {
            ...(existing.embedding || {}),
            provider: incomingVector.provider ?? existing.embedding?.provider ?? embeddingProvider,
            base_url: incomingVector.baseUrl ?? existing.embedding?.base_url ?? "",
            api_key: host.it_firstNonEmpty(
              incomingVector.apiKey,
              existing.embedding?.api_key,
              storedEmbeddingKey,
            ),
            model: incomingVector.model ?? existing.embedding?.model ?? "",
            timeout_sec: Number(
              incomingVector.timeoutSec ?? existing.embedding?.timeout_sec ?? 30,
            ),
            max_retries: Number(
              incomingVector.maxRetries ?? existing.embedding?.max_retries ?? 1,
            ),
          },
        });
      }
      const resolvedEmbeddingKey =
        host.configBundle.skill.retrieval?.vector?.api_key || "";
      if (resolvedEmbeddingKey) {
        await host.context.secrets.store(
          `interviewTrainer.${env}.embedding.apiKey`,
          resolvedEmbeddingKey,
        );
      }
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      host.scheduleEmbeddingWarmup("retrieval-update");
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/updateTopicSettings", async (msg) => {
      const payload = msg.data || {};
      const incoming = payload.topics || {};
      host.configBundle = host.configService.loadBundle();
      const current = host.configBundle.skill.topics || {};
      const titleModeRaw = String(
        incoming.titleMode ?? incoming.title_mode ?? current.title_mode ?? "llm",
      );
      const titleMode = titleModeRaw === "simple" ? "simple" : "llm";
      const maxTitleLenRaw = Number(
        incoming.maxTitleLen ?? incoming.max_title_len ?? current.max_title_len ?? 18,
      );
      const maxTitleLen = Math.max(4, Math.min(18, maxTitleLenRaw));
      host.configBundle.skill = {
        ...host.configBundle.skill,
        topics: {
          ...current,
          title_mode: titleMode,
          max_title_len: maxTitleLen,
        },
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return { titleMode, maxTitleLen };
    });
    host.webviewProtocol.on("it/updateLlmTaskProfiles", async (msg) => {
      const payload = msg.data || {};
      const tasks = payload.tasks || {};
      host.configBundle = host.configService.loadBundle();
      host.configBundle.skill = host.configService.updateLlmTasks(
        host.configBundle.skill,
        tasks,
      );
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/saveLlmProfile", async (msg) => {
      const payload = msg.data || {};
      const profileId = String(payload.profileId || "").trim();
      if (!profileId || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
        throw new Error("profileId 只能包含字母、数字、_、-");
      }
      host.configBundle = host.configService.loadBundle();
      let apiConfig = { ...host.configBundle.api };
      const resolved = host.configService.resolveEnvironment(
        apiConfig,
        payload.environment,
      );
      const environment = resolved.environment;
      const envConfig = resolved.envConfig;
      const baseLlm = envConfig.llm || {};
      const incoming = payload.profile || {};
      const displayName = String(payload.displayName || "").trim();
      const nextProfile = host.configService.buildLlmProfile({
        incoming,
        baseLlm,
        fallbackProvider: apiConfig.active?.llm,
        profileId,
        displayName,
      });
      apiConfig = host.configService.upsertLlmProfile(
        apiConfig,
        environment,
        profileId,
        nextProfile,
      );
      host.configService.saveApiConfig(apiConfig);
      host.configBundle = host.configService.loadBundle();
      host.configBundle.api = apiConfig;
      host.configSnapshot = host.buildConfigSnapshot(apiConfig);
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/deleteLlmProfile", async (msg) => {
      const payload = msg.data || {};
      const profileId = String(payload.profileId || "").trim();
      if (!profileId) {
        throw new Error("missing profileId");
      }
      host.configBundle = host.configService.loadBundle();
      let apiConfig = { ...host.configBundle.api };
      const resolved = host.configService.resolveEnvironment(
        apiConfig,
        payload.environment,
      );
      const environment = resolved.environment;
      apiConfig = host.configService.removeLlmProfile(apiConfig, environment, profileId);
      host.configService.saveApiConfig(apiConfig);
      host.configBundle = host.configService.loadBundle();
      host.configBundle.api = apiConfig;
      host.configSnapshot = host.buildConfigSnapshot(apiConfig);
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/createProviderConfig", async (msg) => {
      const providerId = String(msg.data?.providerId || "").trim();
      if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
        throw new Error("providerId 只能包含字母、数字、_、-");
      }
      host.configBundle = host.configService.loadBundle();
      if (host.configBundle.providers?.[providerId]) {
        throw new Error("Provider 已存在");
      }
      const displayName = String(msg.data?.displayName || "").trim();
      const payload = {
        provider: providerId,
        display_name: displayName || providerId,
        llm: {
          provider: providerId,
          base_url: "",
          model: "",
          api_key: "",
          temperature: 0.8,
          top_p: 0.8,
          timeout_sec: 60,
          max_retries: 1,
        },
        embedding: {
          provider: providerId,
          base_url: "",
          model: "",
          api_key: "",
          timeout_sec: 30,
          max_retries: 1,
        },
        asr: {
          provider: "",
          base_url: "",
          api_key: "",
          secret_key: "",
          language: "zh",
          dev_pid: 1537,
          timeout_sec: 120,
          max_retries: 1,
        },
      };
      host.configService.saveProviderConfig(providerId, payload);
      host.configBundle = host.configService.loadBundle();
      host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/saveProviderConfig", async (msg) => {
      const providerId = String(msg.data?.providerId || "").trim();
      if (!providerId) {
        throw new Error("missing providerId");
      }
      const incoming = msg.data?.profile || {};
      host.configBundle = host.configService.loadBundle();
      const existing = host.configBundle.providers?.[providerId] || { provider: providerId };
      const next = {
        ...existing,
        ...incoming,
        provider: providerId,
        llm: {
          ...(existing.llm || {}),
          ...(incoming.llm || {}),
        },
        embedding: {
          ...(existing.embedding || {}),
          ...(incoming.embedding || {}),
        },
        asr: {
          ...(existing.asr || {}),
          ...(incoming.asr || {}),
        },
      };
      host.configService.saveProviderConfig(providerId, next);
      host.configBundle = host.configService.loadBundle();
      host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/openProviderConfig", async (msg) => {
      const providerId = String(msg.data?.providerId || "").trim();
      if (!providerId) {
        return;
      }
      const providerDir = it_getUserProviderDir(host.context);
      const target = path.join(providerDir, `${providerId}.yaml`);
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
    });
    host.webviewProtocol.on("it/clearEmbeddingCache", async () => {
      const workspaceRoot = host.requireWorkspaceRoot();
      const cacheRoot = host.context.globalStorageUri?.fsPath;
      if (!cacheRoot) {
        throw new Error("无法定位缓存目录");
      }
      const cacheDir = path.join(
        cacheRoot,
        "embedding_cache",
        it_hashText(host.normalizeWorkspaceKey(workspaceRoot)),
      );
      try {
        await fs.promises.access(cacheDir);
      } catch {
        return { cleared: false, path: cacheDir };
      }
      try {
        await fs.promises.rm(cacheDir, {
          recursive: true,
          force: true,
          maxRetries: 2,
          retryDelay: 50,
        });
      } catch (error) {
        throw new Error(
          `清理缓存失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
      it_clearEmbeddingMemoryCache();
      host.updateEmbeddingWarmup({
        status: "running",
        progress: 0,
        total: 0,
        done: 0,
        message: "向量预计算准备中",
      });
      host.scheduleEmbeddingWarmup("clear-cache", 1000);
      return { cleared: true, path: cacheDir };
    });
    host.webviewProtocol.on("it/clearCorpusCache", async () => {
      const cacheRoot = host.context.globalStorageUri?.fsPath;
      if (!cacheRoot) {
        throw new Error("Cache root not available");
      }
      const cacheDir = path.join(cacheRoot, "corpus_cache");
      try {
        await fs.promises.access(cacheDir);
      } catch {
        it_clearEmbeddingMemoryCache();
        return { cleared: false, path: cacheDir };
      }
      try {
        await fs.promises.rm(cacheDir, {
          recursive: true,
          force: true,
          maxRetries: 2,
          retryDelay: 50,
        });
      } catch (error) {
        throw new Error(
          `Failed to clear corpus cache: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      it_clearEmbeddingMemoryCache();
      host.corpusDirty = true;
      host.updateEmbeddingWarmup({
        status: "running",
        progress: 0,
        total: 0,
        done: 0,
        message: "Rebuilding corpus index",
      });
      host.scheduleEmbeddingWarmup("clear-corpus-cache", 1000);
      return { cleared: true, path: cacheDir };
    });
    host.webviewProtocol.on("it/selectWorkspaceDir", async (msg) => {
      const kind = String(msg.data?.kind || "");
      const keyMap: Record<string, string> = {
        notes: "notes_dir",
        prompts: "prompts_dir",
        rubrics: "rubrics_dir",
        knowledge: "knowledge_dir",
        examples: "examples_dir",
      };
      const targetKey = keyMap[kind];
      if (!targetKey) {
        return { error: "invalid kind" };
      }
      const workspaceRoot = host.requireWorkspaceRoot();
      const current =
        host.configBundle.skill.workspace?.[targetKey] ||
        host.buildConfigSnapshot(host.configBundle.api).workspaceDirs[
          `${kind}Dir` as keyof ItConfigSnapshot["workspaceDirs"]
        ];
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择检索目录",
        defaultUri: vscode.Uri.file(path.join(workspaceRoot, current)),
      });
      if (!selection || selection.length === 0) {
        return { canceled: true };
      }
      const selected = selection[0].fsPath;
      const relative = path.relative(workspaceRoot, selected);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        void vscode.window.showWarningMessage("请选择当前工作区内的目录。");
        return { canceled: true };
      }
      const normalized = relative ? relative.split(path.sep).join("/") : ".";
      host.configBundle = host.configService.loadBundle();
      host.configBundle.skill = {
        ...host.configBundle.skill,
        workspace: {
          ...host.configBundle.skill.workspace,
          [targetKey]: normalized,
        },
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return { kind, dir: normalized };
    });
    host.webviewProtocol.on("it/selectSessionsDir", async () => {
      const workspaceRoot = host.requireWorkspaceRoot();
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择保存目录",
        defaultUri: vscode.Uri.file(workspaceRoot),
      });
      if (!selection || selection.length === 0) {
        return { canceled: true };
      }
      const selected = selection[0].fsPath;
      const relative = path.relative(workspaceRoot, selected);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        void vscode.window.showWarningMessage("请选择当前工作区内的目录。");
        return { canceled: true };
      }
      const normalized = relative ? relative.split(path.sep).join("/") : "sessions";
      host.configBundle = host.configService.loadBundle();
      host.configBundle.skill = {
        ...host.configBundle.skill,
        sessions_dir: normalized || "sessions",
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return { sessionsDir: normalized || "sessions" };
    });
    host.webviewProtocol.on("it/updateApiSettings", async (msg) => {
      const payload = msg.data || {};
      host.configBundle = host.configService.loadBundle();
      const apiConfig = { ...host.configBundle.api };
      const resolved = host.configService.resolveEnvironment(
        apiConfig,
        payload.environment,
      );
      const environment = resolved.environment;
      const envConfig = resolved.envConfig;
      const storedLlmKey =
        (await host.context.secrets.get(`interviewTrainer.${environment}.llm.apiKey`)) ||
        "";
      const storedAsrKey =
        (await host.context.secrets.get(`interviewTrainer.${environment}.asr.apiKey`)) ||
        "";
      const storedAsrSecret =
        (await host.context.secrets.get(`interviewTrainer.${environment}.asr.secretKey`)) ||
        "";
      const llmForm = payload.llm || {};
      const asrForm = payload.asr || {};
      const llmProfiles = { ...(envConfig.llm_profiles || {}) };
      const asrProfiles = { ...(envConfig.asr_profiles || {}) };
      const providerHint =
        llmForm.provider || envConfig.llm?.provider || apiConfig.active?.llm;
      const isDoubao = providerHint === "volc_doubao";
      const llmDefaultBase = isDoubao
        ? "https://ark.cn-beijing.volces.com"
        : "https://qianfan.baidubce.com/v2";
      const llmDefaultModel = isDoubao
        ? "doubao-seed-1-8-251228"
        : "ernie-4.5-turbo-128k";
      const nextLlm = host.configService.buildLlmConfigFromForm({
        form: llmForm,
        baseLlm: envConfig.llm || {},
        fallbackProvider: apiConfig.active?.llm,
        defaultBase: llmDefaultBase,
        defaultModel: llmDefaultModel,
        storedKey: storedLlmKey,
      });
      const nextAsr = host.configService.buildAsrConfigFromForm({
        form: asrForm,
        baseAsr: envConfig.asr || {},
        fallbackProvider: apiConfig.active?.asr,
        storedKey: storedAsrKey,
        storedSecret: storedAsrSecret,
      });

      llmProfiles[nextLlm.provider] = {
        ...nextLlm,
      };
      asrProfiles[nextAsr.provider] = {
        ...nextAsr,
      };
      const nextEnvConfig = {
        ...envConfig,
        llm: nextLlm,
        llm_provider: nextLlm.provider,
        asr: nextAsr,
        asr_provider: nextAsr.provider,
        llm_profiles: llmProfiles,
        asr_profiles: asrProfiles,
      };

      apiConfig.active = {
        ...apiConfig.active,
        environment,
        llm: nextLlm.provider || apiConfig.active?.llm || "baidu_qianfan",
        asr: nextAsr.provider || apiConfig.active?.asr || "baidu_vop",
      };
      apiConfig.environments = {
        ...apiConfig.environments,
        [environment]: nextEnvConfig,
      };

      await host.context.secrets.store(
        `interviewTrainer.${environment}.llm.apiKey`,
        nextLlm.api_key || "",
      );
      await host.context.secrets.store(
        `interviewTrainer.${environment}.asr.apiKey`,
        nextAsr.api_key || "",
      );
      await host.context.secrets.store(
        `interviewTrainer.${environment}.asr.secretKey`,
        nextAsr.secret_key || "",
      );

      const llmProvider = nextLlm.provider;
      if (llmProvider && llmProvider !== "heuristic") {
        const existing = host.configBundle.providers?.[llmProvider] || { provider: llmProvider };
        host.configService.saveProviderConfig(llmProvider, {
          ...existing,
          provider: llmProvider,
          llm: {
            ...(existing.llm || {}),
            ...nextLlm,
          },
        });
      }
      const asrProvider = nextAsr.provider;
      if (asrProvider && asrProvider !== "mock") {
        const existing = host.configBundle.providers?.[asrProvider] || { provider: asrProvider };
        host.configService.saveProviderConfig(asrProvider, {
          ...existing,
          provider: asrProvider,
          asr: {
            ...(existing.asr || {}),
            ...nextAsr,
          },
        });
      }

      host.configService.saveApiConfig(apiConfig);
      host.configBundle = host.configService.loadBundle();
      host.configBundle.api = apiConfig;
      host.configSnapshot = host.buildConfigSnapshot(apiConfig);
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return host.configSnapshot;
    });
    host.webviewProtocol.on("it/savePrompts", async (msg) => {
      const payload = msg.data || {};
      const evaluationPrompt = String(payload.evaluationPrompt || "");
      const demoPrompt = String(payload.demoPrompt || "");
      const answerModeRaw = String(payload.answerMode || "").trim();
      const answerMode =
        answerModeRaw === "single" || answerModeRaw === "two-step"
          ? answerModeRaw
          : undefined;
      const perQuestionSystemPrompts = Array.isArray(payload.perQuestionSystemPrompts)
        ? payload.perQuestionSystemPrompts.map((item: any) => String(item || "")).slice(0, 3)
        : [];
      const perQuestionDemoPrompts = Array.isArray(payload.perQuestionDemoPrompts)
        ? payload.perQuestionDemoPrompts.map((item: any) => String(item || "")).slice(0, 3)
        : [];
      host.configBundle = host.configService.loadBundle();
      const currentEvaluation = host.configBundle.skill.evaluation || {};
      host.configBundle.skill = {
        ...host.configBundle.skill,
        evaluation: {
          ...currentEvaluation,
          answer_mode: answerMode ?? currentEvaluation.answer_mode ?? "two-step",
        },
        prompts: {
          ...host.configBundle.skill.prompts,
          evaluation_prompt: evaluationPrompt,
          demo_prompt: demoPrompt,
          per_question_system_prompts: perQuestionSystemPrompts,
          per_question_demo_prompts: perQuestionDemoPrompts,
        },
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return {
        evaluationPrompt,
        demoPrompt,
        perQuestionSystemPrompts,
        perQuestionDemoPrompts,
      };
    });
    host.webviewProtocol.on("it/updateStreamingSettings", async (msg) => {
      const payload = msg.data || {};
      const streaming = payload.streaming || {};
      const enabled = streaming.enabled !== false;
      const autoCollapse =
        streaming.autoCollapse ?? streaming.auto_collapse ?? true;
      const previewRaw = Number(streaming.previewChars ?? streaming.preview_chars ?? 200);
      const previewChars = Number.isFinite(previewRaw) ? Math.max(50, previewRaw) : 200;
      host.configBundle = host.configService.loadBundle();
      const current = host.configBundle.skill.streaming || {};
      host.configBundle.skill = {
        ...host.configBundle.skill,
        streaming: {
          ...current,
          enabled,
          auto_collapse: autoCollapse,
          preview_chars: previewChars,
        },
      };
      host.configService.saveSkillConfig(host.configBundle.skill);
      host.configSnapshot = await host.refreshConfigSnapshot();
      host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
      return { streaming: host.configSnapshot.streaming };
    });
    host.webviewProtocol.on("it/testLlm", async (msg) => {
      const payload = msg.data || {};
      const llmForm = payload.llm || {};
      const provider = llmForm.provider || "baidu_qianfan";
      const defaultBase =
        provider === "volc_doubao"
          ? "https://ark.cn-beijing.volces.com"
          : "https://qianfan.baidubce.com/v2";
      const defaultModel =
        provider === "volc_doubao"
          ? "doubao-seed-1-8-251228"
          : "ernie-4.5-turbo-128k";

      const cfg: ItLlmConfig = {
        provider,
        apiKey: llmForm.apiKey || "",
        baseUrl: llmForm.baseUrl || defaultBase,
        model: llmForm.model || defaultModel,
        temperature: Number(llmForm.temperature ?? 0.8),
        topP: Number(llmForm.topP ?? 0.8),
        timeoutSec: Number(llmForm.timeoutSec ?? 30),
        maxRetries: Number(llmForm.maxRetries ?? 0),
        antiRepeat: Boolean(llmForm.antiRepeat ?? false),
        useResponses: Boolean(llmForm.useResponses ?? false),
        webSearch: Boolean(llmForm.webSearch ?? false),
        reasoningEffort: llmForm.reasoningEffort,
        maxOutputTokens: Number(llmForm.maxOutputTokens ?? 0),
        reusePrefix: Boolean(llmForm.reusePrefix ?? false),
        stream: Boolean(llmForm.stream ?? llmForm.stream_enabled ?? true),
      };
      if (!cfg.apiKey) {
        throw new Error("缺少 LLM API Key");
      }
      try {
        const content = await it_callLlmChat(cfg, [
          { role: "system", content: "你是健康检查助手，请用12个字内回复“接口可用”" },
          { role: "user", content: "ping" },
        ]);
        return { ok: true, content };
      } catch (error) {
        host.logLlmTestFailure(error, {
          config: { ...cfg, apiKey: cfg.apiKey ? "***" : "" },
        });
        throw error;
      }
    });
    host.webviewProtocol.on("it/testAsr", async (msg) => {
      const asrForm = msg.data?.asr || {};
      const provider = asrForm.provider || "baidu_vop";
      const normalizedProvider = String(provider || "").toLowerCase();
      const isVolc =
        normalizedProvider === "volc_asr" ||
        normalizedProvider === "volcengine_asr" ||
        normalizedProvider === "volc_doubao";
      const buildRawOutput = (
        error: unknown,
        meta: Record<string, any>,
      ): Record<string, any> => {
        const err = error as any;
        const debug = err?.itDebug || err?.debug || {};
        const response = debug?.response || err?.response?.data || undefined;
        const status = debug?.status || err?.response?.status || undefined;
        const message = err instanceof Error ? err.message : String(err);
        return {
          error: message,
          status,
          response,
          meta,
        };
      };

      try {
        if (provider === "mock") {
          return { ok: true, content: asrForm.mockText || "mock 文本" };
        }
        if (isVolc) {
          if (!asrForm.apiKey || !asrForm.secretKey) {
            throw new Error("缺少火山引擎 ASR 的 App Key 或 Access Key。");
          }
          const modeRaw = String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase();
          const mode = modeRaw === "standard" ? "standard" : "flash";
          const baseUrl = asrForm.baseUrl || "https://openspeech.bytedance.com";
          const resourceId =
            asrForm.resource_id ||
            asrForm.resourceId ||
            (mode === "standard" ? "volc.bigasr.auc" : "volc.bigasr.auc_turbo");
          const modelName = asrForm.model_name || asrForm.modelName || "bigmodel";
          const enablePunc =
            asrForm.enable_punc ?? asrForm.enablePunc ?? true;
          const userId = asrForm.user_id || asrForm.userId || "it-asr-test";
          const audioUrl = asrForm.audio_url || asrForm.audioUrl || "";

          const sampleRate = 16000;
          const durationSec = 1;
          const pcm = new Int16Array(sampleRate * durationSec);
          const wavBuffer = it_pcm16ToWavBuffer(pcm, sampleRate, 1);
          const audioPayload = audioUrl
            ? { url: audioUrl, format: asrForm.audio_format || asrForm.audioFormat }
            : {
                data: wavBuffer.toString("base64"),
                format: "wav",
                rate: sampleRate,
                bits: 16,
                channel: 1,
              };
          if (mode === "standard" && !audioUrl) {
            throw new Error(
              "火山引擎 ASR 标准版需要 audio_url（可访问的音频地址）。请在 provider 配置中设置 audio_url 或切换到 flash 模式。",
            );
          }
          const text = await it_callVolcAsr(
            {
              appKey: asrForm.apiKey,
              accessKey: asrForm.secretKey,
              baseUrl,
              resourceId,
              modelName,
              enablePunc: Boolean(enablePunc),
              userId,
              mode,
              timeoutSec: Number(asrForm.timeoutSec ?? 30),
              maxRetries: Number(asrForm.maxRetries ?? 0),
              pollIntervalSec: Number(asrForm.poll_interval_sec ?? 1),
              maxPollSec: Number(asrForm.max_poll_sec ?? 60),
            },
            audioPayload,
          );
          return { ok: true, content: text || "(无识别结果，接口可用)" };
        }
        if (provider !== "baidu_vop") {
          throw new Error("当前仅支持百度 ASR 测试。");
        }
        if (!asrForm.apiKey || !asrForm.secretKey) {
          throw new Error("缺少 ASR API Key 或 Secret Key。");
        }
        const sampleRate = 16000;
        const durationSec = 1;
        const buffer = Buffer.alloc(sampleRate * durationSec * 2, 0);
        const base64 = buffer.toString("base64");
        const text = await it_callBaiduAsr(
          {
            apiKey: asrForm.apiKey,
            secretKey: asrForm.secretKey,
            baseUrl: asrForm.baseUrl || "https://vop.baidu.com/server_api",
            devPid: Number(asrForm.devPid ?? 1537),
            language: asrForm.language || "zh",
            timeoutSec: Number(asrForm.timeoutSec ?? 30),
            maxRetries: Number(asrForm.maxRetries ?? 0),
          },
          {
            format: "pcm",
            rate: sampleRate,
            channel: 1,
            cuid: "it-asr-test",
            speech: base64,
            len: buffer.length,
          },
        );
        return { ok: true, content: text || "(无识别结果，接口可用)" };
      } catch (error) {
        const meta = isVolc
          ? {
              provider,
              baseUrl: asrForm.baseUrl || "https://openspeech.bytedance.com",
              mode: String(asrForm.mode || asrForm.volc_mode || "flash"),
              resourceId:
                asrForm.resource_id ||
                asrForm.resourceId ||
                (String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase() === "standard"
                  ? "volc.bigasr.auc"
                  : "volc.bigasr.auc_turbo"),
              modelName: asrForm.model_name || asrForm.modelName || "bigmodel",
              audioUrl: asrForm.audio_url || asrForm.audioUrl || "",
            }
          : {
              provider,
              baseUrl: asrForm.baseUrl || "https://vop.baidu.com/server_api",
              language: asrForm.language || "zh",
              devPid: Number(asrForm.devPid ?? 1537),
            };
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          raw: buildRawOutput(error, meta),
        };
      }
    });
    host.webviewProtocol.on("it/testEmbedding", async (msg) => {
      const embedForm = msg.data?.embedding || {};
      const provider = embedForm.provider || "volc_doubao";
      const cfg = {
        provider,
        apiKey: embedForm.apiKey || "",
        baseUrl: embedForm.baseUrl || "",
        model: embedForm.model || "",
        timeoutSec: Number(embedForm.timeoutSec ?? 30),
        maxRetries: Number(embedForm.maxRetries ?? 0),
      };
      if (!cfg.apiKey) {
        throw new Error("缺少 Embedding API Key");
      }
      if (!cfg.baseUrl || !cfg.model) {
        throw new Error("请填写 Embedding Base URL 与模型");
      }
      try {
        const vectors = await it_callEmbedding(cfg, ["embedding test"]);
        const length = vectors?.[0]?.length || 0;
        return { ok: true, length };
      } catch (error) {
        host.logEmbeddingTestFailure(error);
        throw error;
      }
    });
    host.webviewProtocol.on("openFile", async (msg) => {
      const target = msg.data?.path;
      if (!target) {
        return;
      }
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
    });
    host.webviewProtocol.on("it/convertAudioToPcm", async (msg) => {
      const base64 = String(msg.data?.base64 || "");
      const ext = String(msg.data?.ext || "m4a").replace(/[^a-z0-9]/gi, "");
      if (!base64) {
        throw new Error("missing audio bytes");
      }

      const ffmpeg = await host.it_findFfmpeg();
      if (!ffmpeg) {
        throw new Error(
          "未检测到 ffmpeg：请安装 ffmpeg 或将音频先转为 WAV(16kHz 单声道) 后再导入。",
        );
      }

      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "it-audio-"));
      const inPath = path.join(tmpDir, `input.${ext || "m4a"}`);
      const outPath = path.join(tmpDir, "output.pcm");
      await fs.promises.writeFile(inPath, Buffer.from(base64, "base64"));

      await new Promise<void>((resolve, reject) => {
        const args = [
          "-y",
          "-i",
          inPath,
          "-ac",
          "1",
          "-ar",
          "16000",
          "-f",
          "s16le",
          outPath,
        ];
        const child = spawn(ffmpeg, args, { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (d: Buffer | string) => {
          stderr += String(d);
        });
        child.on("error", (err: Error) => reject(err));
        child.on("close", (code: number | null) => {
          if (code !== 0) {
            reject(new Error(`ffmpeg 转换失败: ${stderr || `code=${code}`}`));
            return;
          }
          fs.promises
            .access(outPath)
            .then(() => resolve())
            .catch(() => reject(new Error("ffmpeg 转换失败：未生成输出文件")));
        });
      });

      const pcm = await fs.promises.readFile(outPath);
      const byteLength = pcm.byteLength;
      const durationSec = byteLength / (2 * 16000);

      // cleanup best-effort
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch {}

      return {
        base64: pcm.toString("base64"),
        byteLength,
        durationSec,
      };
    });
    host.webviewProtocol.on("it/analyzeAudio", async (msg) => {
      return await host.handleAnalyze(msg.data);
    });
    host.webviewProtocol.on("it/saveCurrentResult", async (msg) => {
      const payload = msg.data || {};
      const response = payload.response as ItAnalyzeResponse | undefined;
      if (!response || !response.reportPath || !response.topicDir) {
        throw new Error("缺少可保存的结果");
      }
      const questionText = String(
        payload.questionText ?? response.questionText ?? "",
      );
      const questionList = Array.isArray(payload.questionList)
        ? payload.questionList.map((item: any) => String(item)).filter(Boolean)
        : Array.isArray(response.questionList)
          ? response.questionList.map((item: any) => String(item)).filter(Boolean)
          : [];
      const topicTitle = String(
        payload.topicTitle || response.evaluation?.topicTitle || "未命名",
      );
      const attemptIndex = await it_nextAttemptIndexAsync(response.reportPath);
      await it_appendReportAsync(
        response.reportPath,
        topicTitle,
        questionText || undefined,
        questionList.length ? questionList : undefined,
        attemptIndex,
        response,
        {
          attemptHeading: "第{n}次作答",
          segmentHeading: "小题{n}",
          attemptNote: "评分仅供参考，请结合标准文件自评。",
        },
      );
      await it_updateReferenceNotesFileAsync(response.topicDir, response.evaluation);
      const attemptData = {
        attemptIndex,
        timestamp: new Date().toISOString(),
        audioPath: response.audioPath,
        durationSec: response.acoustic.durationSec,
        transcript: response.transcript,
        detailedTranscript: response.detailedTranscript,
        evaluation: response.evaluation,
        notes: response.notes,
        audioSegments: response.audioSegments,
        questionTimings: response.questionTimings,
      };
      await it_appendAttemptDataAsync(response.topicDir, attemptData);

      const meta = await it_readTopicMetaAsync(response.topicDir);
      const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
      const normalized = fingerprint || it_normalizeText(questionText || topicTitle);
      const now = new Date().toISOString();
      await it_writeTopicMetaAsync(response.topicDir, {
        topicTitle: meta.topicTitle || topicTitle,
        questionText: questionText || meta.questionText || "",
        questionList: questionList.length ? questionList : meta.questionList || [],
        questionHash: meta.questionHash || it_hashText(normalized),
        createdAt: meta.createdAt || now,
        updatedAt: now,
        overallScore: response.evaluation.overallScore,
      });
      return { ok: true, attemptIndex, reportPath: response.reportPath };
    });
    host.webviewProtocol.on("it/cancelAnalyze", () => {
      if (host.analysisAbort) {
        host.analysisAbort.aborted = true;
      }
      host.updateState({
        statusMessage: "已请求停止分析",
        lastError: undefined,
        steps: host.state.steps.map((step) =>
          step.status === "running"
            ? { ...step, status: "error", progress: step.progress }
            : step,
        ),
      });
      return { cancelled: true };
    });
  
}
