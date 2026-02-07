# Config Module

## Scope
- Provides default runtime configuration templates for the extension.
- On startup, config files under `config/` are copied into user global storage.
- Webview settings update user-side copies, not the repository defaults.

## Key Files
- `config/api_config.yaml`: environment and API binding defaults.
- `config/skill_config.yaml`: business flow settings (retrieval, evaluation, output paths).
- `config/templates.yaml`: template definitions and bindings.
- `config/providers/*.yaml`: provider-level defaults.
- `config/guardrails.yaml`: single source for upper-bound controls.

## Call Chain
- `ItConfigService.loadBundle()`
  -> `infra/api/it_apiConfig.ts`
  -> read `config/*.yaml`
  -> assemble `ItConfigBundle`.
- Guardrails parser/clamp entry:
  - `src/interviewTrainer/application/services/it_guardrails.ts`

## Guardrails Policy
- Do not hardcode upper bounds in business logic.
- Add every new limit/threshold/concurrency cap/window size in `config/guardrails.yaml` first.
- Every guardrail key must include comments for: purpose, unit, trigger behavior, and high-value risk.
- Any guardrail change must update:
  - `config/guardrails.yaml`
  - `src/interviewTrainer/application/services/it_guardrails.ts`
  - related use-cases/flows/tests
  - architecture/config documentation

## Guardrails Currently Wired (Retrieval Path)
- TopK caps
- Query concurrency caps
- Embedding concurrency caps (retrieval + warmup)
- Vector batch size cap
- Query max character cap
- Query window size for auto-batching
- Question-level and kind-level concurrency caps
- Embedding request split threshold (auto-split when exceeded)
