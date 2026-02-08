const fs = require("fs");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

const E2E_DEFAULT_MAX_ATTEMPTS = 3;
const E2E_DEFAULT_RETRY_DELAY_MS = 1200;
const E2E_SMOKE_MODES = [
  {
    id: "workspace",
    description: "workspace-attached host smoke",
    openWorkspace: true,
    requireWorkspace: true,
  },
  {
    id: "no-workspace",
    description: "no-workspace negative smoke",
    openWorkspace: false,
    requireWorkspace: true,
  },
];
const RETRYABLE_HOST_ERROR_PATTERNS = [
  /ProcessSingleton/i,
  /already in use/i,
  /EADDRINUSE/i,
  /mutex/i,
  /lockfile/i,
  /another instance/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
];

async function removeDirQuiet(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorText(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function summarizeError(error) {
  const text = getErrorText(error).replace(/\s+/g, " ").trim();
  if (text.length <= 500) {
    return text;
  }
  return `${text.slice(0, 500)}...`;
}

function isRetryableHostError(error) {
  const text = getErrorText(error);
  return RETRYABLE_HOST_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function withEnvVar(name, value, run) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    });
}

async function runSmokeAttempt({
  extensionDevelopmentPath,
  extensionTestsPath,
  workspaceFolderPath,
  mode,
  attempt,
  maxAttempts,
}) {
  const runKey = `${Date.now()}-${Math.random().toString(16).slice(2)}-${mode.id}-a${attempt}`;
  const profileRoot = path.resolve(
    extensionDevelopmentPath,
    ".vscode-test",
    "profiles",
    runKey,
  );
  const userDataDir = path.join(profileRoot, "user-data");
  const extensionsDir = path.join(profileRoot, "extensions");

  await fs.promises.mkdir(userDataDir, { recursive: true });
  await fs.promises.mkdir(extensionsDir, { recursive: true });

  const launchArgs = [
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    "--disable-extensions",
  ];
  if (mode.openWorkspace) {
    launchArgs.push(workspaceFolderPath);
  }

  console.log(
    `[e2e-smoke:${mode.id}] attempt ${attempt}/${maxAttempts}: launching VS Code host (${mode.description})`,
  );

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
    });
  } finally {
    await removeDirQuiet(profileRoot);
  }
}

async function runSmokeModeWithRetry({
  extensionDevelopmentPath,
  extensionTestsPath,
  workspaceFolderPath,
  mode,
  maxAttempts,
  retryDelayMs,
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await withEnvVar("IT_E2E_SMOKE_MODE", mode.id, () =>
        withEnvVar("IT_E2E_REQUIRE_WORKSPACE", mode.requireWorkspace ? "1" : "0", () =>
          runSmokeAttempt({
            extensionDevelopmentPath,
            extensionTestsPath,
            workspaceFolderPath,
            mode,
            attempt,
            maxAttempts,
          }),
        ),
      );
      console.log(`[e2e-smoke:${mode.id}] attempt ${attempt}/${maxAttempts}: passed`);
      return;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableHostError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      console.warn(
        `[e2e-smoke:${mode.id}] transient host failure on attempt ${attempt}/${maxAttempts}, retry in ${retryDelayMs}ms: ${summarizeError(error)}`,
      );
      await delay(retryDelayMs);
    }
  }

  throw lastError || new Error(`Unknown smoke failure in mode: ${mode.id}`);
}

async function main() {
  // In some shells this is set globally and forces Electron into Node mode,
  // which breaks VS Code test launch args (seen as "bad option").
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const workspaceFolderPath = path.resolve(extensionDevelopmentPath, "..");
  const extensionTestsPath = path.resolve(
    __dirname,
    "..",
    "test",
    "e2e",
    "smoke",
    "index.js",
  );

  const maxAttempts = readPositiveIntEnv(
    "IT_E2E_SMOKE_MAX_ATTEMPTS",
    E2E_DEFAULT_MAX_ATTEMPTS,
  );
  const retryDelayMs = readPositiveIntEnv(
    "IT_E2E_SMOKE_RETRY_DELAY_MS",
    E2E_DEFAULT_RETRY_DELAY_MS,
  );

  const previousE2EFlag = process.env.IT_E2E_ENABLE_TEST_COMMANDS;
  process.env.IT_E2E_ENABLE_TEST_COMMANDS = "1";

  try {
    for (const mode of E2E_SMOKE_MODES) {
      await runSmokeModeWithRetry({
        extensionDevelopmentPath,
        extensionTestsPath,
        workspaceFolderPath,
        mode,
        maxAttempts,
        retryDelayMs,
      });
    }
  } finally {
    if (previousE2EFlag === undefined) {
      delete process.env.IT_E2E_ENABLE_TEST_COMMANDS;
    } else {
      process.env.IT_E2E_ENABLE_TEST_COMMANDS = previousE2EFlag;
    }
  }
}

main().catch((error) => {
  console.error("E2E smoke test failed", error);
  process.exit(1);
});
