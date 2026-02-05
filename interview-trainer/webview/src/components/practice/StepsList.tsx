import React from "react";
import type { ItStepState } from "../../types";
import { StreamCard } from "../StreamCard";

const STEP_LABELS: Record<string, string> = {
  init: "初始化",
  question: "题目解析",
  recording: "录音中",
  acoustic: "声学分析",
  asr: "语音转写",
  segment: "多题分段",
  notes: "笔记学习",
  evaluation: "面试评价",
  report: "结果生成",
  write: "文件写入",
};
const STEP_ORDER = [
  "init",
  "recording",
  "acoustic",
  "question",
  "segment",
  "asr",
  "evaluation",
  "notes",
  "report",
  "write",
];

type StreamState = {
  text: string;
  collapsed: boolean;
  done?: boolean;
};

type StepsListProps = {
  steps: ItStepState[];
  stepStreams: Record<string, StreamState>;
  evaluationStreams: Record<number, StreamState>;
  evaluationStreamQuestions: string[];
  streamingEnabled: boolean;
  previewChars: number;
  onToggleStepStream: (stepId: string) => void;
  onToggleEvaluationStream: (index: number) => void;
};

export const StepsList: React.FC<StepsListProps> = (props) => {
  const {
    steps,
    stepStreams,
    evaluationStreams,
    evaluationStreamQuestions,
    streamingEnabled,
    previewChars,
    onToggleStepStream,
    onToggleEvaluationStream,
  } = props;
  const orderSet = new Set(STEP_ORDER);
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const orderedSteps = STEP_ORDER.map((id) => stepsById.get(id)).filter(
    (step): step is ItStepState => Boolean(step),
  );
  const extraSteps = steps.filter((step) => !orderSet.has(step.id));
  const renderSteps = [...orderedSteps, ...extraSteps];
  const hasEvaluationOutput = Object.values(evaluationStreams).some(
    (stream) => Boolean(stream?.text),
  );
  const evaluationIndices = evaluationStreamQuestions.length
    ? evaluationStreamQuestions.map((_item, idx) => idx)
    : Object.keys(evaluationStreams)
        .map((key) => Number(key))
        .filter((key) => Number.isFinite(key))
        .sort((a, b) => a - b);
  const evaluationGridStyle =
    evaluationIndices.length > 0
      ? {
          gridTemplateColumns: `repeat(${evaluationIndices.length}, minmax(220px, 1fr))`,
        }
      : undefined;

  return (
    <div className="it-steps">
      {renderSteps.map((step) => {
        const stream = stepStreams[step.id];
        const isEvaluationStep = step.id === "evaluation";
        const showStream = streamingEnabled && stream?.text && !isEvaluationStep;
        const showEvaluationStreams =
          isEvaluationStep &&
          streamingEnabled &&
          hasEvaluationOutput &&
          evaluationIndices.length > 0;
        return (
          <div key={step.id} className={`it-step it-step--${step.status}${isEvaluationStep ? " it-step--evaluation" : ""}`}>
            <div className="it-step__content">
              <div className="it-step__dot" />
              <div className="it-step__label">{STEP_LABELS[step.id]}</div>
              {step.status !== "pending" && (
                <div className="it-step__progress">{step.progress}%</div>
              )}
            </div>
            {step.message && <div className="it-step__meta">{step.message}</div>}
            {showEvaluationStreams && (
              <div className="it-step__evaluation-streams">
                <div className="it-step__evaluation-title">
                  闈㈣瘯璇勪环瀹炴椂杈撳嚭锛堜粎淇濈暀鏈€鏂?{previewChars} 瀛楋級
                </div>
                <div className="it-evaluation__stream-grid" style={evaluationGridStyle}>
                  {evaluationIndices.map((idx) => {
                    const evalStream = evaluationStreams[idx];
                    const label = evaluationStreamQuestions[idx] || `第${idx + 1}题`;
                    const isActive = Boolean(evalStream?.text);
                    const status = evalStream?.done ? "完成" : isActive ? "输出中" : "等待";
                    return (
                      <StreamCard
                        key={`eval-stream-${idx}`}
                        variant="evaluation"
                        title={label}
                        status={status}
                        text={evalStream?.text}
                        collapsed={evalStream?.collapsed}
                        done={evalStream?.done}
                        showToggle={isActive}
                        previewLimit={previewChars}
                        onToggle={() => onToggleEvaluationStream(idx)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {showStream && (
              <StreamCard
                variant="step"
                title="瀹炴椂杈撳嚭"
                text={stream?.text}
                collapsed={stream?.collapsed}
                showToggle
                previewLimit={previewChars}
                onToggle={() => onToggleStepStream(step.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};





