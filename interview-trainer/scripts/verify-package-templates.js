#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const Module = require("module");
const YAML = require("yaml");
const esbuild = require("esbuild");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
      continue;
    }
    fs.copyFileSync(src, dest);
  }
}

function safeRun(command, cwd) {
  return childProcess.execSync(command, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function checkVsixContainsTemplates(projectRoot) {
  const vsixPath = path.join(projectRoot, "build", "interview-trainer.vsix");
  assert(fs.existsSync(vsixPath), `VSIX not found: ${vsixPath}`);

  let treeText = "";
  try {
    treeText = safeRun(`tar -tf "${vsixPath}"`, projectRoot);
  } catch (error) {
    throw new Error(
      `Unable to inspect VSIX with tar. Build might still be fine. Detail: ${String(error)}`,
    );
  }

  const requiredEntries = [
    "extension/config/templates.siliconflow.example.yaml",
    "extension/config/templates.volc-ark.example.yaml",
    "extension/config/templates.baidu-asr-token.example.yaml",
  ];

  for (const entry of requiredEntries) {
    assert(treeText.includes(entry), `Missing packaged template file: ${entry}`);
  }
}

function runMergeBehaviorCheck(projectRoot) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "it-vsix-template-verify-"));
  const extensionPath = path.join(tempRoot, "extension");
  const globalStorageRoot = path.join(tempRoot, "globalStorage");
  const userConfigDir = path.join(globalStorageRoot, "interview_trainer");
  fs.mkdirSync(userConfigDir, { recursive: true });

  copyDir(path.join(projectRoot, "config"), path.join(extensionPath, "config"));

  const existingTemplates = {
    version: 1,
    environments: {
      prod: {
        templates: {
          "llm:volc-ark-chat": {
            id: "llm:volc-ark-chat",
            name: "User Override Template",
            category: "llm",
            request: { method: "POST", url: "https://example.com/custom" },
            response: { mode: "json", textPath: "choices[0].message.content" },
          },
        },
        bindings: {
          llm: { evaluation: "llm:volc-ark-chat" },
          asr: { transcription: "asr:user-existing" },
          embedding: {},
        },
        secrets: ["user_secret"],
        param_options: { reasoning_effort: ["custom_only"] },
        token_options: { auto_refresh: false },
      },
    },
  };
  fs.writeFileSync(
    path.join(userConfigDir, "templates.yaml"),
    YAML.stringify(existingTemplates),
    "utf8",
  );

  const apiConfigSourcePath = path.join(
    projectRoot,
    "src",
    "interviewTrainer",
    "infra",
    "api",
    "it_apiConfig.ts",
  );
  assert(fs.existsSync(apiConfigSourcePath), `Source file missing: ${apiConfigSourcePath}`);
  const bundledApiConfigPath = path.join(tempRoot, "it_apiConfig.bundle.cjs");
  esbuild.buildSync({
    entryPoints: [apiConfigSourcePath],
    outfile: bundledApiConfigPath,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    external: ["vscode"],
  });

  const originalModuleLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return {};
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };

  let itEnsureConfigFiles = null;
  try {
    ({ it_ensureConfigFiles: itEnsureConfigFiles } = require(bundledApiConfigPath));
  } finally {
    Module._load = originalModuleLoad;
  }
  assert(typeof itEnsureConfigFiles === "function", "Failed to load it_ensureConfigFiles");

  itEnsureConfigFiles({
    extensionPath,
    globalStorageUri: { fsPath: globalStorageRoot },
  });

  const mergedPath = path.join(userConfigDir, "templates.yaml");
  assert(fs.existsSync(mergedPath), "Merged templates.yaml is missing");
  const merged = YAML.parse(fs.readFileSync(mergedPath, "utf8")) || {};
  const prod = merged?.environments?.prod || {};

  assert(
    prod?.templates?.["llm:volc-ark-chat"]?.name === "User Override Template",
    "Existing template was unexpectedly overwritten",
  );
  assert(
    Boolean(prod?.templates?.["llm:siliconflow-chat"]),
    "SiliconFlow example template not merged",
  );
  assert(
    Boolean(prod?.templates?.["token:baidu-asr-access-token"]),
    "Baidu token template not merged",
  );
  assert(
    Boolean(prod?.templates?.["asr:baidu-vop-token"]),
    "Baidu ASR template not merged",
  );
  assert(
    prod?.bindings?.asr?.transcription === "asr:user-existing",
    "Existing ASR binding should not be overwritten",
  );
  assert(
    Array.isArray(prod?.secrets) && prod.secrets.includes("user_secret"),
    "Existing secrets should be preserved",
  );
  assert(
    Array.isArray(prod?.secrets) && prod.secrets.includes("ark_api_key"),
    "Example secrets should be appended",
  );
  assert(
    prod?.token_options?.auto_refresh === false,
    "Existing token_options.auto_refresh should not be overwritten",
  );

  const requiredBaseFiles = [
    "api_config.yaml",
    "skill_config.yaml",
    "guardrails.yaml",
  ];
  for (const filename of requiredBaseFiles) {
    assert(
      fs.existsSync(path.join(userConfigDir, filename)),
      `Base config file not copied: ${filename}`,
    );
  }

  return tempRoot;
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  checkVsixContainsTemplates(projectRoot);
  const tempRoot = runMergeBehaviorCheck(projectRoot);
  console.log("verify-package-templates: OK");
  console.log(`temporary verification workspace: ${tempRoot}`);
}

try {
  main();
} catch (error) {
  console.error("verify-package-templates: FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
