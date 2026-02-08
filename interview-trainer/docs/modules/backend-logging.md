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
- `src/interviewTrainer/application/services/it_configSnapshot.ts`
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
- `webview/src/main.tsx`
- `src/interviewTrainer/application/useCases/it_coreActions.ts`
- `src/interviewTrainer/application/useCases/it_templateTestActions.ts`
- `src/interviewTrainer/application/useCases/it_testAsr.ts`
- `src/interviewTrainer/application/useCases/it_testEmbedding.ts`
- `src/interviewTrainer/application/useCases/it_testLlm.ts`
- `src/interviewTrainer/application/useCases/it_embeddingWarmup.ts`
- `src/interviewTrainer/interface/handlers/it_webviewTemplateTestHandlers.ts`
- `src/interviewTrainer/interface/handlers/it_webviewTestAsrHandlers.ts`
- `src/interviewTrainer/interface/handlers/it_webviewTestEmbeddingHandlers.ts`
- `src/interviewTrainer/interface/handlers/it_webviewTestLlmHandlers.ts`
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

## Additional event families (P12)
- Corpus watcher lifecycle events:
  - `application.corpus_watchers.reset`
  - `application.corpus_watchers.setup`
  - `application.corpus_watchers.dirty_mark`
- Stream update diagnostics:
  - `application.streaming.step_update`
  - `application.streaming.evaluation_update`
- Webview runtime global error events (via `it/clientTrace`):
  - `webview.runtime.window_error`
  - `webview.runtime.unhandled_rejection`


## Additional event families (P13)
- Webview bridge lifecycle events:
  - `extension.webview_bridge.resolve`
  - `extension.webview_bridge.send`
  - `extension.webview_bridge.automation_ready`
  - `extension.webview_bridge.ready_signal`
  - `extension.webview_bridge.ui_ack`
  - `extension.webview_bridge.analyze_ack`
  - `extension.webview_bridge.protocol_ack`
- Protocol observer extension events:
  - `protocol.webview.handler_registered`
  - `protocol.webview.broadcast_unhandled`
- Workspace selection use-case events:
  - `application.workspace.select_dir`
  - `application.workspace.select_sessions_dir`

## Additional event families (P14)
- Template secret and token action events:
  - `application.template_secret.save`
  - `application.template_secret.delete`
  - `application.template_token.refresh`
  - `application.template_token.refresh_all`
  - `application.template_token.set_auto_refresh`
- Result action entry events:
  - `application.result.open_file`
  - `application.result.analyze_audio`
  - `application.result.cancel_analyze`
- Provider action events:
  - `application.provider.create_config`
  - `application.provider.save_config`
  - `application.provider.open_config`
- Recording action events:
  - `application.recording.start_native`
  - `application.recording.stop_native`
  - `application.recording.list_inputs`
  - `application.recording.convert_audio`
- Analysis run and stage events:
  - `application.analysis_run.handle`
  - `application.analysis_run.prepare_deps`
  - `application.analysis_flow.run`
  - `application.analysis_flow.audio_stage`
  - `application.analysis_flow.segment_stage`
  - `application.analysis_flow.retrieval_stage`
  - `application.analysis_flow.evaluation_stage`
  - `application.analysis_flow.persist_stage`

## Additional event families (P15)
- Core use-case lifecycle events:
  - `application.core.get_state`
  - `application.core.get_config`
  - `application.core.enable_trace_logs`
  - `application.core.list_history`
  - `application.core.open_settings`
  - `application.core.open_mic_settings`
  - `application.core.reload_window`
- Template test inner lifecycle events:
  - `application.template_test.dry_run`
  - `application.template_test.live`
- Connectivity test inner lifecycle events:
  - `application.test_asr.run`
  - `application.test_embedding.run`
  - `application.test_llm.run`
  - `application.test_llm.request_preview`
- Guardrail clamp diagnostics:
  - `application.retrieval.guardrail_clamp`
  - `application.embedding_warmup.guardrail_clamp`
