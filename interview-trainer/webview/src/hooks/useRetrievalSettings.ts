import { useCallback, useState } from "react";
import { request } from "../messenger";
import type { ItConfigSnapshot } from "../types";
import type { RetrievalForm } from "../components/settings/settingsTypes";

type UseRetrievalSettingsOptions = {
  config: ItConfigSnapshot | null;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
  retrievalForm: RetrievalForm;
  setRetrievalForm: React.Dispatch<React.SetStateAction<RetrievalForm>>;
  applyRetrievalToForm: (cfg: ItConfigSnapshot | null) => void;
  setTraceLogEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useRetrievalSettings({
  config,
  setConfig,
  retrievalForm,
  setRetrievalForm,
  applyRetrievalToForm,
  setTraceLogEnabled,
}: UseRetrievalSettingsOptions) {
  const [savingRetrieval, setSavingRetrieval] = useState(false);
  const [retrievalSaveMessage, setRetrievalSaveMessage] = useState<string | null>(null);
  const [clearingEmbeddingCache, setClearingEmbeddingCache] = useState(false);
  const [embeddingCacheMessage, setEmbeddingCacheMessage] = useState<string | null>(null);
  const [clearingCorpusCache, setClearingCorpusCache] = useState(false);
  const [corpusCacheMessage, setCorpusCacheMessage] = useState<string | null>(null);

  const handleRetrievalFieldChange = useCallback(
    (
      key:
        | "mode"
        | "topK"
        | "topKNotes"
        | "topKKnowledge"
        | "topKRubrics"
        | "topKExamples"
        | "maxConcurrency"
        | "embeddingMaxConcurrency"
        | "minScore",
      value: any,
    ) => {
      setRetrievalForm((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [setRetrievalForm],
  );

  const handleRetrievalVectorChange = useCallback(
    (key: keyof RetrievalForm["vector"], value: any) => {
      setRetrievalForm((prev) => ({
        ...prev,
        vector: {
          ...prev.vector,
          [key]: value,
        },
      }));
    },
    [setRetrievalForm],
  );

  const handleSaveRetrievalSettings = useCallback(async () => {
    setSavingRetrieval(true);
    setRetrievalSaveMessage(null);
    try {
      const payload = {
        retrieval: {
          enabled: config?.retrievalEnabled ?? true,
          mode: retrievalForm.mode,
          topK: Number(retrievalForm.topK),
          topKNotes: Number(retrievalForm.topKNotes),
          topKKnowledge: Number(retrievalForm.topKKnowledge),
          topKRubrics: Number(retrievalForm.topKRubrics),
          topKExamples: Number(retrievalForm.topKExamples),
          maxConcurrency: Number(retrievalForm.maxConcurrency),
          embeddingMaxConcurrency: Number(retrievalForm.embeddingMaxConcurrency),
          minScore: Number(retrievalForm.minScore),
          vector: {
            batchSize: Number(retrievalForm.vector.batchSize),
            queryMaxChars: Number(retrievalForm.vector.queryMaxChars),
          },
        },
      };
      const resp = await request("it/updateRetrievalSettings", payload);
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
          applyRetrievalToForm(resp.content);
        }
        setRetrievalSaveMessage("检索配置已保存。");
      } else {
        setRetrievalSaveMessage("检索配置保存失败，请检查输入。");
      }
    } catch (err) {
      setRetrievalSaveMessage(
        `检索配置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingRetrieval(false);
  }, [applyRetrievalToForm, config?.retrievalEnabled, retrievalForm, setConfig]);

  const handleClearEmbeddingCache = useCallback(async () => {
    setClearingEmbeddingCache(true);
    setEmbeddingCacheMessage(null);
    try {
      const resp = await request("it/clearEmbeddingCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setEmbeddingCacheMessage(cleared ? "已清理缓存" : "缓存为空，无需清理");
      } else {
        setEmbeddingCacheMessage("清理缓存失败，请重试。");
      }
    } catch (err) {
      setEmbeddingCacheMessage(
        `清理缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingEmbeddingCache(false);
  }, []);

  const handleClearCorpusCache = useCallback(async () => {
    setClearingCorpusCache(true);
    setCorpusCacheMessage(null);
    try {
      const resp = await request("it/clearCorpusCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setCorpusCacheMessage(cleared ? "已清理语料缓存" : "语料缓存为空");
      } else {
        setCorpusCacheMessage("清理语料缓存失败，请重试。");
      }
    } catch (err) {
      setCorpusCacheMessage(
        `清理语料缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingCorpusCache(false);
  }, []);

  const handleToggleRetrieval = useCallback(async (enabled: boolean) => {
    await request("it/setRetrievalEnabled", { enabled });
  }, []);

  const handleEnableTraceLogs = useCallback(async () => {
    try {
      const resp = await request("it/enableTraceLogs", {});
      if (resp?.status === "success") {
        setTraceLogEnabled(true);
      }
    } catch {
      // ignore
    }
  }, [setTraceLogEnabled]);

  return {
    savingRetrieval,
    retrievalSaveMessage,
    clearingEmbeddingCache,
    embeddingCacheMessage,
    clearingCorpusCache,
    corpusCacheMessage,
    handleRetrievalFieldChange,
    handleRetrievalVectorChange,
    handleSaveRetrievalSettings,
    handleClearEmbeddingCache,
    handleClearCorpusCache,
    handleToggleRetrieval,
    handleEnableTraceLogs,
  };
}
