# 重构任务规划（REFACTOR_TASKS_PLAN）

## 目标
- 按分层架构规范清理无用逻辑。
- 拆分超大文件，降低耦合与维护成本。
- 每步修改均同步文档并通过构建验证。

## 执行规则
- 每个任务：先确认 → 修改 → `npm run build` → commit → `npm run package` → 文档同步。
- 修改必须保持 UTF-8 无 BOM。

## 任务清单（按优先级）

### P0（立即处理）
- [x] 移除 tools 相关逻辑
  - 删除 `infra/api/toolsPresets/presets/codexLike.ts` 及引用。
  - 移除 toolsPreset/tools/webSearch 在 LLM 请求构建中的注入逻辑。
  - 清理相关配置字段（providers/config/configSnapshot/LLM config）。
  - 删除文档中工具预设与 tools 相关说明。
- [x] 清理残留 tools 文案/字段
  - 更新状态栏文案中的 tools 图标。
  - 移除 Qianfan 请求中的 web_search 字段。

### P1（高优先级拆分）
- [x] 拆分 `webview/src/components/settings/SettingsTemplateManager.tsx`
- [x] 拆分 `domain/analyze/flow.ts`

### P2（中优先级拆分）
- [x] 拆分 `infra/api/it_templateExecutor.ts`
- [x] 拆分 `infra/api/it_configService.ts`
- [x] 拆分 `webview/src/InterviewTrainer.tsx`
- [x] 拆分 `domain/analyze/questions.ts`
- [x] 拆分 `interface/handlers/it_webviewConfigHandlers.ts`
- [ ] 拆分 `domain/notes/indexer.ts`

### P3（低优先级优化）
- [ ] 拆分 `interface/handlers/it_webviewTestHandlers.ts`
- [ ] 拆分 `domain/notes/cache.ts`
- [ ] 拆分 `infra/api/it_llm.ts`
- [ ] 拆分 `application/services/it_evaluation.ts`
- [ ] 拆分 `infra/storage/it_report.ts`
- [ ] 拆分 `infra/storage/it_sessions.ts`
- [ ] 评估是否拆分 `src/protocol/interviewTrainer.ts`（需同步 `webview/src/types.ts`）
