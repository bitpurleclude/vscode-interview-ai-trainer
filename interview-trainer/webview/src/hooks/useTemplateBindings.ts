import { useCallback, useState } from "react";
import { request } from "../messenger";
import type { ItConfigSnapshot, ItTemplateBindings } from "../types";

type SecretDraft = {
  name: string;
  value: string;
};

type UseTemplateBindingsOptions = {
  templateBindings: ItTemplateBindings;
  setTemplateBindings: React.Dispatch<React.SetStateAction<ItTemplateBindings>>;
  templateParamOptions: string[];
  setTemplateParamOptions: React.Dispatch<React.SetStateAction<string[]>>;
  templateSecrets: string[];
  setTemplateSecrets: React.Dispatch<React.SetStateAction<string[]>>;
  setTemplateSaveMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
};

export function useTemplateBindings({
  templateBindings,
  setTemplateBindings,
  templateParamOptions,
  setTemplateParamOptions,
  templateSecrets,
  setTemplateSecrets,
  setTemplateSaveMessage,
  setConfig,
}: UseTemplateBindingsOptions) {
  const [templateParamInput, setTemplateParamInput] = useState("");
  const [secretDraft, setSecretDraft] = useState<SecretDraft>({ name: "", value: "" });
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [savingBindings, setSavingBindings] = useState(false);
  const [savingParamOptions, setSavingParamOptions] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);

  const handleSaveBindings = useCallback(async () => {
    setSavingBindings(true);
    try {
      const resp = await request("it/saveTemplateBindings", { bindings: templateBindings });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("绑定已保存。");
      } else {
        setTemplateSaveMessage("绑定保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `绑定保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingBindings(false);
  }, [setConfig, setTemplateSaveMessage, templateBindings]);

  const handleSaveParamOptions = useCallback(async () => {
    setSavingParamOptions(true);
    try {
      const options = Array.from(new Set(templateParamOptions.map((item) => String(item).trim())))
        .filter(Boolean);
      const resp = await request("it/saveTemplateParamOptions", {
        options: { reasoning_effort: options },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("参数选项已保存。");
      } else {
        setTemplateSaveMessage("参数选项保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `参数选项保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingParamOptions(false);
  }, [setConfig, setTemplateSaveMessage, templateParamOptions]);

  const handleAddParamOption = useCallback(() => {
    const raw = templateParamInput.trim();
    if (!raw) {
      return;
    }
    if (!templateParamOptions.includes(raw)) {
      setTemplateParamOptions((prev) => [...prev, raw]);
    }
    setTemplateParamInput("");
  }, [templateParamInput, templateParamOptions, setTemplateParamOptions]);

  const handleSaveSecret = useCallback(async () => {
    const name = secretDraft.name.trim();
    if (!name) {
      setSecretMessage("请填写密钥名称。");
      return;
    }
    setSavingSecret(true);
    setSecretMessage(null);
    try {
      const resp = await request("it/saveTemplateSecret", {
        name,
        value: secretDraft.value,
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setSecretMessage("密钥已保存。");
        setSecretDraft({ name: "", value: "" });
      } else {
        setSecretMessage("密钥保存失败，请重试。");
      }
    } catch (err) {
      setSecretMessage(`密钥保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingSecret(false);
  }, [secretDraft, setConfig]);

  const handleDeleteSecret = useCallback(
    async (name: string) => {
      setSavingSecret(true);
      setSecretMessage(null);
      try {
        const resp = await request("it/deleteTemplateSecret", { name });
        if (resp?.status === "success") {
          if (resp.content) {
            setConfig(resp.content);
          }
          setSecretMessage("密钥已删除。");
        } else {
          setSecretMessage(`密钥删除失败：${resp?.error || "请重试。"}`);
        }
      } catch (err) {
        setSecretMessage(`密钥删除失败：${err instanceof Error ? err.message : String(err)}`);
      }
      setSavingSecret(false);
    },
    [setConfig],
  );

  return {
    templateBindings,
    setTemplateBindings,
    templateParamOptions,
    templateParamInput,
    setTemplateParamInput,
    templateSecrets,
    setTemplateSecrets,
    secretDraft,
    setSecretDraft,
    secretMessage,
    savingBindings,
    savingParamOptions,
    savingSecret,
    handleSaveBindings,
    handleSaveParamOptions,
    handleAddParamOption,
    handleSaveSecret,
    handleDeleteSecret,
  };
}
