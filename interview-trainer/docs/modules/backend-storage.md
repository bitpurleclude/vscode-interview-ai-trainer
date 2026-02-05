# 存储与缓存（backend-storage）

## 模块定位与职责
负责分析结果、历史记录、题目解析缓存与 session 路径管理。

## 目录与关键文件
- `src/interviewTrainer/storage/it_sessions.ts`：会话目录、报告路径、命名规则
- `src/interviewTrainer/storage/it_history.ts`：历史记录存取
- `src/interviewTrainer/storage/it_questionCache.ts`：题目解析缓存

## 关键调用链
- `core/analyze/result.ts` → `it_sessions.ts`（保存报告/音频）
- `core/it_questionParser.ts` → `it_questionCache.ts`（解析缓存）

## 注意事项
- 路径/文件名依赖 `skill_config.yaml` 中的 sessions/filenames 配置
- 需确保 UTF-8 文件写入，避免中文乱码

## 测试建议
- 验证 `sessions/YYYYMMDD/` 下输出是否完整
- 核验历史记录读取是否与 UI 历史一致
