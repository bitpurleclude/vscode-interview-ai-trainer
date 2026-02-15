import React from "react";

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

  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <span className={titleClass}>{title}</span>
        {status ? <span className={statusClass}>{status}</span> : null}
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
        <div className={textClass}>
          {Number(omittedChars || 0) > 0 ? (
            <div className={omittedClass}>已省略前 {omittedChars} 字</div>
          ) : null}
          <div>{rawText || placeholder}</div>
        </div>
      )}
    </div>
  );
};
