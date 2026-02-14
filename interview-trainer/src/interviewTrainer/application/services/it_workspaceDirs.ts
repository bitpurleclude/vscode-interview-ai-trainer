import path from "path";

export type ItWorkspaceDirKind =
  | "notes"
  | "prompts"
  | "rubrics"
  | "knowledge"
  | "examples";

type ItWorkspaceDirSpec = {
  key: ItWorkspaceDirKind;
  configKey: string;
  fallback: string;
};

const IT_WORKSPACE_DIR_SPECS: ItWorkspaceDirSpec[] = [
  { key: "notes", configKey: "notes_dir", fallback: "inputs/notes" },
  {
    key: "prompts",
    configKey: "prompts_dir",
    fallback: "inputs/prompts/guangdong",
  },
  { key: "rubrics", configKey: "rubrics_dir", fallback: "inputs/rubrics" },
  { key: "knowledge", configKey: "knowledge_dir", fallback: "inputs/knowledge" },
  { key: "examples", configKey: "examples_dir", fallback: "inputs/examples" },
];

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function it_getWorkspaceDirSpecs(): ItWorkspaceDirSpec[] {
  return IT_WORKSPACE_DIR_SPECS.slice();
}

export function it_getWorkspaceDirConfigValue(
  skillConfig: Record<string, unknown>,
  configKey: string,
  fallback: string,
): string {
  const workspace = it_asRecord(skillConfig.workspace);
  const value = String(workspace[configKey] ?? skillConfig[configKey] ?? "").trim();
  return value || fallback;
}

export function it_getWorkspaceDirConfigMap(
  skillConfig: Record<string, unknown>,
): Record<ItWorkspaceDirKind, string> {
  const map = {} as Record<ItWorkspaceDirKind, string>;
  IT_WORKSPACE_DIR_SPECS.forEach((spec) => {
    map[spec.key] = it_getWorkspaceDirConfigValue(
      skillConfig,
      spec.configKey,
      spec.fallback,
    );
  });
  return map;
}

export function it_resolveWorkspaceDirPath(
  workspaceRoot: string,
  configuredPath: string,
): string {
  const raw = String(configuredPath || "").trim();
  if (!raw) {
    return path.resolve(workspaceRoot);
  }
  return path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(workspaceRoot, raw);
}

export function it_resolveWorkspaceDirPaths(
  workspaceRoot: string,
  skillConfig: Record<string, unknown>,
): Record<ItWorkspaceDirKind, string> {
  const configured = it_getWorkspaceDirConfigMap(skillConfig);
  return {
    notes: it_resolveWorkspaceDirPath(workspaceRoot, configured.notes),
    prompts: it_resolveWorkspaceDirPath(workspaceRoot, configured.prompts),
    rubrics: it_resolveWorkspaceDirPath(workspaceRoot, configured.rubrics),
    knowledge: it_resolveWorkspaceDirPath(workspaceRoot, configured.knowledge),
    examples: it_resolveWorkspaceDirPath(workspaceRoot, configured.examples),
  };
}
