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
- `it_questionActions.ts`: question parse and demo-regeneration use-cases for Webview commands.
- `it_retrievalActions.ts`: retrieval settings and cache-maintenance use-cases for Webview commands.
- `it_templateActions.ts`: template/secrets/tokens use-cases for Webview commands.
- `it_workspaceActions.ts`: workspace and sessions directory selection use-cases.
- `it_providerActions.ts`: provider profile create/save/open use-cases for Webview commands.
- `it_coreActions.ts`: core webview actions (config/history/settings/reload) use-cases.
- `it_recordingActions.ts`: recording controls and audio-to-PCM conversion use-cases.
- `it_templateTestActions.ts`: template dry-run/live test orchestration use-cases for Webview commands.
- `it_resultActions.ts`: result-view actions (open file/analyze/cancel) use-cases for Webview commands.
- `it_analysisFlow.ts`: end-to-end analysis run use-case; session state is delegated to `application/services/it_analysisSessionState.ts`, run deps are delegated to `application/services/it_analysisRunConfig.ts`.
