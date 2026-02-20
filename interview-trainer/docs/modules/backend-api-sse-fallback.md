# Backend API SSE Fallback Note (2026-02)

## Scope
- Module: `src/interviewTrainer/infra/api/it_templateHttp.ts`
- Function: `it_consumeTemplateSse`

## Change
- Added a non-SSE fallback path for stream reads.
- When a template is configured with `response.mode: sse` but the provider returns one-shot JSON or plain text, the parser now:
  - tries JSON parse and extracts text/value using existing extraction rules;
  - otherwise returns trimmed plain-text body.

## Why
- Prevents false-empty live test responses where HTTP status is `200` but `raw/text/value` were all empty only because no `data:` SSE frames were present.

## Operational Guidance
- This fallback improves resilience, but template mode should still match provider behavior:
  - one-shot response -> `response.mode: json`
  - event stream response -> `response.mode: sse`
