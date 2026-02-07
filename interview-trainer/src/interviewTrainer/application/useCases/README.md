# application/useCases

用例入口（流程编排）。

- 面向具体业务场景的流程调度。
- 调用 domain/ 与 application/services。
- I/O 交由 infra 处理。
- `it_saveCurrentResult.ts`: save current analyze result and session metadata.
- `it_testLlm.ts`: LLM connectivity test use-case.
- `it_testAsr.ts`: ASR connectivity test use-case.
- `it_testEmbedding.ts`: embedding connectivity test use-case.
- `it_environmentConfig.ts`: environment/config update use-cases for Webview setting events.
