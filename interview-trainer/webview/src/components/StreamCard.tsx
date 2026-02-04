import React from "react";

export type StreamCardVariant = "step" | "evaluation";

type StreamCardProps = {
  variant: StreamCardVariant;
  title: string;
  status?: string;
  text?: string;
  collapsed?: boolean;
  done?: boolean;
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
  showToggle,
  previewLimit,
  placeholder = "（等待输出）",
  className,
  onToggle,
}) => {
  const limit = Math.max(50, previewLimit ?? 200);
  const rawText = String(text || "");
  const previewText = rawText.length > limit ? rawText.slice(-limit) : rawText;
  const containerClass = [
    variant === "evaluation" ? "it-evaluation__stream-card" : "it-step__stream",
    done ? "is-done" : "",
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
        <div className={previewClass}>{previewText || placeholder}</div>
      ) : (
        <div className={textClass}>{rawText || placeholder}</div>
      )}
    </div>
  );
};
