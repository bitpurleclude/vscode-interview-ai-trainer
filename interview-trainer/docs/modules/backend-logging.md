# Backend Logging Module

## Scope
The backend logging module provides structured runtime diagnostics for extension workflows.
It is used by analysis, template execution traces, test helpers, and host-level failures.

## Key Files
- `src/interviewTrainer/application/services/it_logging.ts`
- `src/interviewTrainer/application/services/it_logging.test.ts`
- `src/interviewTrainer/application/services/it_structuredLogger.ts`
- `src/interviewTrainer/application/services/it_logSinkGateway.ts`
- `src/interviewTrainer/application/services/it_extensionRecording.ts`
- `src/interviewTrainer/application/services/it_analysisPersistence.ts`
- `src/interviewTrainer/application/services/it_evaluationLlm.ts`
- `src/interviewTrainer/application/useCases/it_saveCurrentResult.ts`
- `src/interviewTrainer/application/useCases/it_retrievalActions.ts`
- `src/interviewTrainer/infra/api/it_configService.ts`
- `src/interviewTrainer/infra/api/it_embedding.ts`
- `src/interviewTrainer/infra/notes/cache_embedding.ts`
- `src/interviewTrainer/infra/notes/indexer_dirty.ts`
- `src/interviewTrainer/infra/notes/cache_warmup.ts`
- `src/interviewTrainer/infra/storage/it_cache.ts`
- `src/interviewTrainer/infra/logging/it_outputChannelLogSink.ts`
- `src/interviewTrainer/infra/logging/it_traceLogger.ts`
- `src/interviewTrainer/interface/handlers/it_webviewHandlerLogging.ts`
- `src/webview/WebviewProtocol.ts`

## Structured Log Contract
Each line emitted to the output channel is a JSON object with stable fields:
- `ts`
- `level`
- `event`
- `layer`
- `module`
- `runId` (optional)
- `requestId` (optional)
- `stage` (optional)
- `status` (optional)
- `errorCode` (optional)
- `message`
- `detail` (optional, sanitized and size-limited)

## Guardrails
Logging limits and policy come from `config/guardrails.yaml` under `logging`.
Runtime parsing and clamping are centralized in:
- `src/interviewTrainer/application/services/it_guardrails.ts`

Current logging guardrails:
- `message_max_chars`
- `detail_max_chars`
- `detail_max_depth`
- `detail_max_keys_per_object`
- `detail_max_items_per_array`
- `emit_error_when_trace_disabled`

## Runtime Policy
- Trace switch enabled: emit `debug/info/warn/error`.
- Trace switch disabled: emit `error` only (controlled by guardrail policy); `logCorpusTrace` auto-promotes `status=error` into `error` level.
- Sensitive keys (`api_key`, `token`, `authorization`, etc.) are masked.
- Binary payload-like fields (`audio`, `base64`, `speech`, etc.) are summarized by length.

## Notes for Contributors
- Do not call `outputChannel.appendLine` directly for business logs.
- Emit logs through application-level structured logger utilities.
- Interface handlers should wrap routes with `it_runLoggedHandler` to keep request/success/error boundaries consistent.
- When adding a new event family, keep `event` names stable for test assertions.
- Any logging-limit change must update:
  - `config/guardrails.yaml`
  - `it_guardrails.ts`
  - relevant tests and docs

## Protocol anomaly events
When protocol-level guardrails are hit, logs emit stable error/warn events:
- `protocol.webview.request_unhandled`
- `protocol.webview.request_error`
- `protocol.webview.broadcast_handler_error`
- `protocol.webview.send_error`
- `protocol.webview.invalid_message`
- `protocol.webview.send_without_webview`

Unknown request messages with `messageId` now return a structured error payload (`errorCode=handler_not_found`) instead of hanging the pending request promise.


## Additional event families (P8)
- Command entry events:
  - `extension.command.open`
  - `extension.command.analyze_audio_file`
  - `extension.command.open_settings`
  - `extension.command.open_history`
- Token lifecycle events:
  - `application.tokens.sync`
  - `application.tokens.refresh_all`
  - `application.tokens.refresh_single`
  - `application.tokens.schedule`
  - `application.tokens.snapshot_push`
- Webview messenger telemetry events (reported via `it/clientTrace`):
  - `webview.messenger.request_sent`
  - `webview.messenger.response_received`
  - `webview.messenger.request_timeout`
  - `webview.messenger.orphan_response`
  - `webview.messenger.listener_error`
  - `webview.messenger.invalid_message`


## Additional event families (P9)
- Config service events:
  - `infra.config.load_bundle`
  - `infra.config.save_api`
  - `infra.config.save_skill`
  - `infra.config.save_templates`
  - `infra.config.save_provider`
  - `infra.config.ensure_templates`
- Recording lifecycle events:
  - `application.recording.find_ffmpeg`
  - `application.recording.detect_input`
  - `application.recording.probe`
  - `application.recording.list_inputs`
  - `application.recording.start`
  - `application.recording.stop`
- Persistence and save-result events:
  - `application.persistence.persist_analysis`
  - `application.persistence.append_report`
  - `application.persistence.append_attempt`
  - `application.persistence.read_topic_meta`
  - `application.persistence.write_topic_meta`
  - `application.save_result.save_current`
  - `application.save_result.append_report`
  - `application.save_result.append_attempt`
  - `application.save_result.write_topic_meta`
- Retrieval cache maintenance events:
  - `application.retrieval.set_enabled`
  - `application.retrieval.update_settings`
  - `application.retrieval.clear_embedding_cache`
  - `application.retrieval.clear_corpus_cache`
  - `infra.storage.cache.remove_dir`
- Embedding request telemetry:
  - `infra.embedding.request`

## Additional event families (P10)
- Evaluation LLM normalization events:
  - `application.evaluation_llm.generate_revised_by_outline`
  - `application.evaluation_llm.generate_outlines`
- Embedding cache and warmup normalization events:
  - `infra.embedding_cache.load`
  - `infra.embedding_cache.save`
  - `infra.embedding_cache.request_split`
  - `infra.embedding_warmup.prepare`
- Incremental index fallback normalization event:
  - `infra.corpus_index.incremental_fallback`

## Additional event families (P11)
- Trace event promotion (top-level fields from detail metadata):
  - `event/status/layer/module/stage/runId/requestId/errorCode` are promoted when provided in trace detail.
- Template trace schema unification events:
  - `infra.template.request`
  - `infra.template.response`
  - `infra.template.error`
  - `infra.llm_template.request`
  - `infra.llm_template.response`
  - `infra.llm_template.error`

