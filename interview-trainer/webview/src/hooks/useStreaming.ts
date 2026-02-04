import { useCallback, useEffect, useState } from "react";
import { on } from "../messenger";

type StreamState = {
  text: string;
  collapsed: boolean;
  done?: boolean;
};

type StreamingOptions = {
  enabled: boolean;
  autoCollapse: boolean;
  previewChars: number;
};

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
        const current = prev[step] || { text: "", collapsed: false, done: false };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const previewLimit = Math.max(50, options.previewChars || 200);
        const nextText =
          rawText.length > previewLimit ? rawText.slice(-previewLimit) : rawText;
        let collapsed = reset ? false : current.collapsed;
        if (done && options.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [step]: {
            text: nextText,
            collapsed,
            done,
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
        const current = prev[index] || { text: "", collapsed: false, done: false };
        const reset = Boolean(data?.reset);
        const done = Boolean(data?.done);
        const rawText =
          typeof data?.text === "string" ? data.text : reset ? "" : current.text;
        const previewLimit = Math.max(50, options.previewChars || 200);
        const nextText =
          rawText.length > previewLimit ? rawText.slice(-previewLimit) : rawText;
        let collapsed = reset ? false : current.collapsed;
        if (done && options.autoCollapse) {
          collapsed = true;
        }
        return {
          ...prev,
          [index]: {
            text: nextText,
            collapsed,
            done,
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
      [index]: { text: "", collapsed: false, done: false },
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
        ...(prev[index] || { text: "", collapsed: false, done: false }),
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
