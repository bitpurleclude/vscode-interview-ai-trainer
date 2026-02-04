import React from "react";
import type { SettingsCommonTemplateProps } from "./settingsTypes";
import type { ItTemplateCategory } from "../../types";

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

export const SettingsTemplateManager: React.FC<SettingsCommonTemplateProps> = (props) => {
  const {
    uiLocked,
    templateCategory,
    setTemplateCategory,
    templatesByCategory,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
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
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !selectedTemplate}
            onClick={handleDeleteTemplate}
          >
            删除模板
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
              templatesByCategory.map((item) => (
                <button
                  key={item.id}
                  className={`it-template__list-item ${
                    selectedTemplateId === item.id ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => setSelectedTemplateId(item.id)}
                >
                  <div className="it-template__list-name">{item.name || item.id}</div>
                  <div className="it-template__list-meta">{item.id}</div>
                </button>
              ))
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
                    <div style={{ minWidth: 70 }}>模板 ID</div>
                    <input
                      className="it-input"
                      value={templateDraft.id}
                      onChange={(event) =>
                        setTemplateDraft((prev) =>
                          prev ? { ...prev, id: event.target.value } : prev,
                        )
                      }
                    />
                    <div style={{ minWidth: 60 }}>名称</div>
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
                    <div style={{ minWidth: 70 }}>分类</div>
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
                    <div style={{ minWidth: 80 }}>解析模式</div>
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
                    <div style={{ minWidth: 70 }}>Method</div>
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
                    <div style={{ minWidth: 70 }}>URL</div>
                    <input
                      className="it-input"
                      value={templateDraft.request?.url || ""}
                      onChange={(event) => updateTemplateRequest({ url: event.target.value })}
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 70 }}>Stream</div>
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
                      <div className="it-settings__title">Headers (JSON)</div>
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
                      <div className="it-settings__title">Query (JSON)</div>
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
                      <div className="it-settings__title">Body (JSON)</div>
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
                    <div style={{ minWidth: 90 }}>textPath</div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.textPath || ""}
                      onChange={(event) => updateTemplateResponse({ textPath: event.target.value })}
                    />
                    <div style={{ minWidth: 90 }}>jsonPath</div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.jsonPath || ""}
                      onChange={(event) => updateTemplateResponse({ jsonPath: event.target.value })}
                    />
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 90 }}>errorPath</div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.errorPath || ""}
                      onChange={(event) => updateTemplateResponse({ errorPath: event.target.value })}
                    />
                    <div style={{ minWidth: 90 }}>statusPath</div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.statusPath || ""}
                      onChange={(event) =>
                        updateTemplateResponse({ statusPath: event.target.value })
                      }
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 90 }}>doneSignal</div>
                    <input
                      className="it-input"
                      value={templateDraft.response?.doneSignal || ""}
                      onChange={(event) => updateTemplateResponse({ doneSignal: event.target.value })}
                    />
                  </div>
                  {responseMode === "sse" && (
                    <div className="it-template__stream-grid">
                      <div className="it-input-row">
                        <div style={{ minWidth: 110 }}>eventDelimiter</div>
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
                        <div style={{ minWidth: 110 }}>dataPrefix</div>
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
                        <div style={{ minWidth: 110 }}>deltaPath</div>
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
                        <div style={{ minWidth: 110 }}>doneSignals</div>
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
                        <div style={{ minWidth: 110 }}>heartbeatPattern</div>
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
            <div className="it-template__panel-title">可引用变量</div>
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
            <div className="it-template__panel-title">密钥库</div>
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
            <div className="it-template__panel-title">reasoning.effort 选项</div>
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
        <button className="it-button it-button--secondary it-button--compact" disabled>
          Dry-run
        </button>
        <button className="it-button it-button--secondary it-button--compact" disabled>
          Live
        </button>
        <span className="it-settings__hint">模板测试接口待接入后启用。</span>
      </div>
    </div>
  );
};
