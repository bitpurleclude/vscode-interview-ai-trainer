import path from "path";
import * as vscode from "vscode";
import {
  ItApiConfig,
  ItConfigBundle,
  it_applySecretOverrides,
} from "../api/it_apiConfig";
import { ItConfigService } from "../api/it_configService";
import {
  ItApiTemplate,
  ItConfigSnapshot,
  ItTemplateParamCatalog,
  ItTemplateParamUsage,
  ItTokenStoreSnapshot,
  ItTemplatesSnapshot,
} from "../../protocol/interviewTrainer";
import { it_hashText } from "../utils/it_text";

const IT_TEMPLATE_VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function it_buildTemplateParamCatalog(): ItTemplateParamCatalog {
  return {
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
    token: [],
  };
}

function it_collectTemplateVars(template: ItApiTemplate): string[] {
  const raw = JSON.stringify({
    request: template.request,
    response: template.response,
    streaming: template.streaming,
  });
  const matches = raw.matchAll(IT_TEMPLATE_VAR_PATTERN);
  const vars = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  return Array.from(vars);
}

function it_buildTemplateParamUsage(
  templates: ItApiTemplate[],
  catalog: ItTemplateParamCatalog,
): Record<string, ItTemplateParamUsage> {
  const usage: Record<string, ItTemplateParamUsage> = {};
  templates.forEach((template) => {
    const used = new Set(it_collectTemplateVars(template));
    const knownVars = new Set([
      ...catalog.common,
      ...(template.category === "llm"
        ? catalog.llm
        : template.category === "asr"
          ? catalog.asr
          : template.category === "embedding"
            ? catalog.embedding
            : template.category === "token"
              ? catalog.token
              : []),
    ]);
    const unknown: string[] = [];
    used.forEach((item) => {
      if (item.startsWith("secrets.") || item.startsWith("tokens.")) {
        return;
      }
      if (!knownVars.has(item)) {
        unknown.push(item);
      }
    });
    const unused: string[] = [];
    knownVars.forEach((item) => {
      if (!used.has(item)) {
        unused.push(item);
      }
    });
    usage[template.id] = {
      used: Array.from(used),
      unused,
      unknown,
      empty: [],
    };
  });
  return usage;
}

export type ItConfigSnapshotHost = {
  context: vscode.ExtensionContext;
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  configService: ItConfigService;
  corpusWatchers: vscode.FileSystemWatcher[];
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  tokenService?: { getSnapshot: (env: string) => ItTokenStoreSnapshot; sync: () => void };
};

export function it_normalizeWorkspaceKey(root: string): string {
  const resolved = path.resolve(String(root || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function it_buildConfigSnapshot(
  host: ItConfigSnapshotHost,
  apiConfig: ItApiConfig,
): ItConfigSnapshot {
  const env = apiConfig.active?.environment || "prod";
  const envConfig = apiConfig.environments?.[env] ?? {};
  const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
  const templateEnv = templatesConfig.environments?.[env] || {};
  const templateMap = templateEnv.templates || {};
  const templates = Object.keys(templateMap)
    .map((id) => ({
      ...templateMap[id],
      id: templateMap[id]?.id || id,
    }))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  const templateBindings = templateEnv.bindings || { llm: {}, asr: {}, embedding: {} };
  const templateSecrets = Array.isArray(templateEnv.secrets)
    ? templateEnv.secrets.map((item: any) => String(item || "").trim()).filter(Boolean)
    : [];
  const paramOptions = {
    reasoningEffort: Array.isArray(templateEnv.param_options?.reasoning_effort)
      ? templateEnv.param_options.reasoning_effort
      : ["low", "medium", "high", "xhigh"],
  };
  const paramCatalog = it_buildTemplateParamCatalog();
  const paramUsage = it_buildTemplateParamUsage(templates, paramCatalog);
  const tokenStore = host.tokenService?.getSnapshot(env);
  const templatesSnapshot: ItTemplatesSnapshot = {
    templates,
    bindings: templateBindings,
    paramCatalog,
    paramUsage,
    paramOptions,
    secretNames: templateSecrets,
    tokenStore,
  };
  const llmConfig = envConfig.llm ?? {};
  const asrConfig = envConfig.asr ?? {};
  const evaluationCfg = host.configBundle.skill.evaluation ?? {};
  const topicCfg = host.configBundle.skill.topics ?? {};
  const streamingCfg = host.configBundle.skill.streaming ?? {};
  const llmProfiles = envConfig.llm_profiles || {};
  const asrProfiles = envConfig.asr_profiles || {};
  const resolvedLlmProvider =
    llmConfig.provider || apiConfig.active?.llm || "baidu_qianfan";
  const isDoubao = resolvedLlmProvider === "volc_doubao";
  const llmDefaultBase = isDoubao
    ? "https://ark.cn-beijing.volces.com"
    : "https://qianfan.baidubce.com/v2";
  const workspace = host.configBundle.skill.workspace ?? {};
  const retrieval = host.configBundle.skill.retrieval ?? {};
  const llmTasks = host.configBundle.skill.llm_tasks ?? {};
  const vector = retrieval.vector ?? {};
  const cacheRoot = host.context.globalStorageUri?.fsPath || "";
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const workspaceKey = workspaceRoot
    ? it_normalizeWorkspaceKey(workspaceRoot)
    : "";
  const corpusCacheDir = cacheRoot ? path.join(cacheRoot, "corpus_cache") : "";
  const embeddingCacheDir = cacheRoot
    ? path.join(
        cacheRoot,
        "embedding_cache",
        workspaceKey ? it_hashText(workspaceKey) : "workspace",
      )
    : "";
  const corpusCacheMb = Number(
    retrieval.corpus_cache_mb ?? retrieval.corpus_cache_max_mb ?? 25,
  );
  const queryCacheSize = Number(retrieval.query_cache_size ?? 200);
  const maxConcurrency = Number(retrieval.max_concurrency ?? 3);
  const embeddingMaxConcurrency = Number(
    retrieval.embedding_max_concurrency ?? retrieval.embeddingMaxConcurrency ?? 1,
  );
  const vectorDefaults = {
    provider: "volc_doubao",
    base_url: "https://ark.cn-beijing.volces.com",
    model: "doubao-embedding",
    timeout_sec: 30,
    max_retries: 1,
    batch_size: 16,
    query_max_chars: 1500,
  };
  const streamingEnabled = streamingCfg.enabled !== false;
  const streamingAutoCollapse =
    streamingCfg.auto_collapse ?? streamingCfg.autoCollapse ?? true;
  const streamingPreviewChars = Number(
    streamingCfg.preview_chars ?? streamingCfg.previewChars ?? 200,
  );
  return {
    activeEnvironment: env,
    envList: Object.keys(apiConfig.environments || {}),
    llmProvider: resolvedLlmProvider,
    asrProvider: apiConfig.active?.asr || asrConfig.provider || "baidu_vop",
    acousticProvider: apiConfig.active?.acoustic || "api",
    llmProfiles,
    asrProfiles,
    providerProfiles: host.configBundle.providers || {},
    prompts: {
      evaluationPrompt:
        (host.configBundle.skill.prompts?.evaluation_prompt as string) || "",
      demoPrompt: (host.configBundle.skill.prompts?.demo_prompt as string) || "",
      perQuestionSystemPrompts:
        (host.configBundle.skill.prompts?.per_question_system_prompts as string[]) || [],
      perQuestionDemoPrompts:
        (host.configBundle.skill.prompts?.per_question_demo_prompts as string[]) || [],
    },
    llmTasks: {
      questionParse:
        llmTasks.question_parse || llmTasks.questionParse || "",
      segment: llmTasks.segment || llmTasks.segment_align || llmTasks.segmentAlign || "",
      evaluation: llmTasks.evaluation || llmTasks.evaluate || "",
    },
    evaluation: {
      answerMode:
        evaluationCfg.answer_mode || evaluationCfg.answerMode || "two-step",
    },
    topics: {
      titleMode: topicCfg.title_mode || topicCfg.titleMode || "llm",
      maxTitleLen: Number(topicCfg.max_title_len ?? 18),
    },
    llm: {
      provider: resolvedLlmProvider,
      baseUrl: llmConfig.base_url || llmDefaultBase,
      model:
        llmConfig.model ||
        (isDoubao ? "doubao-seed-1-8-251228" : "ernie-4.5-turbo-128k"),
      apiKey: llmConfig.api_key || "",
      temperature: Number(llmConfig.temperature ?? 0.8),
      topP: Number(llmConfig.top_p ?? 0.8),
      timeoutSec: Number(llmConfig.timeout_sec ?? 60),
      maxRetries: Number(llmConfig.max_retries ?? 1),
      antiRepeat: Boolean(llmConfig.anti_repeat ?? llmConfig.antiRepeat ?? false),
      useResponses: Boolean(
        llmConfig.use_responses ??
          llmConfig.useResponses ??
          (isDoubao ? true : false),
      ),
      apiMode: llmConfig.api_mode ?? llmConfig.apiMode,
      responsesPath: llmConfig.responses_path ?? llmConfig.responsesPath ?? "",
      toolsPreset: llmConfig.tools_preset ?? llmConfig.toolsPreset ?? "",
      webSearch: Boolean(
        llmConfig.web_search ?? llmConfig.webSearch ?? (isDoubao ? true : false),
      ),
      reasoningEffort:
        llmConfig.reasoning_effort ??
        llmConfig.reasoningEffort ??
        (isDoubao ? "medium" : undefined),
      maxOutputTokens: Number(
        llmConfig.max_output_tokens ?? llmConfig.maxOutputTokens ?? 800,
      ),
      reusePrefix: Boolean(
        llmConfig.reuse_prefix ?? llmConfig.reusePrefix ?? (isDoubao ? true : false),
      ),
      stream: Boolean(llmConfig.stream ?? llmConfig.stream_enabled ?? true),
    },
    templates: templatesSnapshot,
    streaming: {
      enabled: streamingEnabled,
      autoCollapse: Boolean(streamingAutoCollapse),
      previewChars: Number.isFinite(streamingPreviewChars)
        ? streamingPreviewChars
        : 200,
    },
    asr: {
      provider: asrConfig.provider || apiConfig.active?.asr || "baidu_vop",
      baseUrl: asrConfig.base_url || "https://vop.baidu.com/server_api",
      apiKey: asrConfig.api_key || "",
      secretKey: asrConfig.secret_key || "",
      language: asrConfig.language || "zh",
      devPid: Number(asrConfig.dev_pid ?? 1537),
      mockText: asrConfig.mock_text || "",
      maxChunkSec: Number(asrConfig.max_chunk_sec ?? 50),
      maxConcurrency: Number(asrConfig.max_concurrency ?? asrConfig.maxConcurrency ?? 1),
      timeoutSec: Number(asrConfig.timeout_sec ?? 120),
      maxRetries: Number(asrConfig.max_retries ?? 1),
    },
    sessionsDir: host.configBundle.skill.sessions_dir || "sessions",
    retrievalEnabled: retrieval.enabled !== false,
    retrieval: {
      mode: retrieval.mode || "vector",
      topK: Number(retrieval.top_k ?? 5),
      topKNotes: Number(retrieval.top_k_notes ?? retrieval.top_k ?? 5),
      topKKnowledge: Number(retrieval.top_k_knowledge ?? retrieval.top_k ?? 5),
      topKRubrics: Number(retrieval.top_k_rubrics ?? retrieval.top_k ?? 5),
      topKExamples: Number(retrieval.top_k_examples ?? retrieval.top_k ?? 5),
      maxConcurrency,
      embeddingMaxConcurrency,
      minScore: Number(retrieval.min_score ?? 0.2),
      embeddingProvider:
        retrieval.embedding_provider || vector.provider || vectorDefaults.provider,
      vector: {
        provider: vector.provider || vectorDefaults.provider,
        baseUrl: vector.base_url || vectorDefaults.base_url,
        apiKey: vector.api_key || "",
        model: vector.model || vectorDefaults.model,
        timeoutSec: Number(vector.timeout_sec ?? vectorDefaults.timeout_sec),
        maxRetries: Number(vector.max_retries ?? vectorDefaults.max_retries),
        batchSize: Number(vector.batch_size ?? vectorDefaults.batch_size),
        queryMaxChars: Number(vector.query_max_chars ?? vectorDefaults.query_max_chars),
      },
    },
    retrievalCache: {
      cacheRoot,
      corpusCacheDir,
      embeddingCacheDir,
      corpusCacheMb,
      queryCacheSize,
      maxConcurrency,
    },
    workspaceDirs: {
      notesDir: workspace.notes_dir || "inputs/notes",
      promptsDir: workspace.prompts_dir || "inputs/prompts/guangdong",
      rubricsDir: workspace.rubrics_dir || "inputs/rubrics",
      knowledgeDir: workspace.knowledge_dir || "inputs/knowledge",
      examplesDir: workspace.examples_dir || "inputs/examples",
    },
  };
}

export function it_updateCorpusWatchers(host: ItConfigSnapshotHost): void {
  host.corpusWatchers.forEach((watcher) => watcher.dispose());
  host.corpusWatchers = [];
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }
  const dirs = it_buildConfigSnapshot(host, host.configBundle.api).workspaceDirs;
  const targets = Array.from(
    new Set([
      dirs.notesDir,
      dirs.promptsDir,
      dirs.rubricsDir,
      dirs.knowledgeDir,
      dirs.examplesDir,
    ].filter((value) => Boolean(value))),
  );
  const markDirty = (uri?: vscode.Uri) => {
    host.corpusDirty = true;
    if (uri?.fsPath) {
      host.corpusDirtyFiles.add(path.resolve(uri.fsPath));
    }
  };
  targets.forEach((dir) => {
    const normalized = String(dir || "").replace(/\\/g, "/");
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      path.join(normalized, "**/*"),
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate((uri) => markDirty(uri));
    watcher.onDidChange((uri) => markDirty(uri));
    watcher.onDidDelete((uri) => markDirty(uri));
    host.context.subscriptions.push(watcher);
    host.corpusWatchers.push(watcher);
  });
  host.corpusDirty = true;
  host.corpusDirtyFiles.clear();
}

export async function it_applyEmbeddingSecretOverrides(
  host: ItConfigSnapshotHost,
): Promise<void> {
  const env = host.configBundle.api.active?.environment || "prod";
  const secret =
    (await host.context.secrets.get(`interviewTrainer.${env}.embedding.apiKey`)) ||
    "";
  if (!secret) {
    return;
  }
  const current = host.configBundle.skill.retrieval || {};
  const currentVector = current.vector || {};
  host.configBundle = {
    ...host.configBundle,
    skill: {
      ...host.configBundle.skill,
      retrieval: {
        ...current,
        vector: {
          ...currentVector,
          api_key: secret,
        },
      },
    },
  };
}

export async function it_refreshConfigSnapshot(
  host: ItConfigSnapshotHost,
): Promise<ItConfigSnapshot> {
  host.configBundle = host.configService.loadBundle();
  host.configBundle = await host.configService.ensureTemplatesConfig(host.configBundle);
  host.tokenService?.sync();
  host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);
  host.configBundle.api = await it_applySecretOverrides(
    host.context,
    host.configBundle.api,
  );
  await it_applyEmbeddingSecretOverrides(host);
  host.configSnapshot = it_buildConfigSnapshot(host, host.configBundle.api);
  it_updateCorpusWatchers(host);
  return host.configSnapshot;
}
