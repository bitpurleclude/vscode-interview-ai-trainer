import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "webview/src/**/*.test.ts",
      "src/interviewTrainer/domain/notes/**/*.test.ts",
      "src/interviewTrainer/infra/utils/**/*.test.ts",
      "src/interviewTrainer/infra/api/**/*.test.ts",
      "src/interviewTrainer/infra/notes/**/*.test.ts",
      "src/interviewTrainer/application/services/**/*.test.ts",
      "src/interviewTrainer/application/useCases/**/*.test.ts",
      "src/interviewTrainer/application/flows/**/*.test.ts",
      "src/interviewTrainer/interface/**/*.test.ts",
      "src/webview/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/interviewTrainer/application/flows/**/*.ts",
        "src/interviewTrainer/application/useCases/**/*.ts",
        "src/interviewTrainer/application/services/**/*.ts",
        "src/interviewTrainer/interface/handlers/**/*.ts",
        "src/webview/WebviewProtocol.ts",
        "webview/src/messenger.ts",
        "webview/src/hooks/useAnalysisFlow.ts",
        "webview/src/utils/**/*.ts",
        "webview/src/utils/**/*.tsx",
        "scripts/run-e2e-smoke.js",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 45,
        functions: 45,
        branches: 35,
        statements: 45,
      },
    },
  },
});
