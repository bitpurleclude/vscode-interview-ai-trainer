# Backend Logging Module

## Scope
The backend logging module provides structured runtime diagnostics for extension workflows.
It is used by analysis, template execution traces, test helpers, and host-level failures.

## Key Files
- `src/interviewTrainer/application/services/it_logging.ts`
- `src/interviewTrainer/application/services/it_structuredLogger.ts`
- `src/interviewTrainer/application/services/it_logSinkGateway.ts`
- `src/interviewTrainer/infra/logging/it_outputChannelLogSink.ts`
- `src/interviewTrainer/infra/logging/it_traceLogger.ts`

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
- Trace switch disabled: emit `error` only (controlled by guardrail policy).
- Sensitive keys (`api_key`, `token`, `authorization`, etc.) are masked.
- Binary payload-like fields (`audio`, `base64`, `speech`, etc.) are summarized by length.

## Notes for Contributors
- Do not call `outputChannel.appendLine` directly for business logs.
- Emit logs through application-level structured logger utilities.
- When adding a new event family, keep `event` names stable for test assertions.
- Any logging-limit change must update:
  - `config/guardrails.yaml`
  - `it_guardrails.ts`
  - relevant tests and docs
