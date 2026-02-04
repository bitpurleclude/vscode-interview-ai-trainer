import { useCallback, useEffect, useState } from "react";
import { request } from "../messenger";
import type { ItApiTemplate, ItConfigSnapshot, ItTemplateCategory } from "../types";
import { cloneTemplate, formatJson, parseJson } from "../utils/template";

type TemplateJsonDraft = {
  headers: string;
  query: string;
  body: string;
};

type TemplateJsonErrors = Partial<Record<"headers" | "query" | "body", string>>;

type UseTemplateEditorOptions = {
  templateCategory: ItTemplateCategory;
  templatesByCategory: ItApiTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: React.Dispatch<React.SetStateAction<string>>;
  selectedTemplate: ItApiTemplate | null;
  setConfig: React.Dispatch<React.SetStateAction<ItConfigSnapshot | null>>;
};

export function useTemplateEditor({
  templateCategory,
  templatesByCategory,
  selectedTemplateId,
  setSelectedTemplateId,
  selectedTemplate,
  setConfig,
}: UseTemplateEditorOptions) {
  const [templateDraft, setTemplateDraft] = useState<ItApiTemplate | null>(null);
  const [templateDraftOrigin, setTemplateDraftOrigin] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateJsonDraft, setTemplateJsonDraft] = useState<TemplateJsonDraft>({
    headers: "{\n  \"Content-Type\": \"application/json\"\n}",
    query: "{}",
    body: "{}",
  });
  const [templateJsonErrors, setTemplateJsonErrors] = useState<TemplateJsonErrors>({});
  const [templateSaveMessage, setTemplateSaveMessage] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const buildDefaultTemplate = useCallback(
    (category: ItTemplateCategory): ItApiTemplate => {
      const mode = category === "llm" ? "sse" : "json";
      return {
        id: "",
        name: "",
        category,
        request: {
          method: "POST",
          url: "",
          headers: {
            Authorization: "Bearer {{apiKey}}",
            "Content-Type": "application/json",
          },
          body: {},
          stream: mode === "sse",
        },
        response: {
          mode,
          textPath: "",
        },
        streaming:
          mode === "sse"
            ? {
                eventDelimiter: "\n\n",
                dataPrefix: "data:",
                deltaPath: "",
                doneSignals: ["[DONE]"],
              }
            : undefined,
        updatedAt: new Date().toISOString(),
      };
    },
    [],
  );

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!templatesByCategory.length) {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    if (!selectedTemplateId || !templatesByCategory.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(templatesByCategory[0].id);
    }
  }, [templatesByCategory, selectedTemplateId, isCreatingTemplate, setSelectedTemplateId]);

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!selectedTemplate) {
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    setTemplateDraft(cloneTemplate(selectedTemplate));
    setTemplateDraftOrigin(selectedTemplate.id);
    setTemplateJsonDraft({
      headers: formatJson(selectedTemplate.request?.headers, "{}"),
      query: formatJson(selectedTemplate.request?.query, "{}"),
      body: formatJson(selectedTemplate.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
  }, [selectedTemplate, isCreatingTemplate]);

  const updateTemplateRequest = useCallback((patch: Partial<ItApiTemplate["request"]>) => {
    setTemplateDraft((prev) =>
      prev
        ? {
            ...prev,
            request: {
              ...(prev.request || { method: "POST", url: "" }),
              ...patch,
            },
          }
        : prev,
    );
  }, []);

  const updateTemplateResponse = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["response"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              response: {
                ...(prev.response || { mode: "json" }),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );

  const updateTemplateStreaming = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["streaming"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              streaming: {
                ...(prev.streaming || {}),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );

  const handleCreateTemplate = useCallback(() => {
    const next = buildDefaultTemplate(templateCategory);
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: formatJson(next.request?.headers, "{}"),
      query: formatJson(next.request?.query, "{}"),
      body: formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [buildDefaultTemplate, templateCategory, setSelectedTemplateId]);

  const handleDuplicateTemplate = useCallback(() => {
    if (!selectedTemplate) {
      return;
    }
    const next = cloneTemplate(selectedTemplate);
    next.id = "";
    next.name = `${next.name || selectedTemplate.id}-copy`;
    next.updatedAt = new Date().toISOString();
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: formatJson(next.request?.headers, "{}"),
      query: formatJson(next.request?.query, "{}"),
      body: formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [selectedTemplate, setSelectedTemplateId]);

  const handleCancelTemplateDraft = useCallback(() => {
    setIsCreatingTemplate(false);
    setTemplateSaveMessage(null);
    if (templatesByCategory.length) {
      setSelectedTemplateId(templatesByCategory[0].id);
    } else {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
    }
  }, [templatesByCategory, setSelectedTemplateId]);

  const handleSaveTemplate = async () => {
    if (!templateDraft) {
      return;
    }
    const id = String(templateDraft.id || "").trim();
    if (!id) {
      setTemplateSaveMessage("请填写模板 ID。");
      return;
    }
    const headersParsed = parseJson(templateJsonDraft.headers);
    const queryParsed = parseJson(templateJsonDraft.query);
    const bodyParsed = parseJson(templateJsonDraft.body);
    const errors: Partial<Record<"headers" | "query" | "body", string>> = {};
    if (!headersParsed.ok) {
      errors.headers = headersParsed.error;
    }
    if (!queryParsed.ok) {
      errors.query = queryParsed.error;
    }
    if (!bodyParsed.ok) {
      errors.body = bodyParsed.error;
    }
    setTemplateJsonErrors(errors);
    if (Object.keys(errors).length) {
      setTemplateSaveMessage("模板 JSON 格式错误，请修正后再保存。");
      return;
    }
    const responseMode = templateDraft.response?.mode || "json";
    const nextTemplate: ItApiTemplate = {
      ...templateDraft,
      id,
      name: String(templateDraft.name || id).trim() || id,
      request: {
        ...(templateDraft.request || { method: "POST", url: "" }),
        headers: headersParsed.ok ? headersParsed.value : undefined,
        query: queryParsed.ok ? queryParsed.value : undefined,
        body: bodyParsed.ok ? bodyParsed.value : undefined,
      },
      response: {
        mode: responseMode,
        textPath: templateDraft.response?.textPath || undefined,
        jsonPath: templateDraft.response?.jsonPath || undefined,
        errorPath: templateDraft.response?.errorPath || undefined,
        statusPath: templateDraft.response?.statusPath || undefined,
        doneSignal: templateDraft.response?.doneSignal || undefined,
      },
      streaming:
        responseMode === "sse"
          ? {
              eventDelimiter: templateDraft.streaming?.eventDelimiter || undefined,
              dataPrefix: templateDraft.streaming?.dataPrefix || undefined,
              deltaPath: templateDraft.streaming?.deltaPath || undefined,
              doneSignals:
                templateDraft.streaming?.doneSignals &&
                templateDraft.streaming.doneSignals.filter(Boolean).length
                  ? templateDraft.streaming.doneSignals.filter(Boolean)
                  : undefined,
              heartbeatPattern: templateDraft.streaming?.heartbeatPattern || undefined,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/saveTemplate", { template: nextTemplate });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setIsCreatingTemplate(false);
        setSelectedTemplateId(nextTemplate.id);
        setTemplateSaveMessage("模板已保存。");
      } else {
        setTemplateSaveMessage("模板保存失败，请检查输入。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `模板保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async () => {
    const templateId = selectedTemplate?.id || "";
    if (!templateId) {
      return;
    }
    const confirmed = window.confirm(`确认删除模板 ${templateId}？`);
    if (!confirmed) {
      return;
    }
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/deleteTemplate", { templateId });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("模板已删除。");
      } else {
        setTemplateSaveMessage("删除失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingTemplate(false);
  };

  return {
    templateDraft,
    setTemplateDraft,
    templateDraftOrigin,
    templateJsonDraft,
    setTemplateJsonDraft,
    templateJsonErrors,
    setTemplateJsonErrors,
    templateSaveMessage,
    setTemplateSaveMessage,
    savingTemplate,
    isCreatingTemplate,
    handleCreateTemplate,
    handleDuplicateTemplate,
    handleCancelTemplateDraft,
    handleSaveTemplate,
    handleDeleteTemplate,
    updateTemplateRequest,
    updateTemplateResponse,
    updateTemplateStreaming,
  };
}
