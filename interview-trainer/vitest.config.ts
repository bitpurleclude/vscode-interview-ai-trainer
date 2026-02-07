import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "webview/src/**/*.test.ts",
      "src/interviewTrainer/domain/notes/**/*.test.ts",
      "src/interviewTrainer/infra/utils/**/*.test.ts",
      "src/interviewTrainer/infra/api/**/*.test.ts",
      "src/interviewTrainer/application/services/**/*.test.ts",
      "src/interviewTrainer/application/useCases/**/*.test.ts",
      "src/webview/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "webview/src/utils/format.ts",
        "webview/src/utils/template.ts",
        "webview/src/utils/questions.ts",
        "webview/src/utils/outline.tsx",
        "src/interviewTrainer/domain/notes/utils.ts",
        "src/interviewTrainer/domain/notes/ranking.ts",
        "src/interviewTrainer/infra/utils/it_text.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
