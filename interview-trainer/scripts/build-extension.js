const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const entry = path.join(root, "src", "extension.ts");
const outfile = path.join(root, "out", "extension.js");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

esbuild
  .build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    target: "node16",
    format: "cjs",
    sourcemap: false,
    logLevel: "info",
    external: ["vscode"],
  })
  .catch(() => process.exit(1));
