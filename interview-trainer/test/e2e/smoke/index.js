const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

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

async function executeCommandAndAssert(commandId) {
  await withTimeout(vscode.commands.executeCommand(commandId), 10_000, commandId);
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

async function runSmoke(extension) {
  const allCommands = await vscode.commands.getCommands(true);
  [
    "itInterviewTrainer.open",
    "itInterviewTrainer.openSettings",
    "itInterviewTrainer.openHistory",
    "itInterviewTrainer.analyzeAudioFile",
    "itInterviewTrainer.mainView.focus",
  ].forEach((commandId) => {
    assert.ok(allCommands.includes(commandId), `Missing command: ${commandId}`);
  });

  await assertFixtureFilesReachable(extension);

  await executeCommandAndAssert("itInterviewTrainer.mainView.focus");
  await executeCommandAndAssert("itInterviewTrainer.open");
  await executeCommandAndAssert("itInterviewTrainer.openSettings");
  await executeCommandAndAssert("itInterviewTrainer.openHistory");
  await executeCommandAndAssert("itInterviewTrainer.open");

  assert.strictEqual(extension.isActive, true, "Extension became inactive during smoke commands");
}

async function run() {
  const extension = await activateExtension();
  await runSmoke(extension);
}

module.exports = {
  run,
};
