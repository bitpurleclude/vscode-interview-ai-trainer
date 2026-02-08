const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const FIXTURE_ANALYZE_COMMAND = "itInterviewTrainer.__test.runFixtureAnalyze";
const WEBVIEW_UI_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewUiClickFlow";
const WEBVIEW_ANALYZE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewAnalyzeFlow";
const WEBVIEW_CANCEL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewCancelFlow";
const WEBVIEW_SAVE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewSaveResultFlow";

const SMOKE_MODE = String(process.env.IT_E2E_SMOKE_MODE || "workspace").toLowerCase();
const WORKSPACE_ERROR_CODE = "workspace_not_found";

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function isWorkspaceErrorMessage(value) {
  const text = String(value || "");
  return /workspace not found/i.test(text) || /workspace_not_found/i.test(text);
}

function assertNoWorkspaceError(value, label) {
  assert.ok(
    !isWorkspaceErrorMessage(value),
    `${label} should not fail due to missing workspace: ${String(value || "")}`,
  );
}

function assertWorkspaceErrorPayload(payload, label) {
  assert.ok(payload && typeof payload === "object", `${label} should return an object payload`);
  assert.strictEqual(
    payload.errorCode,
    WORKSPACE_ERROR_CODE,
    `${label} should include structured workspace errorCode`,
  );
  const userMessage = String(payload.userMessage || "");
  assert.ok(userMessage.length > 0, `${label} should expose user-readable workspace message`);

  const errorText = String(payload.error || "");
  assert.ok(
    isWorkspaceErrorMessage(errorText) || errorText.length > 0,
    `${label} should expose workspace error text: ${JSON.stringify(payload)}`,
  );
}

async function activateExtension() {
  const extensionId = "interview-trainer.interview-trainer";
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Extension not found: ${extensionId}`);
  if (!extension.isActive) {
    await extension.activate();
  }
  assert.strictEqual(extension.isActive, true, "Extension activation failed");
  return extension;
}

async function executeCommandAndAssert(commandId, timeoutMs = 10_000) {
  return await withTimeout(vscode.commands.executeCommand(commandId), timeoutMs, commandId);
}

function resolveFixtureFile(fixtureDir, matcher, label) {
  const entries = fs.readdirSync(fixtureDir, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && matcher(entry.name));
  assert.ok(match, `Missing ${label} fixture in ${fixtureDir}`);
  return path.join(fixtureDir, match.name);
}

async function assertFixtureFilesReachable(extension) {
  const repoRoot = path.resolve(extension.extensionPath, "..");
  const fixtureDir = path.join(repoRoot, "testdata");
  assert.ok(fs.existsSync(fixtureDir), `Missing fixture directory: ${fixtureDir}`);

  const markdownFixture = resolveFixtureFile(
    fixtureDir,
    (name) => name.toLowerCase().endsWith(".md"),
    "markdown",
  );
  const audioFixture = resolveFixtureFile(
    fixtureDir,
    (name) => /\.(m4a|wav|mp3|aac)$/i.test(name),
    "audio",
  );

  [markdownFixture, audioFixture].forEach((fixturePath) => {
    const stats = fs.statSync(fixturePath);
    assert.ok(stats.size > 0, `Fixture file is empty: ${fixturePath}`);
  });

  const markdownDoc = await withTimeout(
    vscode.workspace.openTextDocument(vscode.Uri.file(markdownFixture)),
    10_000,
    "open markdown fixture",
  );
  assert.ok(markdownDoc.lineCount > 0, "Markdown fixture should have at least one line");

  const audioStat = await withTimeout(
    vscode.workspace.fs.stat(vscode.Uri.file(audioFixture)),
    10_000,
    "stat audio fixture",
  );
  assert.ok(audioStat.size > 1024, "Audio fixture should be larger than 1KB");
}

function assertFixtureAnalyzeResult(result, options = {}) {
  const { forbidWorkspaceError = false } = options;
  assert.ok(result && typeof result === "object", "Fixture analyze result should be an object");
  assert.ok(
    result.status === "success" || result.status === "error",
    `Unexpected fixture analyze status: ${String(result.status)}`,
  );

  if (result.status === "success") {
    assert.ok(
      typeof result.questionCount === "number" && result.questionCount > 0,
      "Fixture analyze success should include positive questionCount",
    );
    assert.ok(
      typeof result.reportPath === "string" && result.reportPath.length > 0,
      "Fixture analyze success should include reportPath",
    );
    return;
  }

  assert.ok(
    typeof result.error === "string" && result.error.length > 0,
    "Fixture analyze error should include readable message",
  );
  if (forbidWorkspaceError) {
    assertNoWorkspaceError(result.error, "Fixture analyze");
    assertNoWorkspaceError(result.stateError, "Fixture analyze stateError");
    assert.notStrictEqual(
      result.errorCode,
      WORKSPACE_ERROR_CODE,
      "Fixture analyze should not return workspace_not_found in workspace mode",
    );
  }
}

function assertWebviewUiFlowResult(result) {
  assert.ok(result && typeof result === "object", "Webview UI flow result should be an object");
  assert.strictEqual(
    result.status,
    "success",
    `Webview UI flow failed: ${JSON.stringify(result)}`,
  );
  assert.ok(Array.isArray(result.steps), "Webview UI flow should include steps");
  assert.ok(result.steps.length >= 3, "Webview UI flow should include at least 3 steps");

  const failedSteps = result.steps.filter((step) => step?.ok === false);
  assert.strictEqual(
    failedSteps.length,
    0,
    `Webview UI flow contains failed steps: ${JSON.stringify(failedSteps)}`,
  );
  assert.strictEqual(result.activePage, "practice", "Webview UI flow should end on practice page");
}

function assertWebviewAnalyzeFlowResult(result, options = {}) {
  const { forbidWorkspaceError = false } = options;
  assert.ok(result && typeof result === "object", "Webview analyze flow result should be an object");
  assert.ok(
    result.status === "success" || result.status === "error",
    `Unexpected webview analyze status: ${JSON.stringify(result)}`,
  );
  assert.ok(Array.isArray(result.steps), "Webview analyze flow should include steps");
  assert.ok(result.steps.length >= 5, "Webview analyze flow should include critical lifecycle steps");

  const stepMap = new Map(result.steps.map((step) => [step.action, step]));
  [
    "fill-question-state",
    "import-audio-file",
    "wait-audio-summary",
    "wait-analyze-enabled",
    "click-analyze-button",
  ].forEach((action) => {
    const step = stepMap.get(action);
    assert.ok(step, `Webview analyze flow missing step: ${action}`);
    assert.strictEqual(step.ok, true, `Webview analyze step failed: ${action}`);
  });

  if (result.status === "success") {
    assert.ok(
      typeof result.overallScoreText === "string" && result.overallScoreText.length > 0,
      "Webview analyze success should return non-empty overallScoreText",
    );
    return;
  }

  assert.ok(
    typeof result.error === "string" && result.error.length > 0,
    "Webview analyze error should include readable message",
  );
  if (forbidWorkspaceError) {
    assertNoWorkspaceError(result.error, "Webview analyze");
    assert.notStrictEqual(
      result.errorCode,
      WORKSPACE_ERROR_CODE,
      "Webview analyze should not return workspace_not_found in workspace mode",
    );
  }
}

function assertWebviewCancelFlowResult(result) {
  assert.ok(result && typeof result === "object", "Webview cancel flow result should be an object");
  assert.strictEqual(
    result.status,
    "success",
    `Webview cancel flow failed: ${JSON.stringify(result)}`,
  );
  assert.ok(Array.isArray(result.steps), "Webview cancel flow should include steps");

  const stepMap = new Map(result.steps.map((step) => [step.action, step]));
  const clickAnalyzeStep = stepMap.get("click-analyze-button");
  assert.ok(clickAnalyzeStep, "Webview cancel flow missing step: click-analyze-button");
  assert.strictEqual(clickAnalyzeStep.ok, true, "Webview cancel step failed: click-analyze-button");

  const skippedStep = stepMap.get("skip-cancel-no-running-state");
  if (skippedStep) {
    assert.strictEqual(
      skippedStep.ok,
      true,
      `Webview cancel skip marker should be ok: ${JSON.stringify(skippedStep)}`,
    );
    return;
  }

  ["wait-analyze-running", "click-cancel-button", "wait-cancel-complete"].forEach((action) => {
    const step = stepMap.get(action);
    assert.ok(step, `Webview cancel flow missing step: ${action}`);
    assert.strictEqual(step.ok, true, `Webview cancel step failed: ${action}`);
  });
}

function assertWebviewSaveFlowResult(result) {
  assert.ok(result && typeof result === "object", "Webview save flow result should be an object");
  assert.strictEqual(
    result.status,
    "success",
    `Webview save flow failed: ${JSON.stringify(result)}`,
  );
  assert.ok(Array.isArray(result.steps), "Webview save flow should include steps");

  const stepMap = new Map(result.steps.map((step) => [step.action, step]));
  ["click-save-result-button", "assert-save-feedback"].forEach((action) => {
    const step = stepMap.get(action);
    assert.ok(step, `Webview save flow missing step: ${action}`);
    assert.strictEqual(step.ok, true, `Webview save step failed: ${action}`);
  });

  assert.ok(
    typeof result.saveFeedback === "string" && result.saveFeedback.length > 0,
    "Webview save flow should return non-empty saveFeedback",
  );
}

function assertExpectedCommandsPresent(allCommands) {
  [
    "itInterviewTrainer.open",
    "itInterviewTrainer.openSettings",
    "itInterviewTrainer.openHistory",
    "itInterviewTrainer.analyzeAudioFile",
    "itInterviewTrainer.mainView.focus",
    FIXTURE_ANALYZE_COMMAND,
    WEBVIEW_UI_FLOW_COMMAND,
    WEBVIEW_ANALYZE_FLOW_COMMAND,
    WEBVIEW_CANCEL_FLOW_COMMAND,
    WEBVIEW_SAVE_FLOW_COMMAND,
  ].forEach((commandId) => {
    assert.ok(allCommands.includes(commandId), `Missing command: ${commandId}`);
  });
}

async function runWorkspaceSmoke(extension) {
  await assertFixtureFilesReachable(extension);

  await executeCommandAndAssert("itInterviewTrainer.mainView.focus");
  await executeCommandAndAssert("itInterviewTrainer.open");
  await executeCommandAndAssert("itInterviewTrainer.openSettings");
  await executeCommandAndAssert("itInterviewTrainer.openHistory");
  await executeCommandAndAssert("itInterviewTrainer.open");

  const fixtureAnalyzeResult = await executeCommandAndAssert(
    FIXTURE_ANALYZE_COMMAND,
    120_000,
  );
  assertFixtureAnalyzeResult(fixtureAnalyzeResult, { forbidWorkspaceError: true });

  const webviewUiFlowResult = await executeCommandAndAssert(
    WEBVIEW_UI_FLOW_COMMAND,
    60_000,
  );
  assertWebviewUiFlowResult(webviewUiFlowResult);

  const webviewAnalyzeFlowResult = await executeCommandAndAssert(
    WEBVIEW_ANALYZE_FLOW_COMMAND,
    120_000,
  );
  assertWebviewAnalyzeFlowResult(webviewAnalyzeFlowResult, { forbidWorkspaceError: true });

  const webviewCancelFlowResult = await executeCommandAndAssert(
    WEBVIEW_CANCEL_FLOW_COMMAND,
    120_000,
  );
  assertWebviewCancelFlowResult(webviewCancelFlowResult);

  const webviewSaveFlowResult = await executeCommandAndAssert(
    WEBVIEW_SAVE_FLOW_COMMAND,
    120_000,
  );
  assertWebviewSaveFlowResult(webviewSaveFlowResult);
}

async function runNoWorkspaceSmoke() {
  await executeCommandAndAssert("itInterviewTrainer.mainView.focus");
  await executeCommandAndAssert("itInterviewTrainer.open");

  const fixtureAnalyzeResult = await executeCommandAndAssert(
    FIXTURE_ANALYZE_COMMAND,
    30_000,
  );
  assert.strictEqual(
    fixtureAnalyzeResult?.status,
    "error",
    `No-workspace smoke should return error for fixture analyze: ${JSON.stringify(fixtureAnalyzeResult)}`,
  );
  assertWorkspaceErrorPayload(
    fixtureAnalyzeResult,
    "No-workspace fixture analyze",
  );

  const webviewAnalyzeFlowResult = await executeCommandAndAssert(
    WEBVIEW_ANALYZE_FLOW_COMMAND,
    30_000,
  );
  assert.strictEqual(
    webviewAnalyzeFlowResult?.status,
    "error",
    `No-workspace smoke should return error for webview analyze: ${JSON.stringify(webviewAnalyzeFlowResult)}`,
  );
  assertWorkspaceErrorPayload(
    webviewAnalyzeFlowResult,
    "No-workspace webview analyze",
  );
}

async function runSmoke(extension) {
  const allCommands = await vscode.commands.getCommands(true);
  assertExpectedCommandsPresent(allCommands);

  if (SMOKE_MODE === "no-workspace") {
    await runNoWorkspaceSmoke();
  } else {
    await runWorkspaceSmoke(extension);
  }

  assert.strictEqual(extension.isActive, true, "Extension became inactive during smoke commands");
}

async function run() {
  const extension = await activateExtension();
  await runSmoke(extension);
}

module.exports = {
  run,
};
