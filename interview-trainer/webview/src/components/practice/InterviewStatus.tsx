import React from "react";
import type { ItRecordingState, ItUserError } from "../../types";

type InterviewStatusProps = {
  uiLocked: boolean;
  statusMessage: string;
  saveResultMessage: string | null;
  recordingState: ItRecordingState;
  recordingTime: number;
  lastError?: ItUserError;
  formatSeconds: (seconds: number) => string;
  onOpenMicSettings: () => void;
};

export const InterviewStatus: React.FC<InterviewStatusProps> = (props) => {
  const {
    uiLocked,
    statusMessage,
    saveResultMessage,
    recordingState,
    recordingTime,
    lastError,
    formatSeconds,
    onOpenMicSettings,
  } = props;

  return (
    <div className="it-status">
      <span>{uiLocked ? "界面初始化中..." : statusMessage}</span>
      {saveResultMessage && <span className="it-status__hint">{saveResultMessage}</span>}
      {recordingState === "recording" && (
        <span className="it-status__timer">{formatSeconds(recordingTime)}</span>
      )}
      {lastError && <span className="it-status__error">{lastError.reason}</span>}
      {lastError?.type === "recording_permission" && (
        <button className="it-link-button" type="button" onClick={onOpenMicSettings}>
          打开麦克风权限设置
        </button>
      )}
    </div>
  );
};
