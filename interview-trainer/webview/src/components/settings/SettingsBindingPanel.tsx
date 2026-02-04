import React from "react";
import type { SettingsBindingProps } from "./settingsTypes";

export const SettingsBindingPanel: React.FC<SettingsBindingProps> = (props) => {
  const {
    uiLocked,
    templateBindings,
    setTemplateBindings,
    llmTemplates,
    asrTemplates,
    embeddingTemplates,
    savingBindings,
    handleSaveBindings,
    apiForm,
    handleApiFieldChange,
    llmParamsMessage,
    savingLlmParams,
    handleSaveLlmParams,
    asrParamsMessage,
    savingAsrParams,
    handleSaveAsrParams,
  } = props;

  return (
    <div className="it-settings__section it-settings__section--full">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">绑定与本地策略</div>
          <div className="it-settings__desc">
            仅模板引用才发送参数；未引用参数不发送
          </div>
        </div>
      </div>
      <div className="it-template__cards">
        <div className="it-template__card">
          <div className="it-settings__title">任务绑定</div>
          <div className="it-settings__desc">解析/分段/评价仅可选 LLM 模板</div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>题目解析</div>
            <select
              className="it-select"
              value={templateBindings.llm?.questionParse || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  llm: {
                    ...(prev.llm || {}),
                    questionParse: event.target.value,
                  },
                }))
              }
            >
              <option value="">未绑定</option>
              {llmTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>多题分段</div>
            <select
              className="it-select"
              value={templateBindings.llm?.segment || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  llm: {
                    ...(prev.llm || {}),
                    segment: event.target.value,
                  },
                }))
              }
            >
              <option value="">未绑定</option>
              {llmTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>面试评价</div>
            <select
              className="it-select"
              value={templateBindings.llm?.evaluation || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  llm: {
                    ...(prev.llm || {}),
                    evaluation: event.target.value,
                  },
                }))
              }
            >
              <option value="">未绑定</option>
              {llmTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>ASR 转写</div>
            <select
              className="it-select"
              value={templateBindings.asr?.transcription || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  asr: {
                    ...(prev.asr || {}),
                    transcription: event.target.value,
                  },
                }))
              }
            >
              <option value="">未绑定</option>
              {asrTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>Embedding</div>
            <select
              className="it-select"
              value={templateBindings.embedding?.retrieval || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  embedding: {
                    ...(prev.embedding || {}),
                    retrieval: event.target.value,
                  },
                }))
              }
            >
              <option value="">未绑定</option>
              {embeddingTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked || savingBindings}
              onClick={handleSaveBindings}
            >
              {savingBindings ? "保存中..." : "保存绑定"}
            </button>
          </div>
        </div>

        <div className="it-template__card">
          <div className="it-settings__title">LLM 模板参数</div>
          <div className="it-settings__desc">仅模板引用才发送</div>
          <div className="it-input-row">
            <div style={{ minWidth: 90 }}>模型</div>
            <input
              className="it-input"
              value={apiForm.llm.model}
              onChange={(event) => handleApiFieldChange("llm", "model", event.target.value)}
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 90 }}>reasoning</div>
            <input
              className="it-input"
              value={apiForm.llm.reasoningEffort}
              onChange={(event) =>
                handleApiFieldChange("llm", "reasoningEffort", event.target.value)
              }
            />
            <div style={{ minWidth: 90 }}>stream</div>
            <label className="it-toggle">
              <input
                type="checkbox"
                checked={Boolean(apiForm.llm.stream)}
                onChange={(event) =>
                  handleApiFieldChange("llm", "stream", event.target.checked)
                }
              />
              <span>启用</span>
            </label>
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 90 }}>web_search</div>
            <label className="it-toggle">
              <input
                type="checkbox"
                checked={Boolean(apiForm.llm.webSearch)}
                onChange={(event) =>
                  handleApiFieldChange("llm", "webSearch", event.target.checked)
                }
              />
              <span>启用</span>
            </label>
            <div style={{ minWidth: 90 }}>reuse_prefix</div>
            <label className="it-toggle">
              <input
                type="checkbox"
                checked={Boolean(apiForm.llm.reusePrefix)}
                onChange={(event) =>
                  handleApiFieldChange("llm", "reusePrefix", event.target.checked)
                }
              />
              <span>启用</span>
            </label>
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 90 }}>超时(s)</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.llm.timeoutSec}
              onChange={(event) =>
                handleApiFieldChange("llm", "timeoutSec", Number(event.target.value))
              }
            />
            <div style={{ minWidth: 90 }}>重试</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.llm.maxRetries}
              onChange={(event) =>
                handleApiFieldChange("llm", "maxRetries", Number(event.target.value))
              }
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 90 }}>防重复</div>
            <label className="it-toggle">
              <input
                type="checkbox"
                checked={Boolean(apiForm.llm.antiRepeat)}
                onChange={(event) =>
                  handleApiFieldChange("llm", "antiRepeat", event.target.checked)
                }
              />
              <span>启用</span>
            </label>
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked || savingLlmParams}
              onClick={handleSaveLlmParams}
            >
              {savingLlmParams ? "保存中..." : "保存参数"}
            </button>
          </div>
          {llmParamsMessage && <div className="it-settings__hint">{llmParamsMessage}</div>}
        </div>

        <div className="it-template__card">
          <div className="it-settings__title">ASR 参数</div>
          <div className="it-settings__desc">本地策略（不发送）</div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 80 }}>语言</div>
            <input
              className="it-input"
              value={apiForm.asr.language}
              onChange={(event) => handleApiFieldChange("asr", "language", event.target.value)}
            />
            <div style={{ minWidth: 80 }}>dev_pid</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.asr.devPid}
              onChange={(event) =>
                handleApiFieldChange("asr", "devPid", Number(event.target.value))
              }
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 80 }}>分片(s)</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.asr.maxChunkSec}
              onChange={(event) =>
                handleApiFieldChange("asr", "maxChunkSec", Number(event.target.value))
              }
            />
            <div style={{ minWidth: 80 }}>并发</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.asr.maxConcurrency}
              onChange={(event) =>
                handleApiFieldChange("asr", "maxConcurrency", Number(event.target.value))
              }
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 80 }}>超时(s)</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.asr.timeoutSec}
              onChange={(event) =>
                handleApiFieldChange("asr", "timeoutSec", Number(event.target.value))
              }
            />
            <div style={{ minWidth: 80 }}>重试</div>
            <input
              className="it-input"
              type="number"
              value={apiForm.asr.maxRetries}
              onChange={(event) =>
                handleApiFieldChange("asr", "maxRetries", Number(event.target.value))
              }
            />
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked || savingAsrParams}
              onClick={handleSaveAsrParams}
            >
              {savingAsrParams ? "保存中..." : "保存参数"}
            </button>
          </div>
          {asrParamsMessage && <div className="it-settings__hint">{asrParamsMessage}</div>}
        </div>
      </div>
    </div>
  );
};
