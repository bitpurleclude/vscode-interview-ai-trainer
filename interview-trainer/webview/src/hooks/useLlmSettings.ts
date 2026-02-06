import { useCallback, useEffect, useState } from "react";
import { request } from "../messenger";
import type { ItConfigSnapshot } from "../types";
import type { LlmForm } from "../components/settings/settingsTypes";

type UseLlmSettingsOptions = {
  config: ItConfigSnapshot | null;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
  llmForm: LlmForm;
  setLlmForm: React.Dispatch<React.SetStateAction<LlmForm>>;
};

function it_buildLlmForm(llm?: ItConfigSnapshot["llm"]): LlmForm {
  return {
    timeoutSec: Number(llm?.timeoutSec ?? 60),
    maxRetries: Number(llm?.maxRetries ?? 1),
  };
}

export function useLlmSettings({
  config,
  setConfig,
  llmForm,
  setLlmForm,
}: UseLlmSettingsOptions) {
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmSaveMessage, setLlmSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.llm) {
      return;
    }
    setLlmForm(it_buildLlmForm(config.llm));
  }, [config, setLlmForm]);

  const handleSaveLlmSettings = useCallback(async () => {
    setSavingLlm(true);
    setLlmSaveMessage(null);
    const payload = {
      llm: {
        timeoutSec: Number(llmForm.timeoutSec),
        maxRetries: Number(llmForm.maxRetries),
      },
    };
    try {
      const resp = await request("it/updateLlmSettings", payload);
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setLlmSaveMessage("LLM 设置已保存");
      } else {
        setLlmSaveMessage("LLM 设置保存失败，请重试。");
      }
    } catch (err) {
      setLlmSaveMessage(
        `LLM 设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingLlm(false);
  }, [llmForm, setConfig]);

  return {
    savingLlm,
    llmSaveMessage,
    handleSaveLlmSettings,
  };
}
