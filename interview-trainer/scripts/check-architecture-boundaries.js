const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LAYER_ROOT = path.join(PROJECT_ROOT, "src", "interviewTrainer");
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(abs));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(abs);
    }
  }
  return files;
}

function getLayer(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.includes("/interviewTrainer/domain/")) {
    return "domain";
  }
  if (normalized.includes("/interviewTrainer/application/")) {
    return "application";
  }
  if (normalized.includes("/interviewTrainer/interface/")) {
    return "interface";
  }
  if (normalized.includes("/interviewTrainer/infra/")) {
    return "infra";
  }
  return "other";
}

function readImportSpecifiers(code) {
  const specifiers = [];
  const importFrom = /\bimport\s+[^;]*?\sfrom\s+["']([^"']+)["']/g;
  const exportFrom = /\bexport\s+[^;]*?\sfrom\s+["']([^"']+)["']/g;
  const requireCall = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  const dynamicImport = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const regex of [importFrom, exportFrom, requireCall, dynamicImport]) {
    let match;
    while ((match = regex.exec(code)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function includesAny(text, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) {
      return true;
    }
  }
  return false;
}

function validateSpecifier(layer, specifier) {
  const source = String(specifier || "");
  if (!source) {
    return null;
  }

  if (layer === "domain") {
    if (includesAny(source, ["/infra/", "/interface/", "/application/"])) {
      return "domain must not depend on infra/interface/application";
    }
    if (
      source === "fs" ||
      source.startsWith("fs/") ||
      source === "path" ||
      source === "vscode"
    ) {
      return "domain must not import fs/path/vscode";
    }
    return null;
  }

  if (layer === "interface") {
    if (includesAny(source, ["/domain/", "/infra/"])) {
      return "interface must not import domain/infra directly";
    }
    return null;
  }

  if (layer === "application") {
    if (includesAny(source, ["/interface/"])) {
      return "application must not import interface";
    }
    return null;
  }

  if (layer === "infra") {
    if (includesAny(source, ["/interface/", "/application/"])) {
      return "infra must not import interface/application";
    }
    return null;
  }

  return null;
}

function main() {
  const allFiles = walkFiles(LAYER_ROOT);
  const violations = [];

  for (const absPath of allFiles) {
    const layer = getLayer(absPath);
    if (layer === "other") {
      continue;
    }
    const code = fs.readFileSync(absPath, "utf-8");
    const specifiers = readImportSpecifiers(code);
    for (const specifier of specifiers) {
      const reason = validateSpecifier(layer, specifier);
      if (!reason) {
        continue;
      }
      violations.push({
        file: path.relative(PROJECT_ROOT, absPath).split(path.sep).join("/"),
        layer,
        specifier,
        reason,
      });
    }
  }

  if (!violations.length) {
    console.log("[arch-check] OK: no architecture boundary violations.");
    return;
  }

  console.error(`[arch-check] Found ${violations.length} architecture boundary violation(s):`);
  for (const violation of violations) {
    console.error(
      `- ${violation.file} (${violation.layer}) imports "${violation.specifier}" -> ${violation.reason}`,
    );
  }
  process.exitCode = 1;
}

main();
