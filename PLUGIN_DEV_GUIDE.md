# Guangdong Interview Coach - Plugin Dev Notes

This file summarizes the current skill behavior and design so a follow-up agent can build a full interview evaluation plugin quickly.

## Current skill scope

- Local recording UI (FastAPI + web page) for mic capture, timer, upload.
- Audio analysis pipeline:
  - ASR (auto provider: OpenAI if key, else local whisper if available, else manual/mock).
  - Acoustic metrics (speech rate, pauses, RMS energy, pitch, SNR).
  - Question segmentation by marker phrases + pause-based fallback.
  - Retrieval from workspace inputs for Guangdong prompts/rubrics/knowledge/examples.
  - Evaluation: LLM if available, else heuristic fallback.
- Output: Markdown report per big question, appended per attempt; audio copied into the same folder.

## Key paths and layout

Workspace root:

- inputs/prompts/guangdong  (exam prompts/requirements, .md/.txt)
- inputs/rubrics            (scoring rubrics, .md/.txt)
- inputs/knowledge          (policies/notes, .md/.txt)
- inputs/examples           (sample answers, .md/.txt)
- sessions/                 (generated reports + recordings)
- config.json               (runtime config)

Per session output:

- sessions/YYYYMMDD/<topic-slug>/
  - <topic-title>.md        (all attempts + analysis)
  - attempts.json           (structured attempts)
  - meta.json               (topic metadata + hash)
  - attempt-XX-*.wav         (recordings)
  - optional subdir if topics.center_subdir is set

## Entry points

- Recorder UI: `skills/gd-interview-coach/scripts/run_server.py`
  - GET `/` renders UI (assets/web).
  - POST `/api/analyze` accepts audio + question fields.
- CLI: `skills/gd-interview-coach/scripts/analyze_cli.py`
  - `--audio`, `--question`, `--question-list`, `--question-path`, `--workspace`, `--session-label`.
- Core pipeline: `skills/gd-interview-coach/scripts/pipeline.py`

## Config (config.json)

Minimal keys:

- inputs.prompts_dir, rubrics_dir, knowledge_dir, examples_dir
- asr.provider: "auto" | "openai" | "local-whisper" | "manual" | "mock"
  - asr.local.backend: "auto" | "whisper" | "faster-whisper"
  - asr.local.model_path: local model path (preferred)
  - asr.local.download: false by default
  - asr.manual_text / mock_text for offline use
- llm.provider: "auto" | "openai" | "heuristic" | "mock"
  - llm.model, base_url, api_key_env
- output.attempt_heading_template / output.segment_heading_template
- filenames.allow_unicode (default true)
- topics.similarity_threshold (topic reuse)
- topics.center_subdir (optional report subfolder)

## Segmentation logic (pipeline.py)

- Marker regex handles phrases like:
  - "开始回答第n题", "第n题回答完毕", "第n题结束"
- If no markers:
  - Split by long pauses (`pause_for_split_sec`).
  - If question list provided and pause splits are fewer than questions, fall back to uniform split.

## Topic matching (big-question grouping)

- Each big question has meta.json with `topic_title`, `question_text`, `question_hash`.
- New runs reuse an existing folder if:
  - Hash matches, or
  - Similarity ratio exceeds `topics.similarity_threshold`.
- Folder name uses a slug derived from title; Unicode allowed by default.

## Report format (Markdown)

- One file per big question.
- Each attempt appends:
  - Timestamp, audio path, total duration.
  - Per-segment section:
    - Timing
    - Acoustic metrics table
    - Transcript
    - Evaluation (scores + strengths/issues/improvements)
    - Retrieved references

## UI contract (POST /api/analyze)

Form fields:

- audio (file, wav)
- question_text (string)
- question_list (multi-line)
- question_path (string; path to .md/.txt)
- session_label (string)

Returns JSON with:

- report_path, topic_dir, segments, etc.

## Heuristic evaluation fallback

Used when LLM provider is not available:

- Scores based on transcript length, speech rate, pause length, SNR.
- Produces relative scores + suggestions (not absolute grading).

## Dependencies and tests

- Requirements in `skills/gd-interview-coach/scripts/requirements.txt`.
- Tests use stdlib unittest:
  - `python -m unittest skills/gd-interview-coach/tests/test_pipeline.py`

## Deployment / packaging

- Skill package is a zip with .skill extension.
- For Codex install via git:
  - `git clone <repo> C:\Users\15517\.codex\skills\gd-interview-coach`
- Restart Codex after installing.

## Known constraints

- Codex cannot auto-start local services without a command; use a language trigger to run `run_server.py`.
- Local Python environment may be MSYS2-managed; use a venv if pip is restricted.
