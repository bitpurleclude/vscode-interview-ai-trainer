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

  return (
    <div className="it-steps">
      {steps.map((step) => {
        const stream = stepStreams[step.id];
        const isEvaluationStep = step.id === "evaluation";
        const showStream = streamingEnabled && stream?.text && !isEvaluationStep;
        return (
          <div key={step.id} className={`it-step it-step--${step.status}`}>
            <div className="it-step__content">
              <div className="it-step__dot" />
              <div className="it-step__label">{STEP_LABELS[step.id]}</div>
              {step.status !== "pending" && (
                <div className="it-step__progress">{step.progress}%</div>
              )}
            </div>
            {step.message && <div className="it-step__meta">{step.message}</div>}
            {isEvaluationStep && streamingEnabled && (
              <div className="it-step__evaluation-streams">
                <div className="it-step__evaluation-title">
                  面试评价实时输出（仅保留最新 {previewChars} 字）
                </div>
                <div className="it-evaluation__stream-grid">
                  {[0, 1, 2].map((idx) => {
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
                title="实时输出"
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
