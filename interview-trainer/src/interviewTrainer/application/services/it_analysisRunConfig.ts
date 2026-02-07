import type {
  ItAnalyzeProgress,
  ItAnalyzeDeps,
} from "../flows/analyze/flow_types";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "./it_configGateway";
import type {
  ItState,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";

export type ItAnalysisRunConfigHost = {
  context: import("vscode").ExtensionContext;
  configService: ItConfigService;
  configBundle: ItConfigBundle;
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
  analysisAbort: { aborted: boolean } | null;
  updateProgress: (update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }) => void;
  emitStreamUpdate: (update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  emitEvaluationStreamUpdate: (update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  requireWorkspaceRoot: () => string;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
};

export async function it_prepareAnalysisRunDeps(
  host: ItAnalysisRunConfigHost,
  onPartial: NonNullable<ItAnalyzeDeps["onPartial"]>,
): Promise<ItAnalyzeDeps> {
  host.configBundle = host.configService.loadBundle();
  host.configBundle = await host.configService.ensureTemplatesConfig(host.configBundle);
  host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);

  const workspaceRoot = host.requireWorkspaceRoot();
  const activeEnv = host.configBundle.api.active?.environment || "prod";
  const envConfig = host.configBundle.api.environments?.[activeEnv] || {};
  const envAsr = envConfig.asr || {};

  return {
    context: host.context,
    apiConfig: host.configBundle.api,
    templatesConfig: host.configBundle.templates,
    skillConfig: {
      ...host.configBundle.skill,
      asr: {
        ...envAsr,
        ...(host.configBundle.skill.asr || {}),
      },
      providers: host.configBundle.providers,
    },
    workspaceRoot,
    onProgress: (update: ItAnalyzeProgress) => host.updateProgress(update),
    onPartial,
    corpusDirty: host.corpusDirty,
    corpusDirtyFiles: Array.from(host.corpusDirtyFiles),
    onCorpusTrace: (message, detail) => host.logCorpusTrace(message, detail),
    onStream: (update) => host.emitStreamUpdate(update),
    onEvalStream: (update) => host.emitEvaluationStreamUpdate(update),
    abortSignal: host.analysisAbort ?? undefined,
  };
}
