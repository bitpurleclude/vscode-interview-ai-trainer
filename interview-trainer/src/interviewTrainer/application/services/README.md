# application/services

Application service layer (cross-use-case reuse).
- Aggregates config, logging, progress, token, evaluation, and other capabilities.
- Avoids direct coupling to UI and exposes business-level APIs.
- Added:
  - `it_asrTranscription.ts`: ASR request orchestration and template tracing.
  - `it_topicTitle.ts`: LLM topic-title generation and title sanitizing bridge.
  - `it_analysisPersistence.ts`: persistence for analysis result/report/session metadata.
  - `it_webviewPort.ts`: application-level webview messaging port types.
  - `it_configGateway.ts`: config-related application gateway.
  - `it_templateGateway.ts`: template runtime/execute gateway.
  - `it_storageGateway.ts`: report/session/history/cache storage gateway.
  - `it_llmGateway.ts` / `it_embeddingGateway.ts` / `it_asrGateway.ts`: provider API gateways.
  - `it_notesGateway.ts` / `it_textGateway.ts`: notes cache and utility gateways.
  - `it_tokens.ts` / `it_topicTitle.ts`: now consume application gateways instead of direct infra imports.
