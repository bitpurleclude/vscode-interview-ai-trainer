import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  it_selectSessionsDirFromWebview,
  it_selectWorkspaceDirFromWebview,
} from "./it_workspaceActions";

function createContext(workspaceRoot: string, selectedPath: string | null) {
  const configBundle: any = {
    skill: {
      workspace: {
        notes_dir: "inputs/notes",
      },
      notes_dir: "legacy-notes",
      sessions_dir: "sessions",
    },
  };

  const context: any = {
    configService: {
      loadBundle: () => configBundle,
      saveSkillConfig: vi.fn((skill: unknown) => {
        configBundle.skill = skill as any;
      }),
    },
    refreshConfigSnapshot: vi.fn(async () => ({ updated: true } as any)),
    requireWorkspaceRoot: () => workspaceRoot,
    selectDirectory: vi.fn(async () => selectedPath),
    showWarning: vi.fn(),
    logCorpusTrace: vi.fn(),
  };

  return { context, configBundle };
}

describe("it_workspaceActions security", () => {
  it("accepts directories outside workspace root and stores absolute path", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "workspace-root");
    const selectedPath = path.resolve(workspaceRoot, "..", "outside");
    const { context, configBundle } = createContext(workspaceRoot, selectedPath);

    const result = await it_selectWorkspaceDirFromWebview({
      context,
      payload: { kind: "notes" },
    });

    const expected = path.resolve(selectedPath).split(path.sep).join("/");
    expect(result.value).toEqual({ kind: "notes", path: expected });
    expect(context.showWarning).toHaveBeenCalledTimes(1);
    expect(context.configService.saveSkillConfig).toHaveBeenCalledTimes(1);
    expect(configBundle.skill.workspace.notes_dir).toBe(expected);
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "workspace select_dir success",
      expect.objectContaining({
        event: "application.workspace.select_dir",
        status: "success",
        outsideWorkspace: true,
      }),
    );
  });

  it("stores normalized in-workspace path and removes legacy top-level key", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "workspace-root");
    const selectedPath = path.join(workspaceRoot, "inputs", "notes", "sec");
    const { context, configBundle } = createContext(workspaceRoot, selectedPath);

    const result = await it_selectWorkspaceDirFromWebview({
      context,
      payload: { kind: "notes" },
    });

    expect(result.value).toEqual({ kind: "notes", path: "inputs/notes/sec" });
    expect(configBundle.skill.workspace.notes_dir).toBe("inputs/notes/sec");
    expect(Object.prototype.hasOwnProperty.call(configBundle.skill, "notes_dir")).toBe(false);
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "workspace select_dir success",
      expect.objectContaining({
        event: "application.workspace.select_dir",
        status: "success",
        normalizedPath: "inputs/notes/sec",
      }),
    );
  });

  it("rejects sessions directory outside workspace root", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "workspace-root");
    const selectedPath = path.resolve(workspaceRoot, "..", "external-sessions");
    const { context, configBundle } = createContext(workspaceRoot, selectedPath);

    const result = await it_selectSessionsDirFromWebview({ context });

    expect(result.value).toEqual({ canceled: true });
    expect(context.showWarning).toHaveBeenCalledTimes(1);
    expect(context.configService.saveSkillConfig).not.toHaveBeenCalled();
    expect(configBundle.skill.sessions_dir).toBe("sessions");
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "workspace select_sessions_dir rejected",
      expect.objectContaining({
        event: "application.workspace.select_sessions_dir",
        status: "rejected",
        reason: "outside_workspace",
      }),
    );
  });

  it("accepts workspace root as sessions directory", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "workspace-root");
    const { context, configBundle } = createContext(workspaceRoot, workspaceRoot);

    const result = await it_selectSessionsDirFromWebview({ context });

    expect(result.value).toEqual({ sessionsDir: "." });
    expect(configBundle.skill.sessions_dir).toBe(".");
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "workspace select_sessions_dir success",
      expect.objectContaining({
        event: "application.workspace.select_sessions_dir",
        status: "success",
        normalizedPath: ".",
      }),
    );
  });

  it("normalizes sessions nested path with forward slashes", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "workspace-root");
    const selectedPath = path.join(workspaceRoot, "sessions", "20260207");
    const { context, configBundle } = createContext(workspaceRoot, selectedPath);

    const result = await it_selectSessionsDirFromWebview({ context });

    expect(result.value).toEqual({ sessionsDir: "sessions/20260207" });
    expect(configBundle.skill.sessions_dir).toBe("sessions/20260207");
  });
});
