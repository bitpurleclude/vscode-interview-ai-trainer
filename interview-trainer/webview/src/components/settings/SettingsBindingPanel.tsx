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
            <div style={{ minWidth: 80 }}>文件命名/标题</div>
            <select
              className="it-select"
              value={templateBindings.llm?.title || ""}
              onChange={(event) =>
                setTemplateBindings((prev) => ({
                  ...prev,
                  llm: {
                    ...(prev.llm || {}),
                    title: event.target.value,
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
      </div>
    </div>
  );
};
