# STRUCTURED_LOG_PLAN

## 1. Objective
- Build a unified structured logging system without breaking the current analysis flow.
- Keep architecture dependency direction: Interface -> Application -> (Domain, Infra).
- When trace logging is disabled, still emit `error` level logs for internal diagnosis.
- Keep all logging limits in `config/guardrails.yaml`; do not hardcode limits in business logic.

## 1.1 Progress (2026-02-08)
- [x] P0 planning document and logging guardrails section
- [x] P1 structured logger foundation (`it_structuredLogger.ts`, sink gateway, output sink)
- [x] P2 key adoption in host logging (`it_logging.ts`, trace logger event normalization)
- [x] P3 interface-path adoption and tests (`it_webviewTestHelpers.ts`, logger tests)
- [x] P4 docs sync and delivery checks (`build/test/e2e smoke/package`)
- [x] P5 handler-wide boundary logging (`it_runLoggedHandler` applied to all Webview route handlers)
- [x] P6 protocol anomaly logging (`WebviewProtocol` observer + `handler_not_found` request response)
- [x] P7 e2e protocol guard assertions (real Webview request -> missing handler -> structured error)
- [x] P8 command/token/messenger observability (extension command boundary, token lifecycle, webview messenger telemetry)
- [x] P9 config/recording/persistence/cache/embedding observability (service write paths and cache maintenance)
- [x] P10 remaining trace normalization for evaluation/cache/indexer observability
- [x] P11 trace event promotion and template-trace schema unification
- [x] P12 watcher/stream-drop/webview-runtime coverage
- [x] P13 webview bridge handshake and workspace selection trace coverage
- [x] P14 template/result/provider/recording and analysis-stage coverage
- [x] P15 core/test/guardrail clamp observability coverage
- [x] P16 environment/template executor/client action observability coverage
- [x] P17 guardrails normalization summary and executor trace regression tests

## 2. Current Gaps
- Logging entry points are scattered across `it_logging.ts`, `it_traceLogger.ts`, and direct `appendLine` calls.
- Output formats are inconsistent: plain text, semi-structured detail, and trace payloads are mixed.
- Event naming is unstable and hard to assert in automated tests.
- Masking rules are partially implemented and not enforced end to end.

## 3. Architecture Rules

### 3.1 Layer Responsibility
- Interface: log request/response boundaries only.
- Application: define log DTO, event code, level, run context, and switch behavior.
- Domain: keep pure logic and avoid direct logger implementation dependency.
- Infra: provide sink adapters such as OutputChannel, and future file or remote sinks.

### 3.2 Canonical Log Shape (JSON Line)
```json
{
  "ts": "2026-02-08T15:00:00.000Z",
  "level": "info",
  "event": "analysis.retrieval.start",
  "layer": "application",
  "module": "flow_retrievalStage",
  "runId": "run_abc",
  "requestId": "req_123",
  "stage": "retrieval",
  "status": "start",
  "errorCode": "",
  "message": "retrieval stage started",
  "detail": {
    "questionCount": 3
  }
}
```

### 3.3 Naming and Level Policy
- Event naming: `<domain>.<action>.<status>`.
- Level set: `debug | info | warn | error`.
- Internal logs can use English event names and messages.
- User-facing text in UI remains unchanged.

### 3.4 Switch Policy
- Trace switch off: emit only `error` level structured logs.
- Trace switch on: emit all levels.

### 3.5 Guardrails Single Source
- Read logging limits from `config/guardrails.yaml` `logging` section only.
- Parse and clamp via `application/services/it_guardrails.ts`.
- No per-module hardcoded upper bounds.

## 4. Implementation Phases

### P0 - Planning and Constraints
- Define this plan document.
- Add logging guardrails with complete key comments: purpose, unit, trigger, risk.

### P1 - Logger Foundation
- Introduce application logger gateway.
- Introduce infra sink adapter for OutputChannel.
- Keep compatibility wrappers for old log call sites.

### P2 - High Value Path Adoption
- Analyze lifecycle events: start, stage, success, fail, cancel.
- Template lifecycle events: request, response, error.
- Save result, directory selection, and configuration update events.

### P3 - Interface and Test Adoption
- Replace direct `appendLine` usage with structured logger calls.
- Add smoke and e2e assertions on event and errorCode.
- Add unit tests for schema, masking, switch policy, and guardrail clamping.

### P4 - Docs and Delivery
- Update architecture docs and backend logging docs.
- Update AGENTS logging constraints.
- Run build, test, e2e smoke, and package before each delivery commit.

### P5 - Handler Boundary Coverage
- Introduce shared handler wrapper to emit request/success/error logs on every Webview route.
- Move interface event naming to stable `interface.<domain>.<action>` codes.
- Extend ports so all handlers use the same `logCorpusTrace` contract.

### P6 - Protocol Guard
- Add protocol observer events for invalid messages, unhandled requests, handler runtime exceptions, and send failures.
- Return structured `handler_not_found` error for unknown request messages with `messageId`.
- Map protocol anomalies to structured error/warn logs in extension runtime.

### P7 - E2E Assertion Coverage
- Add hidden command to trigger a real Webview request to a missing handler in smoke mode.
- Assert structured error payload (`status=error`, `errorCode=handler_not_found`) end to end.
- Keep protocol guard verification in both workspace and no-workspace smoke runs.

### P8 - Command and Client Telemetry Coverage
- Add command boundary logs for extension command entry points (`open/openSettings/openHistory/analyzeAudioFile`).
- Add token lifecycle logs for sync/refresh/schedule/snapshot push paths.
- Add webview messenger telemetry route (`it/clientTrace`) and structured messenger events for timeout/orphan/listener failures.

### P9 - Config, Recording, Persistence, and Cache Observability
- Add structured trace events around config bundle load/save paths in `ItConfigService`.
- Add recording lifecycle events for ffmpeg discovery, probe, input detection, start, and stop.
- Add persistence events for report append, attempt append, topic-meta read/write, and save-current-result.
- Add retrieval cache clear events and storage cache remove events with `start/success/noop/error`.
- Add embedding request telemetry (`infra.embedding.request`) with provider/model context and duration.

### P10 - Remaining Trace Normalization
- Normalize evaluation LLM trace events to stable `application.evaluation_llm.*` families.
- Normalize embedding cache read/write/split tracing to `infra.embedding_cache.*` events.
- Normalize embedding warmup lifecycle tracing to `infra.embedding_warmup.prepare`.
- Normalize incremental index fallback tracing to `infra.corpus_index.incremental_fallback`.

### P11 - Trace Event Promotion and Template Schema Unification
- Promote `detail.event/status/layer/module/*` from `logCorpusTrace` into top-level structured log fields.
- Keep `error` traces emitted when trace switch is off by auto mapping status/level.
- Normalize trace logger template events to `infra.template.*` and `infra.llm_template.*` families.
- Add unit tests for trace metadata promotion and trace-off error emission behavior.

### P12 - Watcher, Stream-Drop, and Webview Runtime Coverage
- Add corpus watcher lifecycle logs for reset/setup/dirty-mark in config snapshot service.
- Add stream update drop/error diagnostics (`step` and `evaluation`) when streaming is disabled or send fails.
- Add webview global runtime error capture (`window.error` / `unhandledrejection`) routed through `it/clientTrace`.
- Add contract/unit tests for stream-drop logging and webview global trace reporter.

### P13 - Webview Bridge and Workspace Selection Coverage
- Add extension-side bridge lifecycle traces for webview resolve/send/automation-ready handshake and ack validation.
- Promote protocol observer coverage for `handler_registered` and unhandled broadcast diagnostics.
- Add workspace directory selection traces (`start/canceled/rejected/success`) with path normalization outcomes.
- Extend contract/security tests to assert new bridge/workspace log events.

### P14 - Template, Result, Provider, Recording, and Analysis Stage Coverage
- Add structured lifecycle logs for template secret save/delete and token refresh actions.
- Add result entry diagnostics for analyze payload validation and cancel requests.
- Add provider config create/save/open action logs without leaking secret profile values.
- Add recording action logs for start/stop/list/convert flows and ffmpeg-missing failures.
- Add analysis run/stage diagnostics for run/deps/audio/segment/retrieval/evaluation/persist durations and outcomes.

### P15 - Core/Test/Clamp Coverage
- Add fine-grained core use-case logs (`get_config`, `list_history`, `open_settings`, `open_mic_settings`, `reload_window`) with start/success/error lifecycle.
- Add template test inner logs for dry-run/live (`missingCount`, template category, duration, token extraction outcome).
- Add ASR/Embedding/LLM connectivity test inner logs with provider/mode and duration in success/error paths.
- Add retrieval and embedding warmup guardrail clamp warning events to record `rawValue -> clampedValue` for diagnosis.

### P16 - Environment, Template Executor, and Client Action Coverage
- Add application-level environment action logs around all environment settings use-cases with payload summary and duration.
- Add template executor internal logs for render/run/attempt lifecycle and retry diagnostics (`statusCode`, `attempt`, `durationMs`).
- Add environment-settings UI action traces in webview (`set_active/create/delete/save_prompts/save_topic_settings/save_streaming_settings`).

### P17 - Guardrails Summary and Trace Regression Tests
- Add config snapshot guardrails normalization summary event (`application.guardrails.normalization`) when malformed guardrail config requires fallback/clamp.
- Add guardrail normalization issue collector in guardrails service for deterministic diagnostics and testability.
- Add template executor trace regression tests to lock `render_request/run/attempt` lifecycle events.

## 5. Impact
- Positive:
  - Faster failure diagnosis with stable event and errorCode.
  - Better automated test signal quality and fewer false green runs.
- Risk:
  - Large scale replacement can reduce short-term readability.
  - Over strict masking can hide useful diagnostics.

## 6. Acceptance
- Structured JSON line logs on key runtime paths.
- `start/success/error` events are available for core workflows.
- Trace switch off keeps only `error` logs.
- `npm run build`, `npm run test`, `npm run test:e2e:smoke`, and `npm run package` all pass.
