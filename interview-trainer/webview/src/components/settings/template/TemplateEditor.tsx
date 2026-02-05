import React from "react";
import type { ItApiTemplate, ItTemplateCategory } from "../../../types";
import { InfoTip } from "../../common/InfoTip";
import {
  TEMPLATE_CATEGORY_TABS,
  TEMPLATE_METHODS,
  TEMPLATE_RESPONSE_MODES,
} from "./templateConstants";

type TemplateEditorProps = {
  uiLocked: boolean;
  templateDraft: ItApiTemplate | null;
  setTemplateDraft: React.Dispatch<React.SetStateAction<ItApiTemplate | null>>;
  templateCategory: ItTemplateCategory;
  setTemplateCategory: (category: ItTemplateCategory) => void;
  templateJsonDraft: {
    headers: string;
    query: string;
    body: string;
  };
  setTemplateJsonDraft: React.Dispatch<
    React.SetStateAction<{
      headers: string;
      query: string;
      body: string;
    }>
  >;
  templateJsonErrors: Partial<Record<"headers" | "query" | "body", string>>;
  setTemplateJsonErrors: React.Dispatch<
    React.SetStateAction<Partial<Record<"headers" | "query" | "body", string>>>
  >;
  templateSaveMessage: string | null;
  savingTemplate: boolean;
  isCreatingTemplate: boolean;
  handleCancelTemplateDraft: () => void;
  handleSaveTemplate: () => void;
  updateTemplateRequest: (payload: Partial<ItApiTemplate["request"]>) => void;
  updateTemplateResponse: (
    payload: Partial<NonNullable<ItApiTemplate["response"]>>,
  ) => void;
  updateTemplateStreaming: (
    payload: Partial<NonNullable<ItApiTemplate["streaming"]>>,
  ) => void;
};

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  uiLocked,
  templateDraft,
  setTemplateDraft,
  templateCategory,
  setTemplateCategory,
  templateJsonDraft,
  setTemplateJsonDraft,
  templateJsonErrors,
  setTemplateJsonErrors,
  templateSaveMessage,
  savingTemplate,
  isCreatingTemplate,
  handleCancelTemplateDraft,
  handleSaveTemplate,
  updateTemplateRequest,
  updateTemplateResponse,
  updateTemplateStreaming,
}) => {
  if (!templateDraft) {
    return (
      <div className="it-template__editor">
        <div className="it-placeholder">选择或新建模板后编辑。</div>
      </div>
    );
  }

  const responseMode = templateDraft.response?.mode || "json";
  const doneSignalsText = (templateDraft.streaming?.doneSignals || []).join(", ");
  const isToken = templateDraft.category === "token";
  const tokenConfig = (templateDraft.token || {}) as NonNullable<ItApiTemplate["token"]>;
  const updateTokenDraft = (patch: Partial<NonNullable<ItApiTemplate["token"]>>) => {
    setTemplateDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const name = patch.name ?? prev.token?.name ?? "";
      return {
        ...prev,
        token: {
          ...(prev.token || {}),
          ...patch,
          name,
        },
      };
    });
  };

  return (
    <div className="it-template__editor">
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
            onChange={(event) => updateTemplateRequest({ stream: event.target.checked })}
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
          onChange={(event) => updateTemplateResponse({ statusPath: event.target.value })}
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
      {isToken && (
        <div className="it-template__token-config">
          <div className="it-settings__title it-label">
            Token 输出配置
            <InfoTip text="保存后会进入 Token 库，可在其他模板用 {{tokens.xxx}} 引用。" />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 90 }} className="it-label">
              Token 名称
              <InfoTip text="用于 {{tokens.xxx}} 的 xxx 部分，建议小写+下划线。" />
            </div>
            <input
              className="it-input"
              value={tokenConfig.name || ""}
              onChange={(event) => updateTokenDraft({ name: event.target.value })}
            />
            <div style={{ minWidth: 90 }} className="it-label">
              tokenPath
              <InfoTip text="响应 JSON 中 token 的路径，例如 access_token。" />
            </div>
            <input
              className="it-input"
              value={tokenConfig.valuePath || ""}
              onChange={(event) => updateTokenDraft({ valuePath: event.target.value })}
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 110 }} className="it-label">
              expiresInPath
              <InfoTip text="响应中的有效期秒数字段，例如 expires_in。" />
            </div>
            <input
              className="it-input"
              value={tokenConfig.expiresInPath || ""}
              onChange={(event) => updateTokenDraft({ expiresInPath: event.target.value })}
            />
            <div style={{ minWidth: 110 }} className="it-label">
              expiresAtPath
              <InfoTip text="响应中的到期时间字段（ISO 或时间戳）。" />
            </div>
            <input
              className="it-input"
              value={tokenConfig.expiresAtPath || ""}
              onChange={(event) => updateTokenDraft({ expiresAtPath: event.target.value })}
            />
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 110 }} className="it-label">
              refreshBeforeSec
              <InfoTip text="提前多久刷新（秒），例如 300。" />
            </div>
            <input
              className="it-input"
              type="number"
              value={tokenConfig.refreshBeforeSec ?? 300}
              onChange={(event) =>
                updateTokenDraft({ refreshBeforeSec: Number(event.target.value) })
              }
            />
            <div style={{ minWidth: 90 }} className="it-label">
              failureRetry
              <InfoTip text="失败重试次数（模板执行重试）。" />
            </div>
            <input
              className="it-input"
              type="number"
              value={tokenConfig.maxRetries ?? 0}
              onChange={(event) =>
                updateTokenDraft({ maxRetries: Number(event.target.value) })
              }
            />
            <div style={{ minWidth: 70 }} className="it-label">
              启用
              <InfoTip text="关闭后该 Token 不会自动刷新。" />
            </div>
            <label className="it-toggle">
              <input
                type="checkbox"
                checked={tokenConfig.enabled !== false}
                onChange={(event) => updateTokenDraft({ enabled: event.target.checked })}
              />
              <span>自动续期</span>
            </label>
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
    </div>
  );
};
