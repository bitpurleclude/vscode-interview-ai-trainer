import React from "react";
import { InfoTip } from "../../common/InfoTip";

type TemplateTestPanelProps = {
  uiLocked: boolean;
  canTest: boolean;
  testInput: string;
  setTestInput: React.Dispatch<React.SetStateAction<string>>;
  testVarsDraft: string;
  setTestVarsDraft: React.Dispatch<React.SetStateAction<string>>;
  testVarsError: string | null;
  testRunning: boolean;
  handleDryRun: () => void;
  handleLiveTest: () => void;
  selectedTemplateName: string;
  testMessage: string | null;
  testMissingVars: string[];
  testTokenInfo: unknown | null;
  requestPreviewText: string;
  testStreamOutput: string;
  responsePreviewText: string;
};

export const TemplateTestPanel: React.FC<TemplateTestPanelProps> = ({
  uiLocked,
  canTest,
  testInput,
  setTestInput,
  testVarsDraft,
  setTestVarsDraft,
  testVarsError,
  testRunning,
  handleDryRun,
  handleLiveTest,
  selectedTemplateName,
  testMessage,
  testMissingVars,
  testTokenInfo,
  requestPreviewText,
  testStreamOutput,
  responsePreviewText,
}) => {
  return (
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
      {testTokenInfo && (
        <div>
          <div className="it-settings__title">Token 解析</div>
          <pre className="it-settings__raw">
            {JSON.stringify(testTokenInfo, null, 2)}
          </pre>
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
  );
};
