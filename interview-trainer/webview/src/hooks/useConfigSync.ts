import { useCallback, useEffect, useState } from "react";
import { on, request } from "../messenger";
import type { ItConfigSnapshot, ItState, ItTemplateBindings } from "../types";
import type { RetrievalForm, StreamingSettings } from "../components/settings/settingsTypes";
import { STRICT_SYSTEM_PROMPT, DEFAULT_DEMO_PROMPT } from "../constants/prompts";

type UseConfigSyncOptions = {
  setItState: React.Dispatch<React.SetStateAction<ItState>>;
  setCustomPrompt: React.Dispatch<React.SetStateAction<string>>;
  setDemoPrompt: React.Dispatch<React.SetStateAction<string>>;
  setPerQuestionSystemPrompts: React.Dispatch<React.SetStateAction<string[]>>;
  setPerQuestionDemoPrompts: React.Dispatch<React.SetStateAction<string[]>>;
  setAnswerMode: React.Dispatch<React.SetStateAction<"single" | "two-step">>;
  setTopicTitleMode: React.Dispatch<React.SetStateAction<"llm" | "simple">>;
  setTopicTitleLen: React.Dispatch<React.SetStateAction<number>>;
  setStreamingSettings: React.Dispatch<React.SetStateAction<StreamingSettings>>;
  setTemplateBindings: React.Dispatch<React.SetStateAction<ItTemplateBindings>>;
  setTemplateParamOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setTemplateSecrets: React.Dispatch<React.SetStateAction<string[]>>;
  setRetrievalForm: React.Dispatch<React.SetStateAction<RetrievalForm>>;
};

export function useConfigSync({
  setItState,
  setCustomPrompt,
  setDemoPrompt,
  setPerQuestionSystemPrompts,
  setPerQuestionDemoPrompts,
  setAnswerMode,
  setTopicTitleMode,
  setTopicTitleLen,
  setStreamingSettings,
  setTemplateBindings,
  setTemplateParamOptions,
  setTemplateSecrets,
  setRetrievalForm,
}: UseConfigSyncOptions) {
  const [config, setConfig] = useState<ItConfigSnapshot | null>(null);
  const [nativeInputs, setNativeInputs] = useState<string[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("");

  const applyRetrievalToForm = useCallback(
    (cfg: ItConfigSnapshot | null) => {
      if (!cfg) return;
      const retrieval = cfg.retrieval || ({} as ItConfigSnapshot["retrieval"]);
      const vector = retrieval.vector || ({} as ItConfigSnapshot["retrieval"]["vector"]);
      setRetrievalForm({
        mode: retrieval.mode || "vector",
        topK: Number(retrieval.topK ?? 5),
        topKNotes: Number(retrieval.topKNotes ?? retrieval.topK ?? 5),
        topKKnowledge: Number(retrieval.topKKnowledge ?? retrieval.topK ?? 5),
        topKRubrics: Number(retrieval.topKRubrics ?? retrieval.topK ?? 5),
        topKExamples: Number(retrieval.topKExamples ?? retrieval.topK ?? 5),
        maxConcurrency: Number(retrieval.maxConcurrency ?? 3),
        embeddingMaxConcurrency: Number(retrieval.embeddingMaxConcurrency ?? 1),
        minScore: Number(retrieval.minScore ?? 0.2),
        vector: {
          batchSize: Number(vector.batchSize ?? 16),
          queryMaxChars: Number(vector.queryMaxChars ?? 1500),
        },
      });
    },
    [setRetrievalForm],
  );

  useEffect(() => {
    (window as any).__itReady = true;
    request("it/getState", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setItState(resp.content);
      }
    });
    request("it/getConfig", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        applyRetrievalToForm(resp.content);
        setCustomPrompt(
          resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
        );
        setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(
          resp.content.prompts?.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
        );
        setPerQuestionDemoPrompts(
          resp.content.prompts?.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
        );
      } else {
        const fallbackConfig: ItConfigSnapshot = {
          activeEnvironment: "prod",
          envList: ["prod"],
          llmProvider: "baidu_qianfan",
          asrProvider: "baidu_vop",
          acousticProvider: "api",
          llmProfiles: {},
          asrProfiles: {},
          providerProfiles: {},
          prompts: {
            evaluationPrompt: STRICT_SYSTEM_PROMPT,
            demoPrompt: DEFAULT_DEMO_PROMPT,
            perQuestionSystemPrompts: ["", "", ""],
            perQuestionDemoPrompts: ["", "", ""],
          },
          llmTasks: {
            questionParse: "",
            segment: "",
            evaluation: "",
          },
          llm: {
            provider: "baidu_qianfan",
            baseUrl: "https://qianfan.baidubce.com/v2",
            model: "ernie-4.5-turbo-128k",
            apiKey: "",
            temperature: 0.8,
            topP: 0.8,
            timeoutSec: 60,
            maxRetries: 1,
            useResponses: false,
            apiMode: "chat",
            responsesPath: "/v1/responses",
            reasoningEffort: "medium",
            maxOutputTokens: 800,
            reusePrefix: false,
            stream: true,
          },
          templates: {
            templates: [],
            bindings: { llm: {}, asr: {}, embedding: {} },
            paramCatalog: {
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
                "reusePrefix",
              ],
              asr: [
                "audioFile",
                "audio.format",
                "audio.sampleRate",
                "audio.channel",
                "audio.byteLength",
                "asr.lang",
                "asr.dev_pid",
              ],
              embedding: ["embeddingInput", "model"],
            },
            paramUsage: {},
            paramOptions: { reasoningEffort: ["low", "medium", "high", "xhigh"] },
            secretNames: [],
          },
          asr: {
            provider: "baidu_vop",
            baseUrl: "https://vop.baidu.com/server_api",
            apiKey: "",
            secretKey: "",
            language: "zh",
            devPid: 1537,
            mockText: "",
            maxChunkSec: 50,
            maxConcurrency: 1,
            timeoutSec: 120,
            maxRetries: 1,
          },
          sessionsDir: "sessions",
          retrievalEnabled: true,
          retrieval: {
            mode: "vector",
            topK: 5,
            minScore: 0.2,
            embeddingProvider: "volc_doubao",
            vector: {
              provider: "volc_doubao",
              baseUrl: "https://ark.cn-beijing.volces.com",
              apiKey: "",
              model: "doubao-embedding",
              timeoutSec: 30,
              maxRetries: 1,
              batchSize: 16,
              queryMaxChars: 1500,
            },
          },
          workspaceDirs: {
            notesDir: "inputs/notes",
            promptsDir: "inputs/prompts/guangdong",
            rubricsDir: "inputs/rubrics",
            knowledgeDir: "inputs/knowledge",
            examplesDir: "inputs/examples",
          },
        };
        setConfig(fallbackConfig);
        setCustomPrompt(STRICT_SYSTEM_PROMPT);
        setDemoPrompt(DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(["", "", ""]);
        setPerQuestionDemoPrompts(["", "", ""]);
        setItState((prev) => ({
          ...prev,
          statusMessage: "配置加载失败，已使用默认配置",
        }));
      }
    });
    request("it/listNativeInputs", undefined).then((resp) => {
      if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
        setNativeInputs(resp.content.inputs);
        setSelectedInput(resp.content.inputs[0] || "");
      }
    });
  }, [
    applyRetrievalToForm,
    setCustomPrompt,
    setDemoPrompt,
    setItState,
    setPerQuestionSystemPrompts,
    setPerQuestionDemoPrompts,
  ]);

  useEffect(() => {
    if (!config) return;
    applyRetrievalToForm(config);
    if (config.prompts) {
      setCustomPrompt(config.prompts.evaluationPrompt ?? STRICT_SYSTEM_PROMPT);
      setDemoPrompt(config.prompts.demoPrompt ?? DEFAULT_DEMO_PROMPT);
      setPerQuestionSystemPrompts(
        config.prompts.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
      );
      setPerQuestionDemoPrompts(
        config.prompts.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
      );
    }
    const nextAnswerMode = String(config.evaluation?.answerMode || "two-step");
    setAnswerMode(nextAnswerMode === "single" ? "single" : "two-step");
    const nextTitleMode = String(config.topics?.titleMode || "llm");
    setTopicTitleMode(nextTitleMode === "simple" ? "simple" : "llm");
    const nextTitleLen = Number(config.topics?.maxTitleLen ?? 18);
    setTopicTitleLen(Number.isFinite(nextTitleLen) ? nextTitleLen : 18);
    if (config.streaming) {
      const nextPreview = Number(config.streaming.previewChars ?? 200);
      setStreamingSettings({
        enabled: config.streaming.enabled !== false,
        autoCollapse: config.streaming.autoCollapse !== false,
        previewChars: Number.isFinite(nextPreview) ? Math.max(50, nextPreview) : 200,
      });
    }
    if (config.templates) {
      setTemplateBindings(config.templates.bindings || { llm: {}, asr: {}, embedding: {} });
      setTemplateParamOptions(
        config.templates.paramOptions?.reasoningEffort ?? ["low", "medium", "high", "xhigh"],
      );
      setTemplateSecrets(config.templates.secretNames ?? []);
    }
  }, [
    config,
    applyRetrievalToForm,
    setCustomPrompt,
    setDemoPrompt,
    setPerQuestionSystemPrompts,
    setPerQuestionDemoPrompts,
    setAnswerMode,
    setTopicTitleMode,
    setTopicTitleLen,
    setStreamingSettings,
    setTemplateBindings,
    setTemplateParamOptions,
    setTemplateSecrets,
  ]);

  useEffect(() => {
    const disposeState = on("it/stateUpdate", (data) => {
      setItState(data);
    });
    const disposeConfig = on("it/configUpdate", (data) => {
      setConfig(data);
    });
    return () => {
      disposeState();
      disposeConfig();
    };
  }, [setItState]);

  const handleRefreshInputs = useCallback(async () => {
    const resp = await request("it/listNativeInputs", { refresh: true });
    if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
      const inputs = resp.content.inputs;
      setNativeInputs(inputs);
      if (inputs.length && !inputs.includes(selectedInput)) {
        setSelectedInput(inputs[0] || "");
      }
      return;
    }
    setItState((prev) => ({
      ...prev,
      statusMessage: "刷新输入设备失败，请确认 ffmpeg 可用且麦克风权限已授权。",
    }));
  }, [selectedInput, setItState]);

  const reloadConfig = useCallback(async () => {
    const resp = await request("it/getConfig", undefined);
    if (resp?.status === "success" && resp.content) {
      setConfig(resp.content);
      applyRetrievalToForm(resp.content);
      setCustomPrompt(
        resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
      );
      setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
    }
  }, [applyRetrievalToForm, setCustomPrompt, setDemoPrompt]);

  return {
    config,
    setConfig,
    nativeInputs,
    selectedInput,
    setSelectedInput,
    handleRefreshInputs,
    applyRetrievalToForm,
    reloadConfig,
  };
}
