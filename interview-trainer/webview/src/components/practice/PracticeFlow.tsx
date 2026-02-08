import React from "react";
import type { ItAudioPayload, ItNoteHit, ItStepState } from "../../types";
import { StepsList } from "./StepsList";

type StreamState = {
  text: string;
  collapsed: boolean;
  done?: boolean;
};

type PracticeFlowProps = {
  steps: ItStepState[];
  stepStreams: Record<string, StreamState>;
  evaluationStreams: Record<number, StreamState>;
  evaluationStreamQuestions: string[];
  streamingEnabled: boolean;
  previewChars: number;
  onToggleStepStream: (stepId: string) => void;
  onToggleEvaluationStream: (index: number) => void;
  overallProgress: number;
  audioPayload: ItAudioPayload | null;
  thinkingVisible: boolean;
  questionText: string;
  questionList: string;
  questionError: boolean;
  questionParsing: boolean;
  questionParsed: boolean;
  hasQuestion: boolean;
  onQuestionTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onQuestionListChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onParseQuestions: () => void;
  uiLocked: boolean;
  notesPreview?: ItNoteHit[];
  showNoteHits: boolean;
  onToggleNoteHits: () => void;
  retrievalEnabled: boolean;
};

export const PracticeFlow: React.FC<PracticeFlowProps> = (props) => {
  const {
    steps,
    stepStreams,
    evaluationStreams,
    evaluationStreamQuestions,
    streamingEnabled,
    previewChars,
    onToggleStepStream,
    onToggleEvaluationStream,
    overallProgress,
    audioPayload,
    thinkingVisible,
    questionText,
    questionList,
    questionError,
    questionParsing,
    questionParsed,
    hasQuestion,
    onQuestionTextChange,
    onQuestionListChange,
    onParseQuestions,
    uiLocked,
    notesPreview,
    showNoteHits,
    onToggleNoteHits,
    retrievalEnabled,
  } = props;

  return (
    <div className="it-flow">
      <StepsList
        steps={steps}
        stepStreams={stepStreams}
        evaluationStreams={evaluationStreams}
        evaluationStreamQuestions={evaluationStreamQuestions}
        streamingEnabled={streamingEnabled}
        previewChars={previewChars}
        onToggleStepStream={onToggleStepStream}
        onToggleEvaluationStream={onToggleEvaluationStream}
      />
      <div className="it-flow__panel">
        <div className="it-progress">
          <div className="it-progress__label">总进度：{Math.round(overallProgress)}%</div>
          <div className="it-progress__bar">
            <div className="it-progress__fill" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>
        {audioPayload && (
          <div className="it-audio-summary">音频时长：{audioPayload.durationSec.toFixed(1)}s</div>
        )}
        {thinkingVisible && (
          <div className="it-thinking">
            <div className="it-thinking__title">正在思考：分析处理中</div>
            <div className="it-thinking__body">
              1. 解析语音特征与转写文本
              <br />
              2. 检索相似笔记与评分标准
              <br />
              3. 生成结构化面试评价
            </div>
          </div>
        )}
        <div className="it-question">
          <textarea
            data-testid="it-input-question-text"
            className={`it-textarea it-textarea--question${questionError ? " it-input--error" : ""}`}
            placeholder="题干材料（可选）"
            value={questionText}
            onChange={onQuestionTextChange}
          />
          <textarea
            data-testid="it-input-question-list"
            className={`it-textarea it-textarea--questions${questionError ? " it-input--error" : ""}`}
            placeholder="小题列表（一行一个，可选）"
            value={questionList}
            onChange={onQuestionListChange}
          />
          <div className="it-question__hint">
            题干或小题列表为必填；开始分析时自动识别第N题，也可手动点击“识别题目”。
          </div>
          <div className="it-question__status">
            <span
              className={`it-status-badge ${
                questionParsing
                  ? "it-status-badge--running"
                  : questionParsed
                    ? "it-status-badge--ok"
                    : "it-status-badge--idle"
              }`}
            >
              题干状态：
              {questionParsing
                ? "识别中"
                : questionParsed
                  ? "已识别"
                  : hasQuestion
                    ? "待解析"
                    : "未填写"}
            </span>
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked || questionParsing || !hasQuestion}
              onClick={onParseQuestions}
            >
              {questionParsing ? "识别中..." : "识别题目"}
            </button>
          </div>
          {typeof notesPreview !== "undefined" && (
            <div className="it-question__notes">
              <div className="it-question__notes-header">
                <span>笔记命中</span>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  type="button"
                  onClick={onToggleNoteHits}
                >
                  {showNoteHits ? "收起" : "展开"}
                </button>
              </div>
              {showNoteHits && (
                <>
                  {!retrievalEnabled ? (
                    <div className="it-placeholder">检索未启用</div>
                  ) : notesPreview.length > 0 ? (
                    <ul className="it-note-hits">
                      {notesPreview.map((item, idx) => (
                        <li key={`${idx}-${item.source}`} className="it-note-hits__item">
                          <div className="it-note-hits__header">
                            <span className="it-note-hits__score">
                              {Number.isFinite(item.score) ? item.score.toFixed(2) : "-"}
                            </span>
                            <span className="it-note-hits__source">{item.source}</span>
                          </div>
                          <div className="it-note-hits__snippet">{item.snippet}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="it-placeholder">暂无命中</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
