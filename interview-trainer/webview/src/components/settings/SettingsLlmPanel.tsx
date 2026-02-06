import React from "react";
import type { SettingsLlmProps } from "./settingsTypes";

export const SettingsLlmPanel: React.FC<SettingsLlmProps> = (props) => {
  const {
    uiLocked,
    llmForm,
    setLlmForm,
    savingLlm,
    llmSaveMessage,
    handleSaveLlmSettings,
  } = props;

  return (
    <div className="it-settings__section">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">LLM 设置</div>
          <div className="it-settings__desc">超时与重试配置</div>
        </div>
      </div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>超时(s)</div>
        <input
          className="it-input"
          type="number"
          min={5}
          value={llmForm.timeoutSec}
          onChange={(event) =>
            setLlmForm((prev) => ({
              ...prev,
              timeoutSec: Number(event.target.value),
            }))
          }
        />
        <div style={{ minWidth: 80 }}>重试</div>
        <input
          className="it-input"
          type="number"
          min={0}
          value={llmForm.maxRetries}
          onChange={(event) =>
            setLlmForm((prev) => ({
              ...prev,
              maxRetries: Number(event.target.value),
            }))
          }
        />
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingLlm}
          onClick={handleSaveLlmSettings}
        >
          {savingLlm ? "保存中..." : "保存设置"}
        </button>
      </div>
      {llmSaveMessage && <div className="it-settings__hint">{llmSaveMessage}</div>}
    </div>
  );
};
