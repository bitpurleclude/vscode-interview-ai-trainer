const fs = require("fs");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function removeDirQuiet(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}

async function main() {
  // In some shells this is set globally and forces Electron into Node mode,
  // which breaks VS Code test launch args (seen as "bad option").
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "..", "test", "e2e", "smoke", "index.js");
  const runKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const profileRoot = path.resolve(extensionDevelopmentPath, ".vscode-test", "profiles", runKey);
  const userDataDir = path.join(profileRoot, "user-data");
  const extensionsDir = path.join(profileRoot, "extensions");

  await fs.promises.mkdir(userDataDir, { recursive: true });
  await fs.promises.mkdir(extensionsDir, { recursive: true });

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        "--disable-extensions",
      ],
    });
  } finally {
    await removeDirQuiet(profileRoot);
  }
}

main().catch((error) => {
  console.error("E2E smoke test failed", error);
  process.exit(1);
});
