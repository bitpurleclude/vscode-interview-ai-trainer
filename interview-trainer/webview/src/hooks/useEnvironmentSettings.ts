import { useCallback, useState } from "react";
import { request } from "../messenger";
import type { ItConfigSnapshot } from "../types";
import type { StreamingSettings } from "../components/settings/settingsTypes";

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
      try {
        const resp = await request("it/setActiveEnvironment", { environment });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvMessage(`已切换到 ${environment}`);
        } else {
          setEnvMessage("环境切换失败。");
        }
      } catch (err) {
        setEnvMessage(`环境切换失败：${err instanceof Error ? err.message : String(err)}`);
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
      try {
        const resp = await request("it/createTemplateEnvironment", {
          environment,
          cloneFrom: cloneFrom || "",
        });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvDraftName("");
          setEnvMessage("环境已创建并切换。");
        } else {
          setEnvMessage("环境创建失败。");
        }
      } catch (err) {
        setEnvMessage(`环境创建失败：${err instanceof Error ? err.message : String(err)}`);
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
        return;
      }
      setSavingEnvironment(true);
      setEnvMessage(null);
      try {
        const resp = await request("it/deleteTemplateEnvironment", { environment });
        if (resp?.status === "success" && resp.content) {
          setConfig(resp.content);
          setEnvMessage("环境已删除。");
        } else {
          setEnvMessage("环境删除失败。");
        }
      } catch (err) {
        setEnvMessage(`环境删除失败：${err instanceof Error ? err.message : String(err)}`);
      }
      setSavingEnvironment(false);
    },
    [setConfig],
  );

  const handleSavePrompts = useCallback(
    async (scope: "evaluation" | "demo" | "per-question") => {
      setPromptSaveMessage(null);
      setPromptSaveScope(scope);
      try {
        await request("it/savePrompts", {
          evaluationPrompt: customPrompt,
          demoPrompt,
          perQuestionSystemPrompts,
          perQuestionDemoPrompts,
          answerMode,
        });
        setPromptSaveMessage("提示词已保存");
      } catch (err) {
        setPromptSaveMessage(
          `提示词保存失败：${err instanceof Error ? err.message : String(err)}`,
        );
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
    try {
      await request("it/updateTopicSettings", {
        topics: {
          titleMode: topicTitleMode,
          maxTitleLen: Number(topicTitleLen),
        },
      });
      setTopicSaveMessage("命名设置已保存");
    } catch (err) {
      setTopicSaveMessage(
        `命名设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTopicSettings(false);
  }, [topicTitleMode, topicTitleLen]);

  const handleSaveStreamingSettings = useCallback(async () => {
    setSavingStreamingSettings(true);
    setStreamingSaveMessage(null);
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
      } else {
        setStreamingSaveMessage("实时输出设置保存失败，请重试。");
      }
    } catch (err) {
      setStreamingSaveMessage(
        `实时输出设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
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
