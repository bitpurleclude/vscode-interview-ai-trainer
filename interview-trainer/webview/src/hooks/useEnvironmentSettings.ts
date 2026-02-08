import { useCallback, useState } from "react";
import { reportClientTrace, request } from "../messenger";
import type { ItConfigSnapshot } from "../types";
import type { StreamingSettings } from "../components/settings/settingsTypes";


function traceEnvironmentAction(
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  const level = status === "error" ? "error" : status === "canceled" ? "debug" : "info";
  reportClientTrace({
    level,
    event: "webview.environment." + action,
    status,
    message: "environment action " + action + " " + status,
    detail,
  });
}

type UseEnvironmentSettingsOptions = {
  config: ItConfigSnapshot | null;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
  streamingSettings: StreamingSettings;
  setStreamingSettings: React.Dispatch<React.SetStateAction<StreamingSettings>>;
  customPrompt: string;
  demoPrompt: string;
  perQuestionSystemPrompts: string[];
  perQuestionDemoPrompts: string[];
  answerMode: "single" | "two-step";
  topicTitleMode: "llm" | "simple";
  topicTitleLen: number;
};

export function useEnvironmentSettings({
  config,
  setConfig,
  streamingSettings,
  setStreamingSettings,
  customPrompt,
  demoPrompt,
  perQuestionSystemPrompts,
  perQuestionDemoPrompts,
  answerMode,
  topicTitleMode,
  topicTitleLen,
}: UseEnvironmentSettingsOptions) {
  const [envDraftName, setEnvDraftName] = useState("");
  const [envMessage, setEnvMessage] = useState<string | null>(null);
  const [savingEnvironment, setSavingEnvironment] = useState(false);
  const [promptSaveMessage, setPromptSaveMessage] = useState<string | null>(null);
  const [promptSaveScope, setPromptSaveScope] = useState<
    "evaluation" | "demo" | "per-question" | null
  >(null);
  const [savingTopicSettings, setSavingTopicSettings] = useState(false);
  const [topicSaveMessage, setTopicSaveMessage] = useState<string | null>(null);
  const [savingStreamingSettings, setSavingStreamingSettings] = useState(false);
  const [streamingSaveMessage, setStreamingSaveMessage] = useState<string | null>(null);

  const handleSetActiveEnvironment = useCallback(
    async (environment: string) => {
      if (!environment) {
        return;
      }
      setSavingEnvironment(true);
      setEnvMessage(null);
      traceEnvironmentAction("set_active", "start", { environment });
      try {
        const resp = await request("it/setActiveEnvironment", { environment });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvMessage(`已切换到 ${environment}`);
          traceEnvironmentAction("set_active", "success", { environment });
        } else {
          setEnvMessage("环境切换失败。");
          traceEnvironmentAction("set_active", "error", { environment, reason: "status_not_success" });
        }
      } catch (err) {
        setEnvMessage(`环境切换失败：${err instanceof Error ? err.message : String(err)}`);
        traceEnvironmentAction("set_active", "error", {
          environment,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setSavingEnvironment(false);
    },
    [setConfig],
  );

  const handleCreateEnvironment = useCallback(
    async (cloneFrom?: string) => {
      const environment = envDraftName.trim();
      if (!environment) {
        setEnvMessage("请填写环境名称。");
        return;
      }
      setSavingEnvironment(true);
      setEnvMessage(null);
      traceEnvironmentAction("create", "start", { environment, cloneFrom: cloneFrom || "" });
      try {
        const resp = await request("it/createTemplateEnvironment", {
          environment,
          cloneFrom: cloneFrom || "",
        });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvDraftName("");
          setEnvMessage("环境已创建并切换。");
          traceEnvironmentAction("create", "success", { environment, cloneFrom: cloneFrom || "" });
        } else {
          setEnvMessage("环境创建失败。");
          traceEnvironmentAction("create", "error", { environment, reason: "status_not_success" });
        }
      } catch (err) {
        setEnvMessage(`环境创建失败：${err instanceof Error ? err.message : String(err)}`);
        traceEnvironmentAction("create", "error", {
          environment,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setSavingEnvironment(false);
    },
    [envDraftName, setConfig],
  );

  const handleDeleteEnvironment = useCallback(
    async (environment: string) => {
      if (!environment) {
        return;
      }
      const confirmed = window.confirm(`确认删除环境 ${environment}？`);
      if (!confirmed) {
        traceEnvironmentAction("delete", "canceled", { environment });
        return;
      }
      setSavingEnvironment(true);
      setEnvMessage(null);
      traceEnvironmentAction("delete", "start", { environment });
      try {
        const resp = await request("it/deleteTemplateEnvironment", { environment });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvMessage("环境已删除。");
          traceEnvironmentAction("delete", "success", { environment });
        } else {
          setEnvMessage("环境删除失败。");
          traceEnvironmentAction("delete", "error", { environment, reason: "status_not_success" });
        }
      } catch (err) {
        setEnvMessage(`环境删除失败：${err instanceof Error ? err.message : String(err)}`);
        traceEnvironmentAction("delete", "error", {
          environment,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setSavingEnvironment(false);
    },
    [setConfig],
  );

  const handleSavePrompts = useCallback(
    async (scope: "evaluation" | "demo" | "per-question") => {
      setPromptSaveMessage(null);
      setPromptSaveScope(scope);
      traceEnvironmentAction("save_prompts", "start", { scope });
      try {
        await request("it/savePrompts", {
          evaluationPrompt: customPrompt,
          demoPrompt,
          perQuestionSystemPrompts,
          perQuestionDemoPrompts,
          answerMode,
        });
        setPromptSaveMessage("提示词已保存");
        traceEnvironmentAction("save_prompts", "success", { scope });
      } catch (err) {
        setPromptSaveMessage(
          `提示词保存失败：${err instanceof Error ? err.message : String(err)}`,
        );
        traceEnvironmentAction("save_prompts", "error", {
          scope,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [
      answerMode,
      customPrompt,
      demoPrompt,
      perQuestionDemoPrompts,
      perQuestionSystemPrompts,
    ],
  );

  const handleSaveTopicSettings = useCallback(async () => {
    setSavingTopicSettings(true);
    setTopicSaveMessage(null);
    traceEnvironmentAction("save_topic_settings", "start", {
      topicTitleMode,
      topicTitleLen: Number(topicTitleLen),
    });
    try {
      await request("it/updateTopicSettings", {
        topics: {
          titleMode: topicTitleMode,
          maxTitleLen: Number(topicTitleLen),
        },
      });
      setTopicSaveMessage("命名设置已保存");
      traceEnvironmentAction("save_topic_settings", "success", {
        topicTitleMode,
        topicTitleLen: Number(topicTitleLen),
      });
    } catch (err) {
      setTopicSaveMessage(
        `命名设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
      traceEnvironmentAction("save_topic_settings", "error", {
        topicTitleMode,
        topicTitleLen: Number(topicTitleLen),
        error: err instanceof Error ? err.message : String(err),
      });
    }
    setSavingTopicSettings(false);
  }, [topicTitleMode, topicTitleLen]);

  const handleSaveStreamingSettings = useCallback(async () => {
    setSavingStreamingSettings(true);
    setStreamingSaveMessage(null);
    traceEnvironmentAction("save_streaming_settings", "start", {
      enabled: Boolean(streamingSettings.enabled),
      autoCollapse: Boolean(streamingSettings.autoCollapse),
      previewChars: Number(streamingSettings.previewChars),
    });
    try {
      const resp = await request("it/updateStreamingSettings", {
        streaming: {
          enabled: Boolean(streamingSettings.enabled),
          autoCollapse: Boolean(streamingSettings.autoCollapse),
          previewChars: Number(streamingSettings.previewChars),
        },
      });
      if (resp?.status === "success") {
        if (resp.content?.streaming) {
          const preview = Number(resp.content.streaming.previewChars ?? 200);
          setStreamingSettings({
            enabled: resp.content.streaming.enabled !== false,
            autoCollapse: resp.content.streaming.autoCollapse !== false,
            previewChars: Number.isFinite(preview) ? Math.max(50, preview) : 200,
          });
        }
        setStreamingSaveMessage("实时输出设置已保存");
        traceEnvironmentAction("save_streaming_settings", "success", {
          enabled: Boolean(streamingSettings.enabled),
          autoCollapse: Boolean(streamingSettings.autoCollapse),
          previewChars: Number(streamingSettings.previewChars),
        });
      } else {
        setStreamingSaveMessage("实时输出设置保存失败，请重试。");
        traceEnvironmentAction("save_streaming_settings", "error", {
          reason: "status_not_success",
        });
      }
    } catch (err) {
      setStreamingSaveMessage(
        `实时输出设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
      traceEnvironmentAction("save_streaming_settings", "error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    setSavingStreamingSettings(false);
  }, [setStreamingSettings, streamingSettings]);

  return {
    envDraftName,
    setEnvDraftName,
    envMessage,
    savingEnvironment,
    handleSetActiveEnvironment,
    handleCreateEnvironment,
    handleDeleteEnvironment,
    handleSavePrompts,
    promptSaveMessage,
    promptSaveScope,
    handleSaveTopicSettings,
    savingTopicSettings,
    topicSaveMessage,
    handleSaveStreamingSettings,
    savingStreamingSettings,
    streamingSaveMessage,
  };
}
