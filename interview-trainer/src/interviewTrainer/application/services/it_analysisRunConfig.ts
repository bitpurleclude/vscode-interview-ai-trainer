import type {
  ItAnalyzeProgress,
  ItAnalyzeDeps,
} from "../flows/analyze/flow_types";
import type { ItAnalysisRunConfigPort } from "./it_analysisHostPorts";

export type ItAnalysisRunConfigHost = ItAnalysisRunConfigPort;

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
