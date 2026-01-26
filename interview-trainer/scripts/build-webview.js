/* eslint-disable no-console */
const path = require("path");
const esbuild = require("esbuild");

async function build() {
  const entry = path.join(__dirname, "..", "webview", "src", "main.tsx");
  const outdir = path.join(__dirname, "..", "media");
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    sourcemap: false,
    outdir,
    entryNames: "main",
    assetNames: "assets/[name]",
    format: "iife",
    target: ["es2020"],
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
      ".css": "css",
    },
    define: {
      "process.env.NODE_ENV": "\"production\"",
    },
  });
  console.log("Webview build complete.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
