import React from "react";
import type { SettingsRetrievalProps } from "./settingsTypes";

export const SettingsRetrievalPanel: React.FC<SettingsRetrievalProps> = (props) => {
  const {
    uiLocked,
    retrievalEnabled,
    handleToggleRetrieval,
    retrievalForm,
    handleRetrievalFieldChange,
    handleRetrievalVectorChange,
    savingRetrieval,
    retrievalSaveMessage,
    handleSaveRetrievalSettings,
    clearingEmbeddingCache,
    embeddingCacheMessage,
    handleClearEmbeddingCache,
    clearingCorpusCache,
    corpusCacheMessage,
    handleClearCorpusCache,
    traceLogEnabled,
    handleEnableTraceLogs,
    showEmbeddingWarmup,
    embeddingWarmup,
    retrievalCacheInfo,
    corpusCachePath,
    embeddingCachePath,
    corpusCacheMb,
    queryCacheSize,
    maxConcurrency,
    sessionsDir,
    handleSelectSessionsDir,
    topicTitleMode,
    setTopicTitleMode,
    topicTitleLen,
    setTopicTitleLen,
    savingTopicSettings,
    handleSaveTopicSettings,
    topicSaveMessage,
    retrievalDirs,
    handleSelectWorkspaceDir,
  } = props;

  return (
    <div className="it-settings__section">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">检索配置</div>
          <div className="it-settings__desc">知识库目录与开关</div>
        </div>
        <label className="it-toggle">
          <input
            type="checkbox"
            checked={retrievalEnabled}
            disabled={uiLocked}
            onChange={(event) => handleToggleRetrieval(event.target.checked)}
          />
          <span>启用检索</span>
        </label>
      </div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>模式</div>
        <select
          className="it-select"
          value={retrievalForm.mode}
          disabled={uiLocked}
          onChange={(event) => handleRetrievalFieldChange("mode", event.target.value)}
        >
          <option value="vector">向量语义</option>
          <option value="keyword">词面匹配</option>
        </select>
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>Top K</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.topK}
          disabled={uiLocked}
          onChange={(event) => handleRetrievalFieldChange("topK", Number(event.target.value))}
        />
        <div style={{ minWidth: 90 }}>Min Score</div>
        <input
          className="it-input"
          type="number"
          step="0.05"
          value={retrievalForm.minScore}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("minScore", Number(event.target.value))
          }
        />
      </div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>检索并行</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.maxConcurrency}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("maxConcurrency", Number(event.target.value))
          }
        />
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>笔记TopK</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.topKNotes}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("topKNotes", Number(event.target.value))
          }
        />
        <div style={{ minWidth: 90 }}>知识库TopK</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.topKKnowledge}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("topKKnowledge", Number(event.target.value))
          }
        />
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>评分标准TopK</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.topKRubrics}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("topKRubrics", Number(event.target.value))
          }
        />
        <div style={{ minWidth: 90 }}>示例答案TopK</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.topKExamples}
          disabled={uiLocked}
          onChange={(event) =>
            handleRetrievalFieldChange("topKExamples", Number(event.target.value))
          }
        />
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>批大小</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.vector.batchSize}
          disabled={uiLocked || retrievalForm.mode !== "vector"}
          onChange={(event) =>
            handleRetrievalVectorChange("batchSize", Number(event.target.value))
          }
        />
        <div style={{ minWidth: 80 }}>Query 上限</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.vector.queryMaxChars}
          disabled={uiLocked || retrievalForm.mode !== "vector"}
          onChange={(event) =>
            handleRetrievalVectorChange("queryMaxChars", Number(event.target.value))
          }
        />
      </div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>学习并行</div>
        <input
          className="it-input"
          type="number"
          value={retrievalForm.embeddingMaxConcurrency}
          disabled={uiLocked || retrievalForm.mode !== "vector"}
          onChange={(event) =>
            handleRetrievalFieldChange(
              "embeddingMaxConcurrency",
              Number(event.target.value),
            )
          }
        />
      </div>
      <div className="it-settings__actions">
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingRetrieval}
          onClick={handleSaveRetrievalSettings}
        >
          {savingRetrieval ? "保存中..." : "保存检索配置"}
        </button>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || clearingEmbeddingCache}
          onClick={handleClearEmbeddingCache}
        >
          {clearingEmbeddingCache ? "清理中..." : "清理向量缓存"}
        </button>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || clearingCorpusCache}
          onClick={handleClearCorpusCache}
        >
          {clearingCorpusCache ? "清理中..." : "清理语料索引缓存"}
        </button>
      </div>
      {retrievalSaveMessage && <div className="it-settings__hint">{retrievalSaveMessage}</div>}
      {embeddingCacheMessage && <div className="it-settings__hint">{embeddingCacheMessage}</div>}
      {corpusCacheMessage && <div className="it-settings__hint">{corpusCacheMessage}</div>}
      {showEmbeddingWarmup && embeddingWarmup && (
        <div className="it-progress it-progress--compact">
          <div className="it-progress__label">
            <span>向量预计算</span>
            <span>
              {embeddingWarmup.message || `${embeddingWarmup.done}/${embeddingWarmup.total}`}
            </span>
          </div>
          <div className="it-progress__bar">
            <div
              className="it-progress__fill"
              style={{ width: `${embeddingWarmup.progress || 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="it-settings__hint">索引与向量缓存会落盘保存，目录变更后会自动重新索引。</div>
      {retrievalCacheInfo && (
        <>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>语料缓存</div>
            <div className="it-settings__meta" style={{ flex: 1 }}>
              {corpusCachePath || "-"}
            </div>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>向量缓存</div>
            <div className="it-settings__meta" style={{ flex: 1 }}>
              {embeddingCachePath || "-"}
            </div>
          </div>
          <div className="it-input-row it-input-row--nowrap">
            <div style={{ minWidth: 80 }}>缓存上限</div>
            <div className="it-settings__meta" style={{ flex: 1 }}>
              {typeof corpusCacheMb === "number" ? `${corpusCacheMb} MB` : "-"}
            </div>
            <div style={{ minWidth: 80 }}>并发</div>
            <div className="it-settings__meta" style={{ flex: 1 }}>
              {typeof maxConcurrency === "number" ? maxConcurrency : "-"}
            </div>
          </div>
          <div className="it-input-row">
            <div style={{ minWidth: 80 }}>Query 缓存</div>
            <div className="it-settings__meta" style={{ flex: 1 }}>
              {typeof queryCacheSize === "number" ? queryCacheSize : "-"}
            </div>
          </div>
        </>
      )}
      <div className="it-settings__hint">向量检索会调用 embedding 接口，模型名称请按平台实际填入。</div>
      <div className="it-input-row">
        <div style={{ minWidth: 80 }}>保存目录</div>
        <div className="it-settings__meta" style={{ flex: 1 }}>
          {sessionsDir}
        </div>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked}
          onClick={handleSelectSessionsDir}
        >
          选择保存目录
        </button>
      </div>
      <div className="it-input-row it-input-row--nowrap">
        <div style={{ minWidth: 80 }}>历史命名</div>
        <select
          className="it-select"
          value={topicTitleMode}
          disabled={uiLocked || savingTopicSettings}
          onChange={(event) =>
            setTopicTitleMode(event.target.value === "simple" ? "simple" : "llm")
          }
        >
          <option value="llm">LLM 摘要</option>
          <option value="simple">题干前缀</option>
        </select>
        <div style={{ minWidth: 60 }}>长度</div>
        <input
          className="it-input"
          type="number"
          min={4}
          max={18}
          value={topicTitleLen}
          disabled={uiLocked || savingTopicSettings}
          onChange={(event) => setTopicTitleLen(Number(event.target.value))}
          style={{ width: 90 }}
        />
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked || savingTopicSettings}
          onClick={handleSaveTopicSettings}
        >
          {savingTopicSettings ? "保存中..." : "保存命名"}
        </button>
      </div>
      <div className="it-settings__hint">选择“LLM 摘要”会额外调用一次 LLM，增加耗时与费用。</div>
      {topicSaveMessage && <div className="it-settings__hint">{topicSaveMessage}</div>}
      <div className="it-retrieval__list">
        {retrievalDirs.map((item) => (
          <div key={item.key} className="it-retrieval__item">
            <div className="it-retrieval__label">{item.label}</div>
            <div className="it-retrieval__path">{item.value}</div>
            <button
              className="it-button it-button--secondary it-button--compact"
              disabled={uiLocked}
              onClick={() => handleSelectWorkspaceDir(item.key)}
            >
              选择目录
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
