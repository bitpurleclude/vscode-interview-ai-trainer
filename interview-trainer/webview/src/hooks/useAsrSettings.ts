import { useCallback, useEffect, useState } from "react";
import { request } from "../messenger";
import type { ItConfigSnapshot } from "../types";
import type { AsrForm } from "../components/settings/settingsTypes";

type UseAsrSettingsOptions = {
  config: ItConfigSnapshot | null;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
  asrForm: AsrForm;
  setAsrForm: React.Dispatch<React.SetStateAction<AsrForm>>;
};

function it_buildAsrForm(asr?: ItConfigSnapshot["asr"]): AsrForm {
  return {
    language: asr?.language || "zh",
    devPid: Number(asr?.devPid ?? 1537),
    maxChunkSec: Number(asr?.maxChunkSec ?? 50),
    maxConcurrency: Number(asr?.maxConcurrency ?? 1),
    timeoutSec: Number(asr?.timeoutSec ?? 120),
    maxRetries: Number(asr?.maxRetries ?? 1),
    mockText: asr?.mockText || "",
  };
}

export function useAsrSettings({
  config,
  setConfig,
  asrForm,
  setAsrForm,
}: UseAsrSettingsOptions) {
  const [savingAsr, setSavingAsr] = useState(false);
  const [asrSaveMessage, setAsrSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.asr) {
      return;
    }
    setAsrForm(it_buildAsrForm(config.asr));
  }, [config, setAsrForm]);

  const handleSaveAsrSettings = useCallback(async () => {
    setSavingAsr(true);
    setAsrSaveMessage(null);
    const payload = {
      asr: {
        language: asrForm.language,
        devPid: Number(asrForm.devPid),
        maxChunkSec: Number(asrForm.maxChunkSec),
        maxConcurrency: Number(asrForm.maxConcurrency),
        timeoutSec: Number(asrForm.timeoutSec),
        maxRetries: Number(asrForm.maxRetries),
        mockText: asrForm.mockText,
      },
    };
    try {
      const resp = await request("it/updateAsrSettings", payload);
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setAsrSaveMessage("ASR 设置已保存");
      } else {
        setAsrSaveMessage("ASR 设置保存失败，请重试。");
      }
    } catch (err) {
      setAsrSaveMessage(
        `ASR 设置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingAsr(false);
  }, [asrForm, setConfig]);

  return {
    savingAsr,
    asrSaveMessage,
    handleSaveAsrSettings,
  };
}
