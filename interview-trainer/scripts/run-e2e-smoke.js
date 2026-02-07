const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  // In some shells this is set globally and forces Electron into Node mode,
  // which breaks VS Code test launch args (seen as "bad option").
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "..", "test", "e2e", "smoke", "index.js");
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-extensions"],
  });
}

main().catch((error) => {
  console.error("E2E smoke test failed", error);
  process.exit(1);
});
