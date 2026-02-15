import React, { useCallback, useEffect, useRef, useState } from "react";

export type StreamCardVariant = "step" | "evaluation";

type StreamCardProps = {
  variant: StreamCardVariant;
  title: string;
  status?: string;
  text?: string;
  collapsed?: boolean;
  done?: boolean;
  omittedChars?: number;
  showToggle?: boolean;
  previewLimit?: number;
  placeholder?: string;
  className?: string;
  onToggle?: () => void;
};

function it_isNearBottom(node: HTMLDivElement, thresholdPx = 16): boolean {
  const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
  return distance <= thresholdPx;
}

export const StreamCard: React.FC<StreamCardProps> = ({
  variant,
  title,
  status,
  text,
  collapsed,
  done,
  omittedChars,
  showToggle,
  previewLimit,
  placeholder = "（等待输出）",
  className,
  onToggle,
}) => {
  const limit = Math.max(50, previewLimit ?? 200);
  const rawText = String(text || "");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const textLengthRef = useRef(rawText.length);
  const [autoFollow, setAutoFollow] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const compactText = rawText.replace(/\s+/g, " ").trim();
  const summaryLimit = Math.max(30, Math.min(140, Math.floor(limit * 0.7)));
  const previewText =
    compactText.length > summaryLimit
      ? `${compactText.slice(0, summaryLimit)}...`
      : compactText;
  const containerClass = [
    variant === "evaluation" ? "it-evaluation__stream-card" : "it-step__stream",
    done ? "is-done" : "",
    collapsed ? "is-collapsed" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
  const headerClass =
    variant === "evaluation" ? "it-evaluation__stream-header" : "it-step__stream-header";
  const toggleClass =
    variant === "evaluation"
      ? "it-link-button it-evaluation__stream-toggle"
      : "it-link-button it-step__stream-toggle";
  const titleClass = variant === "evaluation" ? "it-evaluation__stream-title" : undefined;
  const statusClass = variant === "evaluation" ? "it-evaluation__stream-status" : undefined;
  const textClass =
    variant === "evaluation" ? "it-evaluation__stream-text" : "it-step__stream-text";
  const previewClass =
    variant === "evaluation"
      ? "it-evaluation__stream-preview"
      : "it-step__stream-preview";
  const omittedClass = "it-stream__omitted";
  const newBadgeClass =
    variant === "evaluation"
      ? "it-link-button it-evaluation__stream-new"
      : "it-link-button it-step__stream-new";

  useEffect(() => {
    if (collapsed) {
      textLengthRef.current = rawText.length;
      setAutoFollow(true);
      setPendingUpdates(0);
      return;
    }
    const body = bodyRef.current;
    if (!body) {
      textLengthRef.current = rawText.length;
      return;
    }
    const prevLen = textLengthRef.current;
    const nextLen = rawText.length;
    const appended = nextLen > prevLen;
    textLengthRef.current = nextLen;
    if (!appended) {
      return;
    }
    if (autoFollow || it_isNearBottom(body)) {
      requestAnimationFrame(() => {
        const latest = bodyRef.current;
        if (latest) {
          latest.scrollTop = latest.scrollHeight;
        }
      });
      setPendingUpdates(0);
      if (!autoFollow) {
        setAutoFollow(true);
      }
      return;
    }
    setPendingUpdates((current) => Math.min(99, current + 1));
  }, [autoFollow, collapsed, rawText]);

  const handleBodyScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const shouldFollow = it_isNearBottom(body);
    setAutoFollow((current) => (current === shouldFollow ? current : shouldFollow));
    if (shouldFollow) {
      setPendingUpdates(0);
    }
  }, []);

  const handleJumpToLatest = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    body.scrollTop = body.scrollHeight;
    setAutoFollow(true);
    setPendingUpdates(0);
  }, []);

  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <span className={titleClass}>{title}</span>
        {status ? <span className={statusClass}>{status}</span> : null}
        {!collapsed && pendingUpdates > 0 ? (
          <button type="button" className={newBadgeClass} onClick={handleJumpToLatest}>
            有新内容（{pendingUpdates}）
          </button>
        ) : null}
        {showToggle && (
          <button type="button" className={toggleClass} onClick={onToggle}>
            {collapsed ? "展开" : "收起"}
          </button>
        )}
      </div>
      {collapsed ? (
        <div className={previewClass} title={rawText || placeholder}>
          <span>{previewText || placeholder}</span>
          {Number(omittedChars || 0) > 0 ? (
            <span className={omittedClass}>已省略前 {omittedChars} 字</span>
          ) : null}
        </div>
      ) : (
        <div className={textClass} ref={bodyRef} onScroll={handleBodyScroll}>
          {Number(omittedChars || 0) > 0 ? (
            <div className={omittedClass}>已省略前 {omittedChars} 字</div>
          ) : null}
          <div>{rawText || placeholder}</div>
        </div>
      )}
    </div>
  );
};
