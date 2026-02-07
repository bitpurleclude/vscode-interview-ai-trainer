const assert = require("assert");
const vscode = require("vscode");

async function activateExtension() {
  const extensionId = "interview-trainer.interview-trainer";
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Extension not found: ${extensionId}`);
  if (!extension.isActive) {
    await extension.activate();
  }
  assert.strictEqual(extension.isActive, true, "Extension activation failed");
}

async function runSmoke() {
  const allCommands = await vscode.commands.getCommands(true);
  [
    "itInterviewTrainer.open",
    "itInterviewTrainer.openSettings",
    "itInterviewTrainer.openHistory",
    "itInterviewTrainer.analyzeAudioFile",
  ].forEach((commandId) => {
    assert.ok(allCommands.includes(commandId), `Missing command: ${commandId}`);
  });

  await vscode.commands.executeCommand("itInterviewTrainer.open");
  await vscode.commands.executeCommand("itInterviewTrainer.openSettings");
  await vscode.commands.executeCommand("itInterviewTrainer.openHistory");
}

async function run() {
  await activateExtension();
  await runSmoke();
}

module.exports = {
  run,
};
