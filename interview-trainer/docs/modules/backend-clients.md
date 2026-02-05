# 外部客户端封装（backend-clients）

## 模块定位与职责
对 LLM/ASR/Embedding 的调用入口做轻量封装，屏蔽底层请求细节。

## 目录与关键文件
- `src/interviewTrainer/infra/clients/llmClient.ts`：LLM 请求（含 streaming）
- `src/interviewTrainer/infra/clients/asrClient.ts`：ASR 模板请求
- `src/interviewTrainer/infra/clients/embeddingClient.ts`：Embedding 请求

## 关键调用链
- `domain/analyze/evaluation.ts` → `llmClient.ts`
- `domain/analyze/asr.ts` → `asrClient.ts`
- `domain/notes/*` → `embeddingClient.ts`

## 注意事项
- 客户端依赖 `infra/api/*` 进行模板执行或请求构建
- 保持返回结构稳定，避免影响上层解析
