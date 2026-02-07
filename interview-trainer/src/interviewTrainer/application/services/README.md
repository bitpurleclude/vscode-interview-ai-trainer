# application/services

Application service layer (cross-use-case reuse).
- Aggregates config, logging, progress, token, evaluation, and other capabilities.
- Avoids direct coupling to UI and exposes business-level APIs.
- Added:
  - `it_asrTranscription.ts`: ASR request orchestration and template tracing.
  - `it_topicTitle.ts`: LLM topic-title generation and title sanitizing bridge.
  - `it_analysisPersistence.ts`: persistence for analysis result/report/session metadata.
