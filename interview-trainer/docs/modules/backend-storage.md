# 存储与缓存（backend-storage）

## 模块定位与职责
- 负责分析结果、历史记录、题目解析缓存与 session 路径管理。

## 目录与关键文件
- `src/interviewTrainer/infra/storage/it_sessions.ts`：Session 入口（Barrel）。
- `src/interviewTrainer/infra/storage/it_sessionsTypes.ts`：Session 配置与元信息类型。
- `src/interviewTrainer/infra/storage/it_sessionsFs.ts`：目录/JSON 读写工具。
- `src/interviewTrainer/infra/storage/it_sessionsMatch.ts`：题目匹配与相似度判断。
- `src/interviewTrainer/infra/storage/it_sessionsTopic.ts`：Topic 目录与 meta 读写。
- `src/interviewTrainer/infra/storage/it_sessionsAttempts.ts`：尝试记录、报告路径、音频归档。
- `src/interviewTrainer/infra/storage/it_history.ts`：历史记录存取。
- `src/interviewTrainer/infra/storage/it_questionCache.ts`：题目解析缓存。
- `src/interviewTrainer/infra/storage/it_report.ts`：报告写入与引用笔记更新入口（Barrel）。
- `src/interviewTrainer/infra/storage/it_reportTypes.ts`：报告配置与类型。
- `src/interviewTrainer/infra/storage/it_reportOutline.ts`：提纲树构建与渲染。
- `src/interviewTrainer/infra/storage/it_reportNotes.ts`：参考笔记解析与合并。
- `src/interviewTrainer/infra/storage/it_reportNotesWriter.ts`：reference_notes 写入。
- `src/interviewTrainer/infra/storage/it_reportRender.ts`：报告内容渲染。
- `src/interviewTrainer/infra/storage/it_reportAppend.ts`：报告落盘追加。

## 关键调用链
- `domain/analyze/result.ts` → `it_sessions.ts`（保存报告/音频）。
- `application/services/it_questionParser.ts` → `it_questionCache.ts`（解析缓存）。

## 注意事项
- 路径/文件名依赖 `skill_config.yaml` 中的 sessions/filenames 配置。
- 必须保持 UTF-8（无 BOM）写入，避免中文乱码。

## 测试建议
- 验证 `sessions/YYYYMMDD/` 下输出是否完整。
- 校验历史记录读取是否与 UI 历史一致。
