const fs = require("fs");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

const E2E_DEFAULT_MAX_ATTEMPTS = 3;
const E2E_DEFAULT_RETRY_DELAY_MS = 1200;
const E2E_DEFAULT_REPORT_FILE = "build/e2e-smoke-report.json";
const E2E_DEFAULT_ARTIFACT_DIR = "build/e2e-smoke-artifacts";
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

function parseCliArgs(argv) {
  const options = {
    stages: "",
    injectFailure: "",
    maxAttempts: "",
    retryDelayMs: "",
    reportFile: "",
    validateArtifacts: false,
    validateArtifactsStrict: false,
  };

  const requireValue = (flag, index) => {
    if (index + 1 >= argv.length) {
      throw new Error(`Missing value for ${flag}`);
    }
    return argv[index + 1];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--stages") {
      options.stages = requireValue(arg, i);
      i += 1;
      continue;
    }
    if (arg === "--inject-failure") {
      options.injectFailure = requireValue(arg, i);
      i += 1;
      continue;
    }
    if (arg === "--max-attempts") {
      options.maxAttempts = requireValue(arg, i);
      i += 1;
      continue;
    }
    if (arg === "--retry-delay-ms") {
      options.retryDelayMs = requireValue(arg, i);
      i += 1;
      continue;
    }
    if (arg === "--report-file") {
      options.reportFile = requireValue(arg, i);
      i += 1;
      continue;
    }
    if (arg === "--validate-artifacts") {
      options.validateArtifacts = true;
      continue;
    }
    if (arg === "--validate-artifacts-strict") {
      options.validateArtifactsStrict = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeModeList(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function toModeMap() {
  const map = new Map();
  for (const mode of E2E_SMOKE_MODES) {
    map.set(mode.id, mode);
  }
  return map;
}

function readPositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(raw), 10);
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

async function removeDirQuiet(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
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

function ensureKnownModes(modeIds, label) {
  const known = toModeMap();
  for (const modeId of modeIds) {
    if (!known.has(modeId)) {
      throw new Error(`Unknown ${label} mode: ${modeId}`);
    }
  }
}

function resolveModes(stagesRaw) {
  const requested = normalizeModeList(stagesRaw);
  if (!requested.length) {
    return [...E2E_SMOKE_MODES];
  }
  ensureKnownModes(requested, "stage");
  const known = toModeMap();
  return requested.map((modeId) => known.get(modeId));
}

function toModeSet(raw, label) {
  const values = normalizeModeList(raw);
  ensureKnownModes(values, label);
  return new Set(values);
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
  injectFailureRequested,
}) {
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      if (injectFailureRequested && attempt === 1) {
        throw new Error(`[InjectedFailure:${mode.id}] socket hang up`);
      }
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
      attempts.push({
        attempt,
        status: "passed",
        retryable: false,
        injectedFailure: false,
        durationMs: Date.now() - attemptStartedAt,
      });
      return {
        status: "passed",
        attempts,
      };
    } catch (error) {
      const retryable = isRetryableHostError(error);
      const errorSummary = summarizeError(error);
      attempts.push({
        attempt,
        status: "failed",
        retryable,
        injectedFailure: injectFailureRequested && attempt === 1,
        durationMs: Date.now() - attemptStartedAt,
        errorSummary,
      });
      if (!retryable || attempt >= maxAttempts) {
        return {
          status: "failed",
          attempts,
          errorSummary,
        };
      }
      console.warn(
        `[e2e-smoke:${mode.id}] transient host failure on attempt ${attempt}/${maxAttempts}, retry in ${retryDelayMs}ms: ${errorSummary}`,
      );
      await delay(retryDelayMs);
    }
  }

  return {
    status: "failed",
    attempts,
    errorSummary: "unknown smoke failure",
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function validateArtifacts({ artifactDir, strict }) {
  if (!fs.existsSync(artifactDir)) {
    throw new Error(`Artifact directory not found: ${artifactDir}`);
  }
  const artifactFiles = fs
    .readdirSync(artifactDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json") && name !== "summary.json");

  if (!artifactFiles.length) {
    throw new Error(`No artifact json files found in: ${artifactDir}`);
  }

  const artifacts = artifactFiles.map((fileName) => {
    const fullPath = path.join(artifactDir, fileName);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Invalid artifact format: ${fullPath}`);
    }
    if (!parsed.modeId || !parsed.status || !Array.isArray(parsed.attempts)) {
      throw new Error(`Artifact missing required fields: ${fullPath}`);
    }
    if (!parsed.attempts.length) {
      throw new Error(`Artifact attempts cannot be empty: ${fullPath}`);
    }

    if (strict) {
      for (const [index, attempt] of parsed.attempts.entries()) {
        if (!attempt || typeof attempt !== "object") {
          throw new Error(`Artifact attempt invalid: ${fullPath}#${index}`);
        }
        if (attempt.status === "failed" && !String(attempt.errorSummary || "").trim()) {
          throw new Error(`Strict validation: missing failed attempt errorSummary: ${fullPath}#${index}`);
        }
      }
      if (parsed.injectFailureRequested) {
        if (parsed.attempts.length < 2) {
          throw new Error(`Strict validation: injected failure should require retry: ${fullPath}`);
        }
        const firstAttempt = parsed.attempts[0];
        if (firstAttempt.status !== "failed" || firstAttempt.retryable !== true) {
          throw new Error(`Strict validation: injected first attempt should be retryable failure: ${fullPath}`);
        }
      }
    }

    return parsed;
  });

  const passed = artifacts.filter((item) => item.status === "passed").length;
  const failed = artifacts.filter((item) => item.status !== "passed").length;
  return {
    fileCount: artifacts.length,
    passed,
    failed,
  };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

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

  const maxAttempts = readPositiveInt(
    cli.maxAttempts || process.env.IT_E2E_SMOKE_MAX_ATTEMPTS,
    E2E_DEFAULT_MAX_ATTEMPTS,
  );
  const retryDelayMs = readPositiveInt(
    cli.retryDelayMs || process.env.IT_E2E_SMOKE_RETRY_DELAY_MS,
    E2E_DEFAULT_RETRY_DELAY_MS,
  );
  const stagesRaw = cli.stages || process.env.IT_E2E_SMOKE_STAGES;
  const injectFailureRaw = cli.injectFailure || process.env.IT_E2E_SMOKE_INJECT_FAILURE;
  const injectFailureModes = toModeSet(injectFailureRaw, "inject-failure");
  const shouldValidateArtifacts =
    cli.validateArtifacts || process.env.IT_E2E_SMOKE_VALIDATE_ARTIFACTS === "1";
  const shouldValidateArtifactsStrict =
    cli.validateArtifactsStrict || process.env.IT_E2E_SMOKE_VALIDATE_ARTIFACTS_STRICT === "1";
  const hasStageOverride = Boolean(String(stagesRaw || "").trim());
  const validateOnly = (shouldValidateArtifacts || shouldValidateArtifactsStrict) && !hasStageOverride;

  const selectedModes = validateOnly ? [] : resolveModes(stagesRaw);
  const artifactDir = path.resolve(
    extensionDevelopmentPath,
    process.env.IT_E2E_SMOKE_ARTIFACT_DIR || E2E_DEFAULT_ARTIFACT_DIR,
  );
  const reportFile = path.resolve(
    extensionDevelopmentPath,
    cli.reportFile || process.env.IT_E2E_SMOKE_REPORT_FILE || E2E_DEFAULT_REPORT_FILE,
  );

  const previousE2EFlag = process.env.IT_E2E_ENABLE_TEST_COMMANDS;
  process.env.IT_E2E_ENABLE_TEST_COMMANDS = "1";

  const modeReports = [];
  let hasFailures = false;

  try {
    for (const mode of selectedModes) {
      const modeStartedAt = Date.now();
      const injectFailureRequested = injectFailureModes.has(mode.id);
      const modeResult = await runSmokeModeWithRetry({
        extensionDevelopmentPath,
        extensionTestsPath,
        workspaceFolderPath,
        mode,
        maxAttempts,
        retryDelayMs,
        injectFailureRequested,
      });

      const modeReport = {
        modeId: mode.id,
        description: mode.description,
        status: modeResult.status,
        injectFailureRequested,
        maxAttempts,
        retryDelayMs,
        startedAt: new Date(modeStartedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - modeStartedAt,
        attempts: modeResult.attempts,
        errorSummary: modeResult.errorSummary || "",
      };
      modeReports.push(modeReport);
      writeJson(path.join(artifactDir, `${mode.id}.json`), modeReport);
      if (modeResult.status !== "passed") {
        hasFailures = true;
      }
    }

    if (modeReports.length) {
      const summary = {
        generatedAt: new Date().toISOString(),
        modeCount: modeReports.length,
        passed: modeReports.filter((item) => item.status === "passed").length,
        failed: modeReports.filter((item) => item.status !== "passed").length,
        maxAttempts,
        retryDelayMs,
        modes: modeReports.map((item) => ({
          modeId: item.modeId,
          status: item.status,
          attemptCount: item.attempts.length,
          durationMs: item.durationMs,
        })),
      };
      writeJson(path.join(artifactDir, "summary.json"), summary);
      writeJson(reportFile, {
        ...summary,
        modes: modeReports,
      });
      console.log(`[e2e-smoke] report written: ${reportFile}`);
    }

    if (shouldValidateArtifacts || shouldValidateArtifactsStrict) {
      const validation = validateArtifacts({
        artifactDir,
        strict: shouldValidateArtifactsStrict,
      });
      console.log(
        `[e2e-smoke] artifact validation passed (${shouldValidateArtifactsStrict ? "strict" : "basic"}): files=${validation.fileCount}, passed=${validation.passed}, failed=${validation.failed}`,
      );
    }

    if (hasFailures) {
      const failedModes = modeReports
        .filter((item) => item.status !== "passed")
        .map((item) => `${item.modeId}: ${item.errorSummary || "unknown error"}`);
      throw new Error(`E2E smoke failed: ${failedModes.join(" | ")}`);
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
