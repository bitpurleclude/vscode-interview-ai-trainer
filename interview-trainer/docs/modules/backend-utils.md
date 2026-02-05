# 工具与通用能力（backend-utils）

## 模块定位与职责
提供音频处理、文本处理与 WAV 解析等通用工具。

## 目录与关键文件
- `src/interviewTrainer/infra/utils/it_audio.ts`：音频摘要、转写段落构建。
- `src/interviewTrainer/infra/utils/it_wav.ts`：WAV 解析工具。
- `src/interviewTrainer/infra/utils/it_text.ts`：文本清洗与哈希。

## 关键调用链
- `application/flows/analyze/flow.ts` → `it_audio.ts`
- `infra/notes/*` → `it_text.ts`

## 注意事项
- `it_audio.ts` 多用于 PCM 路径，非 PCM 时需注意 fallback。
- 文本哈希用于缓存键，需保持稳定。
