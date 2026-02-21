# E2E Smoke Strictness Execution Log (2026-02-21)

## Document Metadata
- Document Type: `Execution Log`
- Status: `Completed`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-21`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/test/e2e/smoke/index.js`
  - `interview-trainer/scripts/run-e2e-smoke.js`
  - `interview-trainer/scripts/run-e2e-smoke.test.ts`
  - `interview-trainer/src/extension.ts`
  - `interview-trainer/webview/src/InterviewTrainer.tsx`
  - `interview-trainer/.github/workflows/e2e-smoke.yml`

## Scope
- 记录 smoke 严格化方案从“断言收紧”到“失败矩阵化覆盖”的实际执行结果。
- 统一沉淀跨阶段改动批次、验证证据与后续跟进项。

## Execution Summary
- 完成了 smoke 基础断言收紧、Webview 自动化后门清理、runner 失败工件化、阶段化执行和报告输出。
- 将 settings/protocol/analyze/ui-click 流程从单一路径成功断言扩展为成功 + 失败注入矩阵。
- 增加 CI 工作流，确保 workspace/no-workspace 双模式与 artifact-contract 可持续执行。

## Change Batches
| Batch | Legacy Items | Status | Key Changes |
| --- | --- | --- | --- |
| B01 | 1-6 | Completed | 收紧 analyze/save/cancel 成功判定；移除回退路径；引入 E2E 最小模板绑定；增加失败工件落盘 |
| B02 | 7-10 | Completed | 扩展 smoke 覆盖深度与历史回归保护；增加阶段化执行、注入失败、CLI 参数与 npm stage scripts |
| B03 | 11-14 | Completed | 增加结构化运行报告、严格 artifact 质量门、CI workflow、report/attempt/meta 深一致性校验 |
| B04 | 15-16 | Completed | 新增 settings 成功流 smoke 覆盖；提升历史会话抗干扰稳定性 |
| B05 | 17-23 | Completed | 修复 handler 绑定和 settings 持久化问题；补齐 settings 幂等与环境切换合同；强化步骤顺序与详情一致性断言 |
| B06 | 24-32 | Completed | settings 失败注入矩阵持续扩展（更新/恢复/trace/环境分支/同环境分支/unknown-stage 兼容） |
| B07 | 33-34 | Completed | 新增 protocol guard 失败分支注入矩阵并完成串行稳定性复验 |
| B08 | 35-36 | Completed | 新增 analyze/cancel/save 多阶段失败矩阵，补齐 no-workspace 预条件与 unknown-stage 兼容断言 |
| B09 | 37 | Completed | 新增 UI click flow 失败矩阵与 unknown-stage 兼容断言，关闭剩余 major success-only 缺口 |

## Verification Result
- Mandatory checks passed:
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e:smoke`
  - `npm run test:e2e:smoke:workspace`
  - `npm run test:e2e:smoke:no-workspace`
  - `npm run test:e2e:smoke:verify-artifacts:strict`
  - `npx vitest run scripts/run-e2e-smoke.test.ts`
- Stability re-validation:
  - 在多个改动批次后进行了高频重复执行（含串行复验），用于排除互斥锁噪声与偶发抖动造成的假失败。
- Contract evidence:
  - 成功路径必须满足严格步骤序列与结构化 ack 字段约束。
  - 失败注入路径必须包含可追踪的注入步骤、终止步骤和 stage 对齐错误信息。

## Follow-up
- 将 failure matrix 的统计指标（失败阶段分布、重试次数、artifact 质量）上报到统一质量看板。
- 按稳定性数据定期评估是否需要继续收紧 `unknown-stage` 兼容策略。
