import React from "react";
import type { SettingsInputProps } from "./settingsTypes";

export const SettingsInputPanel: React.FC<SettingsInputProps> = (props) => {
  const { uiLocked, nativeInputs, selectedInput, setSelectedInput, handleRefreshInputs } =
    props;

  return (
    <div className="it-settings__section">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">输入设备</div>
          <div className="it-settings__desc">选择录音采集的麦克风来源</div>
        </div>
        <div className="it-settings__actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked}
            onClick={handleRefreshInputs}
          >
            刷新列表
          </button>
        </div>
      </div>
      <div className="it-input-row">
        <select
          className="it-select"
          value={selectedInput}
          onChange={(event) => setSelectedInput(event.target.value)}
          disabled={uiLocked}
        >
          <option value="">系统默认</option>
          {nativeInputs.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="it-settings__hint">
        未选择时使用系统默认输入设备；若需要手动指定 ffmpeg 输入，可在环境变量 IT_FFMPEG_INPUT 中填
        audio=设备名。
      </div>
    </div>
  );
};
