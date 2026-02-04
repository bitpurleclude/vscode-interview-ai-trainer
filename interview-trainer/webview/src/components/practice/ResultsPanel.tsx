import React from "react";
import type {
  ItAcousticMetrics,
  ItEvaluation,
  ItHistoryItem,
  ItQuestionTiming,
} from "../../types";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";

type ResultsPanelProps = {
  activeTab: ResultTab;
  onSetActiveTab: (tab: ResultTab) => void;
  hasAnyResult: boolean;
  hasTranscriptContent: boolean;
  transcriptPreview: string;
  detailedTranscriptPreview?: string;
  acousticPreview?: ItAcousticMetrics;
  questionText: string;
  parsedQuestionList: string[];
  questionTimingsPreview?: ItQuestionTiming[];
  questionTimingNotePreview?: string;
  evaluationPreview: ItEvaluation | null;
  uiLocked: boolean;
  isProcessing: boolean;
  regeneratingIndex: number | null;
  onRegenerateDemoAnswer: (index: number) => void;
  showDemoPrompt: boolean;
  onToggleDemoPrompt: () => void;
  showRawOutput: boolean;
  onToggleRawOutput: () => void;
  showNoteUsage: boolean;
  onToggleNoteUsage: () => void;
  showNoteSuggestions: boolean;
  onToggleNoteSuggestions: () => void;
  historyItems: ItHistoryItem[];
  onOpenReport: (path: string) => void;
  formatSeconds: (seconds: number) => string;
  renderParagraphs: (text: string, keyPrefix: string) => React.ReactNode;
  buildOutlineTree: (items: string[]) => { text: string; children: any[] }[];
  renderOutlineTree: (
    nodes: { text: string; children: any[] }[],
    keyPrefix: string,
  ) => React.ReactNode;
};

export const ResultsPanel: React.FC<ResultsPanelProps> = (props) => {
  const {
    activeTab,
    onSetActiveTab,
    hasAnyResult,
    hasTranscriptContent,
    transcriptPreview,
    detailedTranscriptPreview,
    acousticPreview,
    questionText,
    parsedQuestionList,
    questionTimingsPreview,
    questionTimingNotePreview,
    evaluationPreview,
    uiLocked,
    isProcessing,
    regeneratingIndex,
    onRegenerateDemoAnswer,
    showDemoPrompt,
    onToggleDemoPrompt,
    showRawOutput,
    onToggleRawOutput,
    showNoteUsage,
    onToggleNoteUsage,
    showNoteSuggestions,
    onToggleNoteSuggestions,
    historyItems,
    formatSeconds,
    onOpenReport,
    renderParagraphs,
    buildOutlineTree,
    renderOutlineTree,
  } = props;

  return (
    <div className="it-results">
      <div className="it-tabs">
        <button
          className={`it-tab ${activeTab === "transcript" ? "active" : ""}`}
          onClick={() => onSetActiveTab("transcript")}
        >
          转录文本
        </button>
        <button
          className={`it-tab ${activeTab === "acoustic" ? "active" : ""}`}
          onClick={() => onSetActiveTab("acoustic")}
        >
          声学分析
        </button>
        <button
          className={`it-tab ${activeTab === "evaluation" ? "active" : ""}`}
          onClick={() => onSetActiveTab("evaluation")}
        >
          面试评价
        </button>
        <button
          className={`it-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => onSetActiveTab("history")}
        >
          历史记录
        </button>
      </div>
      <div className="it-result-panel">
        {!hasAnyResult && <div className="it-placeholder">等待分析结果...</div>}
        {hasTranscriptContent && activeTab === "transcript" && (
          <div className="it-transcript">
            {detailedTranscriptPreview ? (
              <>
                <div className="it-section-title">带时间标注</div>
                <textarea className="it-textarea it-textarea--tall" value={detailedTranscriptPreview} readOnly />
                <div className="it-section-title">原始转写</div>
                <textarea className="it-textarea" value={transcriptPreview} readOnly />
              </>
            ) : (
              <textarea className="it-textarea" value={transcriptPreview} readOnly />
            )}
          </div>
        )}
        {acousticPreview && activeTab === "acoustic" && (
          <div className="it-metrics">
            <div>时长：{acousticPreview.durationSec.toFixed(2)}s</div>
            <div>语速：{acousticPreview.speechRateWpm ?? "-"}</div>
            <div>停顿次数：{acousticPreview.pauseCount}</div>
            <div>平均停顿：{acousticPreview.pauseAvgSec}s</div>
            <div>最长停顿：{acousticPreview.pauseMaxSec}s</div>
            <div>RMS均值：{acousticPreview.rmsDbMean}dB</div>
            <div>RMS波动：{acousticPreview.rmsDbStd}dB</div>
            <div>SNR：{acousticPreview.snrDb ?? "-"}</div>
          </div>
        )}
        {activeTab === "evaluation" && (
          <div className="it-evaluation">
            {questionText.trim() && (
              <div className="it-evaluation__section">
                <h4>题干材料</h4>
                <textarea className="it-textarea it-textarea--prompt" value={questionText} readOnly />
              </div>
            )}
            {parsedQuestionList.length > 0 && (
              <div className="it-evaluation__section">
                <h4>题目列表</h4>
                <ul>
                  {parsedQuestionList.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {questionTimingsPreview && questionTimingsPreview.length > 0 ? (
              <div className="it-question-timings">
                <div className="it-question-timings__title">题目用时</div>
                {questionTimingsPreview.map((item, idx) => (
                  <div key={`${idx}-${item.question}`} className="it-question-timings__item">
                    <div className="it-question-timings__label">{idx + 1}. {item.question}</div>
                    <div className="it-question-timings__value">
                      {`${formatSeconds(item.startSec)} - ${formatSeconds(item.endSec)} （用时 ${formatSeconds(item.durationSec)}${item.note ? `，${item.note}` : ""}）`}
                    </div>
                  </div>
                ))}
              </div>
            ) : questionTimingNotePreview ? (
              <div className="it-question-timings">
                <div className="it-question-timings__title">题目用时</div>
                <div className="it-question-timings__item">
                  <div className="it-question-timings__label">状态</div>
                  <div className="it-question-timings__value">{questionTimingNotePreview}</div>
                </div>
              </div>
            ) : null}
            {evaluationPreview ? (
              <>
                <div className="it-evaluation__summary">{evaluationPreview.topicSummary}</div>
                <div className="it-evaluation__overall">
                  <span>总分</span>
                  <span className="it-evaluation__overall-value">
                    {evaluationPreview.overallScore ?? "-"}
                  </span>
                </div>
                <div className="it-evaluation__scores">
                  {Object.entries(evaluationPreview.scores || {}).map(([key, value]) => (
                    <div key={key} className="it-score">
                      <span>{key}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="it-evaluation__section">
                  <h4>优点</h4>
                  <ul>
                    {evaluationPreview.strengths.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="it-evaluation__section">
                  <h4>问题</h4>
                  <ul>
                    {evaluationPreview.issues.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="it-evaluation__section">
                  <h4>改进建议</h4>
                  <ul>
                    {evaluationPreview.improvements.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="it-evaluation__section">
                  <h4>练习重点</h4>
                  <ul>
                    {evaluationPreview.nextFocus.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                {evaluationPreview.revisedAnswers && evaluationPreview.revisedAnswers.length > 0 && (
                  <div className="it-evaluation__section">
                    <h4>示范性修改</h4>
                    <div className="it-revised-list">
                      {evaluationPreview.revisedAnswers.map((item, idx) => (
                        <div key={`${idx}-${item.question}`} className="it-revised-item">
                          <div className="it-revised-item__title">
                            <span>
                              {idx + 1}. {item.question}
                              {typeof item.estimatedTimeMin === "number"
                                ? `（建议${item.estimatedTimeMin}分钟）`
                                : ""}
                            </span>
                            <button
                              className="it-button it-button--compact"
                              type="button"
                              disabled={uiLocked || isProcessing || regeneratingIndex === idx}
                              onClick={() => onRegenerateDemoAnswer(idx)}
                            >
                              {regeneratingIndex === idx ? "生成中..." : "重新生成示范"}
                            </button>
                          </div>
                          <div className="it-revised-item__block">
                            <span>原回答：</span>
                            {renderParagraphs(item.original, `${idx}-orig`)}
                          </div>
                          <div className="it-revised-item__block">
                            <span>答题提纲（你的回答）：</span>
                            {item.outlineOriginal && item.outlineOriginal.length > 0 ? (
                              renderOutlineTree(buildOutlineTree(item.outlineOriginal), `${idx}-orig-outline`)
                            ) : (
                              <span>（未提供）</span>
                            )}
                          </div>
                          <div className="it-revised-item__block">
                            <span>示范：</span>
                            {renderParagraphs(item.revised, `${idx}-demo`)}
                          </div>
                          <div className="it-revised-item__block">
                            <span>答题提纲（示范）：</span>
                            {item.outlineRevised && item.outlineRevised.length > 0 ? (
                              renderOutlineTree(buildOutlineTree(item.outlineRevised), `${idx}-demo-outline`)
                            ) : (
                              <span>（未提供）</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {evaluationPreview.prompt && (
                  <div className="it-evaluation__section">
                    <div className="it-section-header">
                      <h4>示范答题提示词</h4>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        type="button"
                        onClick={onToggleDemoPrompt}
                      >
                        {showDemoPrompt ? "收起" : "展开"}
                      </button>
                    </div>
                    {showDemoPrompt && (
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        value={evaluationPreview.prompt}
                        readOnly
                      />
                    )}
                  </div>
                )}
                {(evaluationPreview.raw || showRawOutput) && (
                  <div className="it-evaluation__section">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <h4 style={{ margin: 0 }}>原始输出</h4>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={!evaluationPreview.raw}
                        onClick={onToggleRawOutput}
                      >
                        {showRawOutput ? "收起" : "查看原始输出"}
                      </button>
                    </div>
                    {showRawOutput && (
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        value={evaluationPreview.raw || ""}
                        readOnly
                      />
                    )}
                  </div>
                )}
                {evaluationPreview.noteUsage && evaluationPreview.noteUsage.length > 0 && (
                  <div className="it-evaluation__section">
                    <div className="it-section-header">
                      <h4>笔记引用</h4>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        type="button"
                        onClick={onToggleNoteUsage}
                      >
                        {showNoteUsage ? "收起" : "展开"}
                      </button>
                    </div>
                    {showNoteUsage && (
                      <ul>
                        {evaluationPreview.noteUsage.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {evaluationPreview.noteSuggestions && evaluationPreview.noteSuggestions.length > 0 && (
                  <div className="it-evaluation__section">
                    <div className="it-section-header">
                      <h4>可用素材/参考思路</h4>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        type="button"
                        onClick={onToggleNoteSuggestions}
                      >
                        {showNoteSuggestions ? "收起" : "展开"}
                      </button>
                    </div>
                    {showNoteSuggestions && (
                      <ul>
                        {evaluationPreview.noteSuggestions.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="it-placeholder">评价生成中...</div>
            )}
          </div>
        )}
        {activeTab === "history" && (
          <div className="it-history">
            {historyItems.length === 0 ? (
              <div className="it-placeholder">暂无历史记录</div>
            ) : (
              historyItems.map((item) => (
                <div key={item.reportPath} className="it-history__item">
                  <div>
                    <div className="it-history__title">{item.topicTitle}</div>
                    <div className="it-history__meta">{item.timestamp || "未知时间"}</div>
                  </div>
                  <button
                    className="it-button it-button--secondary"
                    onClick={() => onOpenReport(item.reportPath)}
                  >
                    打开报告
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
