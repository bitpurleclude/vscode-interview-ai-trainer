import React from "react";
import type { SettingsAsrProps } from "./settingsTypes";

export const SettingsAsrPanel: React.FC<SettingsAsrProps> = (props) => {
  const {
    uiLocked,
    asrForm,
    setAsrForm,
    savingAsr,
    asrSaveMessage,
    handleSaveAsrSettings,
  } = props;

  return (
    <div className="it-settings__section">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">ASR 设置</div>
          <div className="it-settings__desc">模板化转写参数</div>
        </div>
        <div className="it-settings__actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || savingAsr}
            onClick={handleSaveAsrSettings}
          >
            {savingAsr ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>语言</div>
        <select
          className="it-select"
          value={asrForm.language}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({ ...prev, language: event.target.value }))
          }
        >
          <option value="zh">zh</option>
          <option value="en">en</option>
          <option value="auto">auto</option>
        </select>
        <div style={{ minWidth: 80 }}>dev_pid</div>
        <input
          className="it-input"
          type="number"
          min={0}
          value={asrForm.devPid}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({ ...prev, devPid: Number(event.target.value) }))
          }
        />
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>分片上限(s)</div>
        <input
          className="it-input"
          type="number"
          min={5}
          value={asrForm.maxChunkSec}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({
              ...prev,
              maxChunkSec: Number(event.target.value),
            }))
          }
        />
        <div style={{ minWidth: 80 }}>并发</div>
        <input
          className="it-input"
          type="number"
          min={1}
          value={asrForm.maxConcurrency}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({
              ...prev,
              maxConcurrency: Number(event.target.value),
            }))
          }
        />
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>超时(s)</div>
        <input
          className="it-input"
          type="number"
          min={5}
          value={asrForm.timeoutSec}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({
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
          value={asrForm.maxRetries}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({
              ...prev,
              maxRetries: Number(event.target.value),
            }))
          }
        />
      </div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>Mock 文本</div>
        <input
          className="it-input"
          value={asrForm.mockText}
          disabled={uiLocked || savingAsr}
          onChange={(event) =>
            setAsrForm((prev) => ({ ...prev, mockText: event.target.value }))
          }
          placeholder="可选，调试用"
        />
      </div>
      {asrSaveMessage && <div className="it-settings__hint">{asrSaveMessage}</div>}
    </div>
  );
};
