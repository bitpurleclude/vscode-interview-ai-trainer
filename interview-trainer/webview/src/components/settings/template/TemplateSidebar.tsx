import React from "react";
import type { ItTokenStoreSnapshot } from "../../../types";
import { InfoTip } from "../../common/InfoTip";
import type { SecretDraft, TemplateUsageSets } from "../settingsTypes";

type TemplateSidebarProps = {
  uiLocked: boolean;
  visibleParamList: string[];
  templateUsageSets: TemplateUsageSets;
  showAllVars: boolean;
  setShowAllVars: React.Dispatch<React.SetStateAction<boolean>>;
  templateSecrets: string[];
  templateSecretHints: Record<string, string>;
  secretDraft: SecretDraft;
  setSecretDraft: React.Dispatch<React.SetStateAction<SecretDraft>>;
  savingSecret: boolean;
  secretMessage: string | null;
  handleSaveSecret: () => void;
  handleDeleteSecret: (name: string) => void;
  secretDeleteConfirm: string | null;
  setSecretDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;
  templateParamOptions: string[];
  templateParamInput: string;
  setTemplateParamInput: React.Dispatch<React.SetStateAction<string>>;
  savingParamOptions: boolean;
  handleAddParamOption: () => void;
  handleSaveParamOptions: () => void;
  tokenStore: ItTokenStoreSnapshot | undefined;
  handleRefreshToken: (name: string) => void;
  handleRefreshAllTokens: () => void;
  handleToggleTokenAutoRefresh: (enabled: boolean) => void;
};

export const TemplateSidebar: React.FC<TemplateSidebarProps> = ({
  uiLocked,
  visibleParamList,
  templateUsageSets,
  showAllVars,
  setShowAllVars,
  templateSecrets,
  templateSecretHints,
  secretDraft,
  setSecretDraft,
  savingSecret,
  secretMessage,
  handleSaveSecret,
  handleDeleteSecret,
  secretDeleteConfirm,
  setSecretDeleteConfirm,
  templateParamOptions,
  templateParamInput,
  setTemplateParamInput,
  savingParamOptions,
  handleAddParamOption,
  handleSaveParamOptions,
  tokenStore,
  handleRefreshToken,
  handleRefreshAllTokens,
  handleToggleTokenAutoRefresh,
}) => {
  const tokenList = tokenStore?.tokens ?? [];
  const tokenAutoRefresh = tokenStore?.autoRefresh !== false;
  const [copyTip, setCopyTip] = React.useState<string | null>(null);

  const copyReference = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyTip(`已复制：${text}`);
      setTimeout(() => {
        setCopyTip((current) => (current === `已复制：${text}` ? null : current));
      }, 1200);
    } catch {
      setCopyTip("复制失败，请手动复制。");
    }
  };
  const formatTokenTime = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  return (
    <div className="it-template__sidebar">
      <div className="it-template__panel">
        <div className="it-template__panel-title it-label">
          可引用变量
          <InfoTip text="模板中引用到才会发送；未引用会标记出来。" />
        </div>
        <div className="it-input-row it-input-row--nowrap">
          <label className="it-toggle">
            <input
              type="checkbox"
              checked={showAllVars}
              onChange={(event) => setShowAllVars(event.target.checked)}
            />
            <span>显示全部</span>
          </label>
        </div>
        <div className="it-template__param-list">
          {visibleParamList.length ? (
            visibleParamList.map((name) => {
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
                <div className="it-template__secret-main">
                  <span className="it-template__token-name">{name}</span>
                  <div className="it-template__token-meta">{`{{secrets.${name}}}`}</div>
                  {templateSecretHints[name] ? (
                    <div className="it-template__token-meta">{templateSecretHints[name]}</div>
                  ) : null}
                </div>
                <div className="it-template__secret-actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || savingSecret}
                    onClick={() => copyReference(`{{secrets.${name}}}`)}
                  >
                    复制引用
                  </button>
                  {secretDeleteConfirm === name ? (
                    <>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || savingSecret}
                        onClick={() => handleDeleteSecret(name)}
                      >
                        确认删除
                      </button>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || savingSecret}
                        onClick={() => setSecretDeleteConfirm(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked || savingSecret}
                      onClick={() => setSecretDeleteConfirm(name)}
                    >
                      删除
                    </button>
                  )}
                </div>
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
        {copyTip && <div className="it-settings__hint">{copyTip}</div>}
      </div>

      <div className="it-template__panel">
        <div className="it-template__panel-title it-label">
          Token 库
          <InfoTip text="由 Token 模板生成并自动续期，可通过 {{tokens.xxx}} 引用。" />
        </div>
        <div className="it-template__token-list">
          {tokenList.length ? (
            tokenList.map((token) => {
              const statusLabel =
                token.status === "ok"
                  ? "可用"
                  : token.status === "refreshing"
                    ? "刷新中"
                    : token.status === "error"
                      ? "失败"
                      : "未获取";
              const expiresText = token.expiresAt
                ? `有效至 ${formatTokenTime(token.expiresAt)}`
                : "无到期信息";
              return (
                <div key={token.name} className="it-template__token-item">
                  <span className={`it-token-dot ${token.status}`} />
                  <div className="it-template__token-main">
                    <div className="it-template__token-name">{token.name}</div>
                    <div className="it-template__token-meta">
                      {statusLabel} · {expiresText}
                    </div>
                    <div className="it-template__token-meta">{`{{tokens.${token.name}}}`}</div>
                    {token.lastError && (
                      <div className="it-template__token-error">{token.lastError}</div>
                    )}
                  </div>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => copyReference(`{{tokens.${token.name}}}`)}
                  >
                    复制引用
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleRefreshToken(token.name)}
                  >
                    刷新
                  </button>
                </div>
              );
            })
          ) : (
            <div className="it-settings__hint">暂无 Token</div>
          )}
        </div>
        <div className="it-input-row it-input-row--nowrap">
          <label className="it-toggle">
            <input
              type="checkbox"
              checked={tokenAutoRefresh}
              disabled={uiLocked}
              onChange={(event) => handleToggleTokenAutoRefresh(event.target.checked)}
            />
            <span>自动续期</span>
          </label>
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !tokenList.length}
            onClick={handleRefreshAllTokens}
          >
            刷新全部
          </button>
        </div>
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
  );
};
