# 代码审查问题修复计划（2026-02-21）

## Document Metadata
- Document Type: `Fix Plan`
- Status: `Completed`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-21`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/webview/src/hooks/useAnalysisFlow.ts`
  - `interview-trainer/webview/src/hooks/useAnalysisFlow.contract.ts`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/flow.ts`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/flow_retrievalStage.ts`
  - `interview-trainer/src/interviewTrainer/application/useCases/it_questionActions.ts`
  - `interview-trainer/src/interviewTrainer/application/useCases/it_resultActions.ts`

## Background and Goals
- 基于审查结果修复高优问题，优先消除用户可见错误与行为风险。
- 将修复点绑定到可验证测试，防止“修完再回归”。
- 统一关键前后端契约字段，减少隐藏兼容分支。

## Scope and Non-goals
- Scope:
  - 修复保存状态提示、取消流程协作中断、重试参数、乱码文案。
  - 修复 questionList 归一化中 `null/undefined` 污染问题。
  - 升级存在安全公告的依赖并完成审计验证。
  - 对关键修复项补充契约/单测覆盖。
- Non-goals:
  - 不在本轮做覆盖率基线迁移。
  - 不对整个评估与检索链路做架构重写。

## Task Matrix
| ID | Priority | Owner | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | Maintainers | Completed | 修复保存失败时仍提示成功 | 保存失败分支展示错误，不再显示成功提示 |
| P0-2 | P0 | Maintainers | Completed | 取消 `maxRetries` 强制最小值 5 的逻辑 | 重试次数遵循配置（最小 0），测试锁定行为 |
| P0-3 | P0 | Maintainers | Completed | 在检索/评价/持久化阶段补充 abort 检查 | 取消后不继续推进阶段，不再落盘 |
| P0-4 | P0 | Maintainers | Completed | 替换用户可见乱码文案 | 错误提示可读且测试断言不含乱码占位 |
| P0-5 | P0 | Maintainers | Completed | 升级 axios 到修复版本并复核审计 | `npm audit --omit=dev` 不再报该高危公告 |
| P1-1 | P1 | Maintainers | Completed | 统一保存返回字段 `reportPath`，并兼容旧字段 | 前后端契约一致，历史字段可兼容读取 |
| P1-2 | P1 | Maintainers | Completed | questionList 归一化过滤 `null/undefined` | 题目列表不再出现 `"null"` / `"undefined"` |
| P1-3 | P1 | Maintainers | Completed | cancel 请求异常时补充失败状态提示 | UI 明确提示“停止分析请求失败，请重试” |
| P2-1 | P2 | Maintainers | Completed | 优化检索并发提示文案可读性 | 进度文案语义清晰，测试覆盖新格式 |

## Execution Order
1. 先处理 P0 用户可见与流程正确性问题（P0-1~P0-5）。
2. 再处理契约一致性与输入归一化（P1-1~P1-3）。
3. 最后收敛 P2 可读性改进并完善回归验证。

## Verification
- Commands:
  - `npm run test`
  - `npm run build`
  - `npm run test:e2e:smoke`
  - `npm audit --omit=dev`
- Evidence:
  - `useAnalysisFlow` 契约测试覆盖保存成功/失败分支与取消异常分支。
  - `flow` 与 `it_questionActions` 相关测试锁定重试与题目归一化行为。
  - 检索阶段消息测试覆盖并发文案格式。

## Risks and Rollback
- Risks:
  - 改动取消/重试逻辑可能影响长链路稳定性。
  - 契约字段统一若处理不完整，可能影响旧前端分支。
- Rollback:
  - 每个修复点均可按文件级回滚，不影响其他模块。
  - `reportPath/filePath` 保持兼容读取可降低回滚窗口风险。

## Progress Log
- `2026-02-21`: 建立修复计划并完成 P0-1 至 P0-5，补充对应测试与审计验证。
- `2026-02-21`: 完成 P1-1，统一并兼容保存返回字段契约。
- `2026-02-21`: 完成 P1-2/P1-3，修复题目归一化与取消异常状态提示。
- `2026-02-21`: 完成 P2-1，优化并发提示文案并补充回归断言。

## Follow-up
- 单独制定“覆盖率基线迁移方案”，再扩大 `vitest` 覆盖统计范围，避免一次性 CI 大面积失败。
