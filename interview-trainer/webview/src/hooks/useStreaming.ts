import { useCallback, useEffect, useState } from "react";
import { on } from "../messenger";
import type { ItQuestionEvaluation } from "../types";

type StreamState = {
  text: string;
  collapsed: boolean;
  done?: boolean;
  omittedChars?: number;
};

type StreamingOptions = {
  enabled: boolean;
  autoCollapse: boolean;
  previewChars: number;
};

function it_toQuestionEvaluationSnapshot(
  value: unknown,
  questionIndex: number,
): ItQuestionEvaluation | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const questionText =
    typeof source.question === "string" && source.question.trim()
      ? source.question.trim()
      : `第${questionIndex + 1}题`;
  const scoreMap: Record<string, number> = {};
  if (source.scores && typeof source.scores === "object") {
    Object.entries(source.scores as Record<string, unknown>).forEach(([key, raw]) => {
      const score = Number(raw);
      if (key.trim() && Number.isFinite(score)) {
        scoreMap[key] = score;
      }
    });
  }
  const suggestions = Array.isArray(source.suggestions)
    ? source.suggestions
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const summary =
    typeof source.summary === "string" && source.summary.trim()
      ? source.summary.trim()
      : undefined;
  const overallScore = Number(source.overallScore);
  return {
    questionIndex,
    question: questionText,
    overallScore: Number.isFinite(overallScore) ? overallScore : 0,
    scores: scoreMap,
    suggestions,
    summary,
  };
}

function it_compactStreamText(rawText: string, previewChars: number): {
  text: string;
  omittedChars: number;
} {
  const safePreview = Math.max(50, previewChars || 200);
  const softLimit = Math.max(2000, safePreview * 12);
  const trimStep = Math.max(300, safePreview * 3);
  if (rawText.length <= softLimit + trimStep) {
    return {
      text: rawText,
      omittedChars: 0,
    };
  }
  const overflow = rawText.length - softLimit;
  const trimBlocks = Math.floor(overflow / trimStep);
  if (trimBlocks <= 0) {
    return {
      text: rawText,
      omittedChars: 0,
    };
  }
  const omittedChars = trimBlocks * trimStep;
  return {
    text: rawText.slice(omittedChars),
    omittedChars,
  };
}

export function useStreaming(options: StreamingOptions) {
  const [stepStreams, setStepStreams] = useState<Record<string, StreamState>>({});
  const [evaluationStreams, setEvaluationStreams] = useState<
    Record<number, StreamState>
  >({});
  const [evaluationSnapshots, setEvaluationSnapshots] = useState<
    Record<number, ItQuestionEvaluation>
  >({});

  useEffect(() => {
    const disposeStream = on("it/stepStreamUpdate", (data) => {
      if (!options.enabled) {
        return;
      }
      const step = String(data?.step || "");
      if (!step) {
        return;
      }
      setStepStreams((prev) => {
        const current = prev[step] || {
          text: "",
          collapsed: false,
          done: false,
          omittedChars: 0,
        };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const compacted = it_compactStreamText(rawText, options.previewChars);
        let collapsed = reset ? false : current.collapsed;
        if (done && options.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [step]: {
            text: compacted.text,
            collapsed,
            done,
            omittedChars: compacted.omittedChars,
          },
        };
      });
    });
    return () => {
      disposeStream();
    };
  }, [options.enabled, options.autoCollapse, options.previewChars]);

  useEffect(() => {
    const disposeStream = on("it/evaluationStreamUpdate", (data) => {
      if (!options.enabled) {
        return;
      }
      const index = Number(data?.questionIndex ?? 0);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      const snapshot = it_toQuestionEvaluationSnapshot(data?.snapshot, index);
      if (snapshot) {
        setEvaluationSnapshots((prev) => ({
          ...prev,
          [index]: snapshot,
        }));
      }
      setEvaluationStreams((prev) => {
        const current = prev[index] || {
          text: "",
          collapsed: false,
          done: false,
          omittedChars: 0,
        };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const compacted = it_compactStreamText(rawText, options.previewChars);
        let collapsed = reset ? false : current.collapsed;
        if (done && options.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [index]: {
            text: compacted.text,
            collapsed,
            done,
            omittedChars: compacted.omittedChars,
          },
        };
      });
    });
    return () => {
      disposeStream();
    };
  }, [options.enabled, options.autoCollapse, options.previewChars]);

  const resetStreams = useCallback(() => {
    setStepStreams({});
    setEvaluationStreams({});
    setEvaluationSnapshots({});
  }, []);

  const resetEvaluationStream = useCallback((index: number) => {
    setEvaluationStreams((prev) => ({
      ...prev,
      [index]: { text: "", collapsed: false, done: false, omittedChars: 0 },
    }));
    setEvaluationSnapshots((prev) => {
      if (!(index in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const handleToggleStepStream = useCallback((stepId: string) => {
    setStepStreams((prev) => {
      const current = prev[stepId];
      if (!current) {
        return prev;
      }
      return {
        ...prev,
        [stepId]: {
          ...current,
          collapsed: !current.collapsed,
        },
      };
    });
  }, []);

  const handleToggleEvaluationStream = useCallback((index: number) => {
    setEvaluationStreams((prev) => ({
      ...prev,
      [index]: {
        ...(prev[index] || { text: "", collapsed: false, done: false, omittedChars: 0 }),
        collapsed: !prev[index]?.collapsed,
      },
    }));
  }, []);

  return {
    stepStreams,
    evaluationStreams,
    evaluationSnapshots,
    resetStreams,
    resetEvaluationStream,
    handleToggleStepStream,
    handleToggleEvaluationStream,
  };
}
