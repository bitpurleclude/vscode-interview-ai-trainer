import React from "react";
import type { SettingsEnvProps } from "./settingsTypes";

export const SettingsEnvPanel: React.FC<SettingsEnvProps> = (props) => {
  const {
    uiLocked,
    config,
    streamingSettings,
    setStreamingSettings,
    savingStreamingSettings,
    streamingSaveMessage,
    handleSaveStreamingSettings,
    envDraftName,
    setEnvDraftName,
    envMessage,
    savingEnvironment,
    handleSetActiveEnvironment,
    handleCreateEnvironment,
    handleDeleteEnvironment,
    handleReloadConfig,
    traceLogEnabled,
    handleEnableTraceLogs,
    handleOpenSettings,
    handleSelectSessionsDir,
  } = props;

  return (
    <div className="it-settings__section it-settings__section--full">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">全局/环境</div>
          <div className="it-settings__desc">环境切换、保存目录与实时输出</div>
        </div>
        <div className="it-settings__actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked}
            onClick={handleReloadConfig}
          >
            重载配置
          </button>
          <button
            className="it-button it-button--secondary it-button--compact"
            onClick={handleOpenSettings}
          >
            查看模板配置
          </button>
        </div>
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 64 }}>环境</div>
        <select
          data-testid="it-settings-env-select"
          className="it-select"
          value={config?.activeEnvironment || "prod"}
          disabled={uiLocked || savingEnvironment}
          onChange={(event) => handleSetActiveEnvironment(event.target.value)}
        >
          {(config?.envList && config.envList.length ? config.envList : ["prod"]).map(
            (env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ),
          )}
        </select>
        <div style={{ minWidth: 80 }}>新环境</div>
        <input
          data-testid="it-settings-env-name-input"
          className="it-input"
          value={envDraftName}
          onChange={(event) => setEnvDraftName(event.target.value)}
          placeholder="prod / test / dev"
        />
        <button
          data-testid="it-settings-env-create-button"
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingEnvironment}
          onClick={() => handleCreateEnvironment()}
        >
          创建并切换
        </button>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingEnvironment}
          onClick={() => handleCreateEnvironment(config?.activeEnvironment || "prod")}
        >
          复制当前
        </button>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingEnvironment}
          onClick={() => handleDeleteEnvironment(config?.activeEnvironment || "prod")}
        >
          删除环境
        </button>
      </div>
      {envMessage && <div className="it-settings__hint">{envMessage}</div>}
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>保存目录</div>
        <div className="it-settings__meta" style={{ flex: 1 }}>
          {config?.sessionsDir || "sessions"}
        </div>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked}
          onClick={handleSelectSessionsDir}
        >
          选择保存目录
        </button>
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>实时输出</div>
        <label className="it-toggle">
          <input
            data-testid="it-settings-stream-enabled-checkbox"
            type="checkbox"
            checked={Boolean(streamingSettings.enabled)}
            onChange={(event) =>
              setStreamingSettings((prev) => ({
                ...prev,
                enabled: event.target.checked,
              }))
            }
          />
          <span>启用</span>
        </label>
        <div style={{ minWidth: 80 }}>自动折叠</div>
        <label className="it-toggle">
          <input
            data-testid="it-settings-stream-autocollapse-checkbox"
            type="checkbox"
            checked={Boolean(streamingSettings.autoCollapse)}
            onChange={(event) =>
              setStreamingSettings((prev) => ({
                ...prev,
                autoCollapse: event.target.checked,
              }))
            }
          />
          <span>启用</span>
        </label>
        <div style={{ minWidth: 80 }}>预览字数</div>
        <input
          data-testid="it-settings-stream-preview-input"
          className="it-input"
          type="number"
          min={50}
          value={streamingSettings.previewChars}
          onChange={(event) =>
            setStreamingSettings((prev) => ({
              ...prev,
              previewChars: Number(event.target.value),
            }))
          }
        />
        <button
          data-testid="it-settings-stream-save-button"
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingStreamingSettings}
          onClick={handleSaveStreamingSettings}
        >
          {savingStreamingSettings ? "保存中..." : "保存设置"}
        </button>
      </div>
      {streamingSaveMessage && (
        <div className="it-settings__hint" data-testid="it-settings-stream-save-message">
          {streamingSaveMessage}
        </div>
      )}
      <div className="it-settings__actions">
        <button
          data-testid="it-settings-enable-trace-logs-button"
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || traceLogEnabled}
          onClick={handleEnableTraceLogs}
        >
          {traceLogEnabled ? "日志已开启" : "开启日志输出"}
        </button>
      </div>
    </div>
  );
};
