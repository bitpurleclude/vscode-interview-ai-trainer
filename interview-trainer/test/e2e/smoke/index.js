const assert = require("assert");
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
