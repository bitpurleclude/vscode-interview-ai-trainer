import React, { useEffect, useMemo, useState } from "react";
import type { SettingsBindingProps, SettingsCommonTemplateProps } from "./settingsTypes";
import type { ItTemplateCategory } from "../../types";
import { InfoTip } from "../common/InfoTip";
import { on, request } from "../../messenger";

const TEMPLATE_CATEGORY_TABS: Array<{
  key: ItTemplateCategory;
  label: string;
  enabled: boolean;
}> = [
  { key: "llm", label: "LLM", enabled: true },
  { key: "asr", label: "ASR", enabled: true },
  { key: "embedding", label: "Embedding", enabled: true },
  { key: "tts", label: "TTS", enabled: false },
  { key: "vision", label: "Vision", enabled: false },
  { key: "tools", label: "Tools", enabled: false },
];

const TEMPLATE_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];
const TEMPLATE_RESPONSE_MODES = [
  { value: "json", label: "JSON" },
  { value: "sse", label: "SSE" },
  { value: "ndjson", label: "NDJSON" },
  { value: "websocket", label: "WebSocket" },
  { value: "binary", label: "Binary" },
];

type SettingsTemplateManagerProps = SettingsCommonTemplateProps &
  Pick<SettingsBindingProps, "templateBindings">;

export const SettingsTemplateManager: React.FC<SettingsTemplateManagerProps> = (props) => {
  const {
    uiLocked,
    templateCategory,
    setTemplateCategory,
    templatesByCategory,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
    templateBindings,
    templateDraft,
    setTemplateDraft,
    templateJsonDraft,
    setTemplateJsonDraft,
    templateJsonErrors,
    setTemplateJsonErrors,
    templateSaveMessage,
    savingTemplate,
    isCreatingTemplate,
    handleCreateTemplate,
    handleDuplicateTemplate,
    handleDeleteTemplate,
    handleCancelTemplateDraft,
    handleSaveTemplate,
    updateTemplateRequest,
    updateTemplateResponse,
    updateTemplateStreaming,
    paramCatalogList,
    templateUsageSets,
    templateSecrets,
    secretDraft,
    setSecretDraft,
    savingSecret,
    secretMessage,
    handleSaveSecret,
    handleDeleteSecret,
    templateParamOptions,
    templateParamInput,
    setTemplateParamInput,
    savingParamOptions,
    handleAddParamOption,
    handleSaveParamOptions,
  } = props;
  const [testInput, setTestInput] = useState("ping");
  const [testVarsDraft, setTestVarsDraft] = useState("{}");
  const [testVarsError, setTestVarsError] = useState<string | null>(null);
  const [testRequestPreview, setTestRequestPreview] = useState<any | null>(null);
  const [testResponsePreview, setTestResponsePreview] = useState<any | null>(null);
  const [testStreamOutput, setTestStreamOutput] = useState<string>("");
  const [testMissingVars, setTestMissingVars] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testRunId, setTestRunId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const selectedTemplateName = selectedTemplate?.name || selectedTemplate?.id || "";
  const canTest = Boolean(selectedTemplateId);
  const boundIds = useMemo(
    () =>
      new Set(
        [
          templateBindings.llm?.questionParse,
          templateBindings.llm?.segment,
          templateBindings.llm?.evaluation,
          templateBindings.asr?.transcription,
          templateBindings.embedding?.retrieval,
        ].filter(Boolean) as string[],
      ),
    [templateBindings],
  );
  const requestPreviewText = useMemo(() => {
    if (!testRequestPreview) return "";
    try {
      return JSON.stringify(testRequestPreview, null, 2);
    } catch {
      return String(testRequestPreview);
    }
  }, [testRequestPreview]);
  const responsePreviewText = useMemo(() => {
    if (!testResponsePreview) return "";
    try {
      return JSON.stringify(testResponsePreview, null, 2);
    } catch {
      return String(testResponsePreview);
    }
  }, [testResponsePreview]);

  useEffect(() => {
    const dispose = on("it/templateTestDelta", (data) => {
      if (!data || data.runId !== testRunId) {
        return;
      }
      if (typeof data.full === "string") {
        setTestStreamOutput(data.full);
      } else if (typeof data.delta === "string") {
        setTestStreamOutput((prev) => `${prev}${data.delta}`);
      }
    });
    return () => {
      dispose();
    };
  }, [testRunId]);

  useEffect(() => {
    setTestRequestPreview(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    setTestMessage(null);
    setTestVarsError(null);
    setTestRunId("");
    setDeleteConfirmId(null);
  }, [selectedTemplateId, templateCategory]);

  const parseTestVars = () => {
    const raw = testVarsDraft.trim();
    if (!raw) {
      setTestVarsError(null);
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      setTestVarsError(null);
      return parsed;
    } catch (err) {
      setTestVarsError(
        `变量 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  };

  const handleDryRun = async () => {
    if (!selectedTemplateId) {
      return;
    }
    const vars = parseTestVars();
    if (vars === null) {
      return;
    }
    setTestRunning(true);
    setTestMessage(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    try {
      const resp = await request("it/testTemplateDryRun", {
        templateId: selectedTemplateId,
        inputText: testInput,
        variables: vars,
      });
      if (resp?.status === "success") {
        setTestRequestPreview(resp.content?.request ?? resp.content ?? null);
        setTestMissingVars(resp.content?.missing ?? []);
        if (resp.content?.missing?.length) {
          setTestMessage(`缺失变量：${resp.content.missing.join(", ")}`);
        }
      } else {
        setTestMessage(resp?.error || "Dry-run 失败，请检查模板或变量。");
      }
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
    setTestRunning(false);
  };

  const handleLiveTest = async () => {
    if (!selectedTemplateId) {
      return;
    }
    const vars = parseTestVars();
    if (vars === null) {
      return;
    }
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setTestRunId(runId);
    setTestRunning(true);
    setTestMessage(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    try {
      const resp = await request("it/testTemplateLive", {
        templateId: selectedTemplateId,
        inputText: testInput,
        variables: vars,
        runId,
      });
      if (resp?.status === "success") {
        const content = resp.content ?? null;
        setTestResponsePreview(content?.result ?? content);
      } else {
        setTestMessage(resp?.error || "Live 测试失败，请检查模板或网络。");
      }
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
    setTestRunning(false);
  };

  return (
    <div className="it-settings__section it-settings__section--full">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">API 模板管理</div>
          <div className="it-settings__desc">模板化接入，支持多厂商 API 与多任务绑定</div>
        </div>
        <div className="it-settings__actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked}
            onClick={handleCreateTemplate}
          >
            新建模板
          </button>
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !selectedTemplate}
            onClick={handleDuplicateTemplate}
          >
            复制模板
          </button>
        </div>
      </div>
      <div className="it-template__tabs">
        {TEMPLATE_CATEGORY_TABS.map((item) => (
          <button
            key={item.key}
            className={`it-chip ${templateCategory === item.key ? "active" : ""} ${
              item.enabled ? "" : "disabled"
            }`}
            disabled={!item.enabled}
            onClick={() => setTemplateCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="it-template">
        <div className="it-template__list">
          <div className="it-template__list-header">
            <div className="it-template__list-title">模板列表</div>
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked}
              onClick={handleCreateTemplate}
            >
              新建
            </button>
          </div>
          <div className="it-template__list-body">
            {templatesByCategory.length ? (
              templatesByCategory.map((item) => {
                const isSelected = selectedTemplateId === item.id;
                const isBound = boundIds.has(item.id);
                return (
                  <div key={item.id} className="it-template__list-row">
                    <button
                      className={`it-template__list-item ${isSelected ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedTemplateId(item.id)}
                      aria-pressed={isSelected}
                    >
                      <div className="it-template__list-name">{item.name || item.id}</div>
                      <div className="it-template__list-meta">{item.id}</div>
                    </button>
                    <div className="it-template__list-actions">
                      {isSelected && (
                        <span className="it-template__list-tag">已选中</span>
                      )}
                      {isBound && (
                        <span className="it-template__list-tag it-template__list-tag--bound">
                          已绑定
                        </span>
                      )}
                      {deleteConfirmId === item.id ? (
                        <>
                          <button
                            className="it-button it-button--danger it-button--compact it-template__list-delete"
                            type="button"
                            disabled={uiLocked || isBound}
                            onClick={() => {
                              setDeleteConfirmId(null);
                              handleDeleteTemplate(item.id);
                            }}
                          >
                            确认删除
                          </button>
                          <button
                            className="it-button it-button--secondary it-button--compact"
                            type="button"
                            disabled={uiLocked}
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          className="it-button it-button--secondary it-button--compact it-template__list-delete"
                          type="button"
                          disabled={uiLocked || isBound}
                          title={isBound ? "已绑定，无法删除" : "删除模板"}
                          onClick={() => setDeleteConfirmId(item.id)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="it-placeholder">暂无模板，请新建。</div>
            )}
          </div>
        </div>

        <div className="it-template__editor">
          {templateDraft ? (
            (() => {
              const responseMode = templateDraft.response?.mode || "json";
              const doneSignalsText = (templateDraft.streaming?.doneSignals || []).join(", ");
              return (
                <>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 70 }} className="it-label">
                      模板 ID
                      <InfoTip text="唯一标识，建议小写加下划线，用于模板引用与绑定。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.id}
                      onChange={(event) =>
                        setTemplateDraft((prev) =>
                          prev ? { ...prev, id: event.target.value } : prev,
                        )
                      }
                    />
                    <div style={{ minWidth: 60 }} className="it-label">
                      名称
                      <InfoTip text="展示名称，可中文；不影响实际调用。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.name || ""}
                      onChange={(event) =>
                        setTemplateDraft((prev) =>
                          prev ? { ...prev, name: event.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 70 }} className="it-label">
                      分类
                      <InfoTip text="选择模板用途：LLM / ASR / Embedding。" />
                    </div>
                    <select
                      className="it-select"
                      value={templateDraft.category}
                      onChange={(event) => {
                        const next = event.target.value as ItTemplateCategory;
                        setTemplateDraft((prev) => (prev ? { ...prev, category: next } : prev));
                        setTemplateCategory(next);
                      }}
                    >
                      {TEMPLATE_CATEGORY_TABS.map((tab) => (
                        <option key={tab.key} value={tab.key} disabled={!tab.enabled}>
                          {tab.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ minWidth: 80 }} className="it-label">
                      解析模式
                      <InfoTip text="与响应格式一致：JSON=一次性返回，SSE=流式返回。" />
                    </div>
                    <select
                      className="it-select"
                      value={responseMode}
                      onChange={(event) => {
                        const next = event.target.value;
                        updateTemplateResponse({ mode: next as any });
                        if (next === "sse") {
                          updateTemplateStreaming({
                            eventDelimiter: templateDraft.streaming?.eventDelimiter || "\n\n",
                            dataPrefix: templateDraft.streaming?.dataPrefix || "data:",
                            deltaPath: templateDraft.streaming?.deltaPath || "",
                            doneSignals:
                              templateDraft.streaming?.doneSignals &&
                              templateDraft.streaming.doneSignals.length
                                ? templateDraft.streaming.doneSignals
                                : ["[DONE]"],
                          });
                          updateTemplateRequest({ stream: true });
                        }
                      }}
                    >
                      {TEMPLATE_RESPONSE_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ minWidth: 70 }} className="it-label">
                      Method
                      <InfoTip text="HTTP 方法，绝大多数接口使用 POST。" />
                    </div>
                    <select
                      className="it-select"
                      value={templateDraft.request?.method || "POST"}
                      onChange={(event) => updateTemplateRequest({ method: event.target.value })}
                    >
                      {TEMPLATE_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 70 }} className="it-label">
                      URL
                      <InfoTip text="完整请求地址或相对路径（视运行环境而定）。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.request?.url || ""}
                      onChange={(event) => updateTemplateRequest({ url: event.target.value })}
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 70 }} className="it-label">
                      Stream
                      <InfoTip text="是否以流式读取响应（接口支持时才开启）。" />
                    </div>
                    <label className="it-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(templateDraft.request?.stream)}
                        onChange={(event) =>
                          updateTemplateRequest({ stream: event.target.checked })
                        }
                      />
                      <span>请求 stream</span>
                    </label>
                  </div>
                  <div className="it-template__json-grid">
                    <div className="it-template__json-block">
                      <div className="it-settings__title it-label">
                        Headers (JSON)
                        <InfoTip text="请求头，一般包含 Authorization 与 Content-Type。" />
                      </div>
                      <textarea
                        className="it-textarea it-template__textarea"
                        value={templateJsonDraft.headers}
                        onChange={(event) => {
                          setTemplateJsonDraft((prev) => ({
                            ...prev,
                            headers: event.target.value,
                          }));
                          setTemplateJsonErrors((prev) => ({ ...prev, headers: undefined }));
                        }}
                      />
                      {templateJsonErrors.headers && (
                        <div className="it-settings__hint it-settings__hint--error">
                          {templateJsonErrors.headers}
                        </div>
                      )}
                    </div>
                    <div className="it-template__json-block">
                      <div className="it-settings__title it-label">
                        Query (JSON)
                        <InfoTip text="URL 查询参数，未使用可留空 {}。" />
                      </div>
                      <textarea
                        className="it-textarea it-template__textarea"
                        value={templateJsonDraft.query}
                        onChange={(event) => {
                          setTemplateJsonDraft((prev) => ({
                            ...prev,
                            query: event.target.value,
                          }));
                          setTemplateJsonErrors((prev) => ({ ...prev, query: undefined }));
                        }}
                      />
                      {templateJsonErrors.query && (
                        <div className="it-settings__hint it-settings__hint--error">
                          {templateJsonErrors.query}
                        </div>
                      )}
                    </div>
                    <div className="it-template__json-block">
                      <div className="it-settings__title it-label">
                        Body (JSON)
                        <InfoTip text="请求体 JSON，可引用变量占位符，例如 {{model}}、{{input}}。" />
                      </div>
                      <textarea
                        className="it-textarea it-template__textarea"
                        value={templateJsonDraft.body}
                        onChange={(event) => {
                          setTemplateJsonDraft((prev) => ({
                            ...prev,
                            body: event.target.value,
                          }));
                          setTemplateJsonErrors((prev) => ({ ...prev, body: undefined }));
                        }}
                      />
                      {templateJsonErrors.body && (
                        <div className="it-settings__hint it-settings__hint--error">
                          {templateJsonErrors.body}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 90 }} className="it-label">
                      textPath
                      <InfoTip text="纯文本输出路径（JSON 模式常用）。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.textPath || ""}
                      onChange={(event) => updateTemplateResponse({ textPath: event.target.value })}
                    />
                    <div style={{ minWidth: 90 }} className="it-label">
                      jsonPath
                      <InfoTip text="结构化输出路径（JSON 模式常用）。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.jsonPath || ""}
                      onChange={(event) => updateTemplateResponse({ jsonPath: event.target.value })}
                    />
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 90 }} className="it-label">
                      errorPath
                      <InfoTip text="错误信息所在路径，用于提示接口错误。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.errorPath || ""}
                      onChange={(event) => updateTemplateResponse({ errorPath: event.target.value })}
                    />
                    <div style={{ minWidth: 90 }} className="it-label">
                      statusPath
                      <InfoTip text="状态码或状态字段路径（可选）。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.statusPath || ""}
                      onChange={(event) =>
                        updateTemplateResponse({ statusPath: event.target.value })
                      }
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 90 }} className="it-label">
                      doneSignal
                      <InfoTip text="JSON 模式下的结束标记（可选）。" />
                    </div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.doneSignal || ""}
                      onChange={(event) => updateTemplateResponse({ doneSignal: event.target.value })}
                    />
                  </div>
                      {responseMode === "sse" && (
                    <div className="it-template__stream-grid">
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }} className="it-label">
                          eventDelimiter
                          <InfoTip text="事件分隔符，常见为 \\n\\n。" />
                        </div>
                        <input
                          className="it-input"
                          value={templateDraft.streaming?.eventDelimiter || ""}
                          onChange={(event) =>
                            updateTemplateStreaming({
                              eventDelimiter: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }} className="it-label">
                          dataPrefix
                          <InfoTip text="数据前缀，常见为 data:。" />
                        </div>
                        <input
                          className="it-input"
                          value={templateDraft.streaming?.dataPrefix || ""}
                          onChange={(event) =>
                            updateTemplateStreaming({
                              dataPrefix: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }} className="it-label">
                          deltaPath
                          <InfoTip text="增量文本字段路径，用于拼接输出。" />
                        </div>
                        <input
                          className="it-input"
                          value={templateDraft.streaming?.deltaPath || ""}
                          onChange={(event) =>
                            updateTemplateStreaming({
                              deltaPath: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }} className="it-label">
                          doneSignals
                          <InfoTip text="流结束标记数组，例如 [DONE]。" />
                        </div>
                        <input
                          className="it-input"
                          value={doneSignalsText}
                          onChange={(event) =>
                            updateTemplateStreaming({
                              doneSignals: event.target.value
                                .split(/[,|\n]/)
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }} className="it-label">
                          heartbeatPattern
                          <InfoTip text="心跳包匹配模式（可选）。" />
                        </div>
                        <input
                          className="it-input"
                          value={templateDraft.streaming?.heartbeatPattern || ""}
                          onChange={(event) =>
                            updateTemplateStreaming({
                              heartbeatPattern: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                  <div className="it-settings__actions">
                    <button
                      className="it-button it-button--primary it-button--compact"
                      disabled={uiLocked || savingTemplate}
                      onClick={handleSaveTemplate}
                    >
                      {savingTemplate ? "保存中..." : "保存模板"}
                    </button>
                    {isCreatingTemplate && (
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || savingTemplate}
                        onClick={handleCancelTemplateDraft}
                      >
                        取消
                      </button>
                    )}
                  </div>
                  {templateSaveMessage && (
                    <div className="it-settings__hint">{templateSaveMessage}</div>
                  )}
                </>
              );
            })()
          ) : (
            <div className="it-placeholder">选择或新建模板后编辑。</div>
          )}
        </div>

        <div className="it-template__sidebar">
          <div className="it-template__panel">
            <div className="it-template__panel-title it-label">
              可引用变量
              <InfoTip text="模板中引用到才会发送；未引用会标记出来。" />
            </div>
            <div className="it-template__param-list">
              {paramCatalogList.length ? (
                paramCatalogList.map((name) => {
                  let status = "unused";
                  if (templateUsageSets.used.has(name)) {
                    status = "used";
                  } else if (templateUsageSets.empty.has(name)) {
                    status = "empty";
                  } else if (templateUsageSets.unknown.has(name)) {
                    status = "unknown";
                  } else if (templateUsageSets.unused.has(name)) {
                    status = "unused";
                  }
                  return (
                    <div key={name} className={`it-template__param-item ${status}`}>
                      <span>{`{{${name}}}`}</span>
                      <span className="it-template__param-status">
                        {status === "used"
                          ? "已引用"
                          : status === "empty"
                            ? "空值"
                            : status === "unknown"
                              ? "未定义"
                              : "未引用"}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="it-placeholder">暂无变量清单</div>
              )}
            </div>
            {templateUsageSets.unknown.size > 0 && (
              <div className="it-template__param-extra">
                未定义变量：{Array.from(templateUsageSets.unknown).join(", ")}
              </div>
            )}
            {templateUsageSets.empty.size > 0 && (
              <div className="it-template__param-extra">
                空值变量：{Array.from(templateUsageSets.empty).join(", ")}
              </div>
            )}
          </div>

          <div className="it-template__panel">
            <div className="it-template__panel-title it-label">
              密钥库
              <InfoTip text="存放 API Key 等敏感值，模板里用 {{apiKey}} 引用。" />
            </div>
            <div className="it-template__secret-list">
              {templateSecrets.length ? (
                templateSecrets.map((name) => (
                  <div key={name} className="it-template__secret-item">
                    <span>{name}</span>
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked || savingSecret}
                      onClick={() => handleDeleteSecret(name)}
                    >
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <div className="it-settings__hint">暂无密钥</div>
              )}
            </div>
            <div className="it-input-row it-input-row--nowrap">
              <input
                className="it-input"
                placeholder="名称"
                value={secretDraft.name}
                onChange={(event) =>
                  setSecretDraft((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <input
                className="it-input"
                placeholder="密钥"
                type="password"
                value={secretDraft.value}
                onChange={(event) =>
                  setSecretDraft((prev) => ({ ...prev, value: event.target.value }))
                }
              />
              <button
                className="it-button it-button--secondary it-button--compact"
                disabled={uiLocked || savingSecret}
                onClick={handleSaveSecret}
              >
                {savingSecret ? "保存中..." : "保存"}
              </button>
            </div>
            {secretMessage && <div className="it-settings__hint">{secretMessage}</div>}
          </div>

          <div className="it-template__panel">
            <div className="it-template__panel-title it-label">
              reasoning.effort 选项
              <InfoTip text="可选的思考强度列表，供模板/配置下拉选择。" />
            </div>
            <div className="it-template__chips">
              {templateParamOptions.length ? (
                templateParamOptions.map((item) => (
                  <span key={item} className="it-chip it-chip--outline">
                    {item}
                  </span>
                ))
              ) : (
                <span className="it-settings__hint">暂无选项</span>
              )}
            </div>
            <div className="it-input-row it-input-row--nowrap">
              <input
                className="it-input"
                placeholder="新增选项"
                value={templateParamInput}
                onChange={(event) => setTemplateParamInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddParamOption();
                  }
                }}
              />
              <button
                className="it-button it-button--secondary it-button--compact"
                disabled={uiLocked}
                onClick={handleAddParamOption}
              >
                添加
              </button>
              <button
                className="it-button it-button--secondary it-button--compact"
                disabled={uiLocked || savingParamOptions}
                onClick={handleSaveParamOptions}
              >
                {savingParamOptions ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="it-template__test">
        <div className="it-template__test-header">
          <div className="it-settings__title">模板测试</div>
          <div className="it-settings__desc">
            Dry-run 仅渲染请求（不发送）；Live 会真实调用并显示响应。
          </div>
        </div>
        <div className="it-template__test-grid">
          <div className="it-template__json-block">
            <div className="it-settings__title it-label">
              测试输入
              <InfoTip text="默认作为 input / messages / embeddingInput 使用，可在变量 JSON 中覆盖。" />
            </div>
            <textarea
              className="it-textarea it-template__textarea"
              value={testInput}
              onChange={(event) => setTestInput(event.target.value)}
            />
          </div>
          <div className="it-template__json-block">
            <div className="it-settings__title it-label">
              变量 (JSON)
              <InfoTip text={'可选，传入模板变量；例如 { "model": "gpt-4" }。'} />
            </div>
            <textarea
              className="it-textarea it-template__textarea"
              value={testVarsDraft}
              onChange={(event) => setTestVarsDraft(event.target.value)}
            />
            {testVarsError && (
              <div className="it-settings__hint it-settings__hint--error">
                {testVarsError}
              </div>
            )}
          </div>
        </div>
        <div className="it-template__test-actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !canTest || testRunning}
            onClick={handleDryRun}
          >
            Dry-run
          </button>
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !canTest || testRunning}
            onClick={handleLiveTest}
          >
            Live
          </button>
          {selectedTemplateName && (
            <span className="it-settings__hint">当前模板：{selectedTemplateName}</span>
          )}
        </div>
        {testMessage && <div className="it-settings__hint">{testMessage}</div>}
        {testMissingVars.length > 0 && (
          <div className="it-settings__hint it-settings__hint--error">
            缺失变量：{testMissingVars.join(", ")}
          </div>
        )}
        {requestPreviewText && (
          <div>
            <div className="it-settings__title">请求预览</div>
            <pre className="it-settings__raw">{requestPreviewText}</pre>
          </div>
        )}
        {testStreamOutput && (
          <div>
            <div className="it-settings__title">实时输出</div>
            <pre className="it-settings__raw">{testStreamOutput}</pre>
          </div>
        )}
        {responsePreviewText && (
          <div>
            <div className="it-settings__title">响应预览</div>
            <pre className="it-settings__raw">{responsePreviewText}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
