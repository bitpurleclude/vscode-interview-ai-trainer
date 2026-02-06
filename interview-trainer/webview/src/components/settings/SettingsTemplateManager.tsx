import React, { useEffect, useMemo, useState } from "react";
import type { SettingsBindingProps, SettingsCommonTemplateProps } from "./settingsTypes";
import { on, request } from "../../messenger";
import { TemplateEditor } from "./template/TemplateEditor";
import { TemplateList } from "./template/TemplateList";
import { TemplateSidebar } from "./template/TemplateSidebar";
import { TemplateTestPanel } from "./template/TemplateTestPanel";
import {
  TEMPLATE_CATEGORY_TABS,
  TEMPLATE_LOW_PRIORITY_VARS,
} from "./template/templateConstants";

type SettingsTemplateManagerProps = SettingsCommonTemplateProps &
  Pick<SettingsBindingProps, "templateBindings">;

export const SettingsTemplateManager: React.FC<SettingsTemplateManagerProps> = (props) => {
  const {
    uiLocked,
    templateCategory,
    setTemplateCategory,
    templatesByCategory,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
    templateBindings,
    templateDraft,
    setTemplateDraft,
    templateJsonDraft,
    setTemplateJsonDraft,
    templateJsonErrors,
    setTemplateJsonErrors,
    templateSaveMessage,
    savingTemplate,
    isCreatingTemplate,
    handleCreateTemplate,
    handleDuplicateTemplate,
    handleDeleteTemplate,
    handleCancelTemplateDraft,
    handleSaveTemplate,
    updateTemplateRequest,
    updateTemplateResponse,
    updateTemplateStreaming,
    paramCatalogList,
    templateUsageSets,
    templateSecrets,
    secretDraft,
    setSecretDraft,
    savingSecret,
    secretMessage,
    handleSaveSecret,
    handleDeleteSecret,
    templateParamOptions,
    templateParamInput,
    setTemplateParamInput,
    savingParamOptions,
    handleAddParamOption,
    handleSaveParamOptions,
    tokenStore,
    handleRefreshToken,
    handleRefreshAllTokens,
    handleToggleTokenAutoRefresh,
  } = props;

  const [testInput, setTestInput] = useState("ping");
  const [testVarsDraft, setTestVarsDraft] = useState("{}");
  const [testVarsError, setTestVarsError] = useState<string | null>(null);
  const [testRequestPreview, setTestRequestPreview] = useState<any | null>(null);
  const [testResponsePreview, setTestResponsePreview] = useState<any | null>(null);
  const [testStreamOutput, setTestStreamOutput] = useState<string>("");
  const [testMissingVars, setTestMissingVars] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testRunId, setTestRunId] = useState<string>("");
  const [testTokenInfo, setTestTokenInfo] = useState<any | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAllVars, setShowAllVars] = useState(false);

  const selectedTemplateName = selectedTemplate?.name || selectedTemplate?.id || "";
  const canTest = Boolean(selectedTemplateId);
  const boundIds = useMemo(
    () =>
      new Set(
        [
          templateBindings.llm?.questionParse,
          templateBindings.llm?.title,
          templateBindings.llm?.segment,
          templateBindings.llm?.evaluation,
          templateBindings.asr?.transcription,
          templateBindings.embedding?.retrieval,
        ].filter(Boolean) as string[],
      ),
    [templateBindings],
  );
  const requestPreviewText = useMemo(() => {
    if (!testRequestPreview) return "";
    try {
      return JSON.stringify(testRequestPreview, null, 2);
    } catch {
      return String(testRequestPreview);
    }
  }, [testRequestPreview]);
  const responsePreviewText = useMemo(() => {
    if (!testResponsePreview) return "";
    try {
      return JSON.stringify(testResponsePreview, null, 2);
    } catch {
      return String(testResponsePreview);
    }
  }, [testResponsePreview]);
  const visibleParamList = useMemo(() => {
    if (showAllVars) {
      return paramCatalogList;
    }
    return paramCatalogList.filter((name) => {
      if (!TEMPLATE_LOW_PRIORITY_VARS.has(name)) {
        return true;
      }
      return templateUsageSets.used.has(name);
    });
  }, [paramCatalogList, showAllVars, templateUsageSets.used]);

  useEffect(() => {
    const dispose = on("it/templateTestDelta", (data) => {
      if (!data || data.runId !== testRunId) {
        return;
      }
      if (typeof data.full === "string") {
        setTestStreamOutput(data.full);
      } else if (typeof data.delta === "string") {
        setTestStreamOutput((prev) => `${prev}${data.delta}`);
      }
    });
    return () => {
      dispose();
    };
  }, [testRunId]);

  useEffect(() => {
    setTestRequestPreview(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    setTestMessage(null);
    setTestVarsError(null);
    setTestRunId("");
    setTestTokenInfo(null);
    setDeleteConfirmId(null);
    setShowAllVars(false);
  }, [selectedTemplateId, templateCategory]);

  const parseTestVars = () => {
    const raw = testVarsDraft.trim();
    if (!raw) {
      setTestVarsError(null);
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      setTestVarsError(null);
      return parsed;
    } catch (err) {
      setTestVarsError(
        `变量 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  };

  const handleDryRun = async () => {
    if (!selectedTemplateId) {
      return;
    }
    const vars = parseTestVars();
    if (vars === null) {
      return;
    }
    setTestRunning(true);
    setTestMessage(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    setTestTokenInfo(null);
    try {
      const resp = await request("it/testTemplateDryRun", {
        templateId: selectedTemplateId,
        inputText: testInput,
        variables: vars,
      });
      if (resp?.status === "success") {
        setTestRequestPreview(resp.content?.request ?? resp.content ?? null);
        setTestMissingVars(resp.content?.missing ?? []);
        if (resp.content?.missing?.length) {
          setTestMessage(`缺失变量：${resp.content.missing.join(", ")}`);
        }
      } else {
        setTestMessage(resp?.error || "Dry-run 失败，请检查模板或变量。");
      }
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
    setTestRunning(false);
  };

  const handleLiveTest = async () => {
    if (!selectedTemplateId) {
      return;
    }
    const vars = parseTestVars();
    if (vars === null) {
      return;
    }
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setTestRunId(runId);
    setTestRunning(true);
    setTestMessage(null);
    setTestResponsePreview(null);
    setTestStreamOutput("");
    setTestMissingVars([]);
    setTestTokenInfo(null);
    try {
      const resp = await request("it/testTemplateLive", {
        templateId: selectedTemplateId,
        inputText: testInput,
        variables: vars,
        runId,
      });
      if (resp?.status === "success") {
        const content = resp.content ?? null;
        setTestResponsePreview(content?.result ?? content);
        setTestTokenInfo(content?.tokenInfo ?? null);
      } else {
        setTestMessage(resp?.error || "Live 测试失败，请检查模板或网络。");
      }
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
    setTestRunning(false);
  };

  return (
    <div className="it-settings__section it-settings__section--full">
      <div className="it-settings__header">
        <div>
          <div className="it-settings__title">API 模板管理</div>
          <div className="it-settings__desc">
            模板化接入，支持多厂商 API 与多任务绑定
          </div>
        </div>
        <div className="it-settings__actions">
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked}
            onClick={handleCreateTemplate}
          >
            新建模板
          </button>
          <button
            className="it-button it-button--secondary it-button--compact"
            disabled={uiLocked || !selectedTemplate}
            onClick={handleDuplicateTemplate}
          >
            复制模板
          </button>
        </div>
      </div>
      <div className="it-template__tabs">
        {TEMPLATE_CATEGORY_TABS.map((item) => (
          <button
            key={item.key}
            className={`it-chip ${templateCategory === item.key ? "active" : ""} ${
              item.enabled ? "" : "disabled"
            }`}
            disabled={!item.enabled}
            onClick={() => setTemplateCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="it-template">
        <TemplateList
          uiLocked={uiLocked}
          templatesByCategory={templatesByCategory}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          boundIds={boundIds}
          handleCreateTemplate={handleCreateTemplate}
          handleDeleteTemplate={handleDeleteTemplate}
          deleteConfirmId={deleteConfirmId}
          setDeleteConfirmId={setDeleteConfirmId}
        />
        <TemplateEditor
          uiLocked={uiLocked}
          templateDraft={templateDraft}
          setTemplateDraft={setTemplateDraft}
          templateCategory={templateCategory}
          setTemplateCategory={setTemplateCategory}
          templateJsonDraft={templateJsonDraft}
          setTemplateJsonDraft={setTemplateJsonDraft}
          templateJsonErrors={templateJsonErrors}
          setTemplateJsonErrors={setTemplateJsonErrors}
          templateSaveMessage={templateSaveMessage}
          savingTemplate={savingTemplate}
          isCreatingTemplate={isCreatingTemplate}
          handleCancelTemplateDraft={handleCancelTemplateDraft}
          handleSaveTemplate={handleSaveTemplate}
          updateTemplateRequest={updateTemplateRequest}
          updateTemplateResponse={updateTemplateResponse}
          updateTemplateStreaming={updateTemplateStreaming}
        />
        <TemplateSidebar
          uiLocked={uiLocked}
          visibleParamList={visibleParamList}
          templateUsageSets={templateUsageSets}
          showAllVars={showAllVars}
          setShowAllVars={setShowAllVars}
          templateSecrets={templateSecrets}
          secretDraft={secretDraft}
          setSecretDraft={setSecretDraft}
          savingSecret={savingSecret}
          secretMessage={secretMessage}
          handleSaveSecret={handleSaveSecret}
          handleDeleteSecret={handleDeleteSecret}
          templateParamOptions={templateParamOptions}
          templateParamInput={templateParamInput}
          setTemplateParamInput={setTemplateParamInput}
          savingParamOptions={savingParamOptions}
          handleAddParamOption={handleAddParamOption}
          handleSaveParamOptions={handleSaveParamOptions}
          tokenStore={tokenStore}
          handleRefreshToken={handleRefreshToken}
          handleRefreshAllTokens={handleRefreshAllTokens}
          handleToggleTokenAutoRefresh={handleToggleTokenAutoRefresh}
        />
      </div>
      <TemplateTestPanel
        uiLocked={uiLocked}
        canTest={canTest}
        testInput={testInput}
        setTestInput={setTestInput}
        testVarsDraft={testVarsDraft}
        setTestVarsDraft={setTestVarsDraft}
        testVarsError={testVarsError}
        testRunning={testRunning}
        handleDryRun={handleDryRun}
        handleLiveTest={handleLiveTest}
        selectedTemplateName={selectedTemplateName}
        testMessage={testMessage}
        testMissingVars={testMissingVars}
        testTokenInfo={testTokenInfo}
        requestPreviewText={requestPreviewText}
        testStreamOutput={testStreamOutput}
        responsePreviewText={responsePreviewText}
      />
    </div>
  );
};
