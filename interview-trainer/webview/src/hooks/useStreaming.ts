import { useCallback, useEffect, useState } from "react";
import { on } from "../messenger";

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
  }, []);

  const resetEvaluationStream = useCallback((index: number) => {
    setEvaluationStreams((prev) => ({
      ...prev,
      [index]: { text: "", collapsed: false, done: false, omittedChars: 0 },
    }));
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
    resetStreams,
    resetEvaluationStream,
    handleToggleStepStream,
    handleToggleEvaluationStream,
  };
}
