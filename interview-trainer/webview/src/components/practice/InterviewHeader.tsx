import React from "react";
import type { ItRecordingState } from "../../types";

type InterviewHeaderProps = {
  activePage: "practice" | "settings";
  onSetActivePage: (page: "practice" | "settings") => void;
  uiLocked: boolean;
  recordingState: ItRecordingState;
  isProcessing: boolean;
  isImporting: boolean;
  hasAudio: boolean;
  hasQuestion: boolean;
  savingResult: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onImportAudio: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportQuestions: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onCancelAnalyze: () => void;
  onSaveResult: () => void;
  onLoadHistory: () => void;
};

export const InterviewHeader: React.FC<InterviewHeaderProps> = (props) => {
  const {
    activePage,
    onSetActivePage,
    uiLocked,
    recordingState,
    isProcessing,
    isImporting,
    hasAudio,
    hasQuestion,
    savingResult,
    onStartRecording,
    onStopRecording,
    onImportAudio,
    onImportQuestions,
    onAnalyze,
    onCancelAnalyze,
    onSaveResult,
    onLoadHistory,
  } = props;

  const canAnalyze = uiLocked || !hasAudio || !hasQuestion || isImporting;

  return (
    <div className="it-header">
      <div className="it-title">面试训练助手</div>
      <div className="it-page-tabs">
        <button
          className={`it-tab ${activePage === "practice" ? "active" : ""}`}
          onClick={() => onSetActivePage("practice")}
        >
          练习
        </button>
        <button
          className={`it-tab ${activePage === "settings" ? "active" : ""}`}
          onClick={() => onSetActivePage("settings")}
        >
          设置
        </button>
      </div>
      {activePage === "practice" && (
        <div className="it-actions">
          <button
            className={`it-button ${
              recordingState === "recording" ? "it-button--danger" : "it-button--primary"
            }`}
            disabled={uiLocked}
            onClick={() => (recordingState === "recording" ? onStopRecording() : onStartRecording())}
          >
            {recordingState === "recording" ? "停止录音" : "开始录音"}
          </button>
          <label className="it-button it-button--secondary">
            导入音频
            <input type="file" accept="audio/*" onChange={onImportAudio} disabled={uiLocked} />
          </label>
          <label className="it-button it-button--secondary">
            导入题干
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={onImportQuestions}
              disabled={uiLocked}
            />
          </label>
          <button
            className={`it-button ${isProcessing ? "it-button--danger" : ""}`}
            disabled={isProcessing ? uiLocked : canAnalyze}
            onClick={isProcessing ? onCancelAnalyze : onAnalyze}
          >
            {isProcessing ? "结束分析" : "开始分析"}
          </button>
          <button className="it-button" disabled={uiLocked || savingResult} onClick={onSaveResult}>
            {savingResult ? "保存中..." : "保存结果"}
          </button>
          <button className="it-button" disabled={uiLocked} onClick={onLoadHistory}>
            历史记录
          </button>
        </div>
      )}
    </div>
  );
};
