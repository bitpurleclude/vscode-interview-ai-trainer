import React from "react";
import type { SettingsPromptProps } from "./settingsTypes";

export const SettingsPromptPanel: React.FC<SettingsPromptProps> = (props) => {
  const {
    uiLocked,
    customPrompt,
    setCustomPrompt,
    demoPrompt,
    setDemoPrompt,
    answerMode,
    setAnswerMode,
    perQuestionSystemPrompts,
    setPerQuestionSystemPrompts,
    perQuestionDemoPrompts,
    setPerQuestionDemoPrompts,
    promptSaveMessage,
    promptSaveScope,
    handleSavePrompts,
  } = props;

  return (
    <>
      <div className="it-settings__section">
        <div className="it-settings__header">
          <div>
            <div className="it-settings__title">评分提示词</div>
            <div className="it-settings__desc">严格高标准，不输出安慰语</div>
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked}
              onClick={() => handleSavePrompts("evaluation")}
            >
              保存提示词
            </button>
          </div>
        </div>
        <textarea
          className="it-textarea it-textarea--prompt"
          value={customPrompt}
          onChange={(event) => setCustomPrompt(event.target.value)}
        />
        {promptSaveScope === "evaluation" && promptSaveMessage && (
          <div className="it-settings__hint">{promptSaveMessage}</div>
        )}
      </div>

      <div className="it-settings__section">
        <div className="it-settings__header">
          <div>
            <div className="it-settings__title">示范答案提示词</div>
            <div className="it-settings__desc">控制总时长≤10分钟，公务员思维、结构清晰</div>
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked}
              onClick={() => handleSavePrompts("demo")}
            >
              保存提示词
            </button>
          </div>
        </div>
        <textarea
          className="it-textarea it-textarea--prompt"
          value={demoPrompt}
          onChange={(event) => setDemoPrompt(event.target.value)}
        />
        <div className="it-input-row">
          <div style={{ minWidth: 120 }}>示范生成方式</div>
          <select
            className="it-select"
            value={answerMode}
            onChange={(event) =>
              setAnswerMode(event.target.value === "single" ? "single" : "two-step")
            }
          >
            <option value="two-step">两步法：先提纲后整篇</option>
            <option value="single">单次：提纲+整篇一次输出</option>
          </select>
        </div>
        <div className="it-settings__hint">两步法会额外调用一次 LLM，成本与耗时更高，但更稳定。</div>
        {promptSaveScope === "demo" && promptSaveMessage && (
          <div className="it-settings__hint">{promptSaveMessage}</div>
        )}
      </div>

      <div className="it-settings__section">
        <div className="it-settings__header">
          <div>
            <div className="it-settings__title">每题独立提示词（最多3题）</div>
            <div className="it-settings__desc">持久化保存，逐题覆盖总体提示词</div>
          </div>
          <div className="it-settings__actions">
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked}
              onClick={() => handleSavePrompts("per-question")}
            >
              保存提示词
            </button>
          </div>
        </div>
        <div className="it-question-prompts">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="it-question-prompts__item">
              <div className="it-question-prompts__title">第 {idx + 1} 题</div>
              <div className="it-question-prompts__pair">
                <textarea
                  className="it-textarea it-textarea--prompt"
                  placeholder="本题评分提示词（可选）"
                  value={perQuestionSystemPrompts[idx] || ""}
                  onChange={(event) => {
                    const next = [...perQuestionSystemPrompts];
                    next[idx] = event.target.value;
                    setPerQuestionSystemPrompts(next);
                  }}
                />
                <textarea
                  className="it-textarea it-textarea--prompt"
                  placeholder="本题示范提示词（可选）"
                  value={perQuestionDemoPrompts[idx] || ""}
                  onChange={(event) => {
                    const next = [...perQuestionDemoPrompts];
                    next[idx] = event.target.value;
                    setPerQuestionDemoPrompts(next);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {promptSaveScope === "per-question" && promptSaveMessage && (
          <div className="it-settings__hint">{promptSaveMessage}</div>
        )}
      </div>
    </>
  );
};
