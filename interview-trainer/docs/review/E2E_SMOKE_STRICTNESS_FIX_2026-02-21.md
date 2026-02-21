# E2E Smoke 严格化修复计划（2026-02-21）

## Document Metadata
- Document Type: `Fix Plan`
- Status: `Completed`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-21`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/test/e2e/smoke/index.js`
  - `interview-trainer/scripts/run-e2e-smoke.js`
  - `interview-trainer/webview/src/InterviewTrainer.tsx`
  - `interview-trainer/src/extension.ts`

## Background and Goals
- 解决 smoke 测试“假绿”问题，让真实功能回归能被快速拦截。
- 收敛自动化后门与跳过分支，确保测试覆盖真实用户链路。
- 为 CI 失败提供可追踪工件，降低排障成本。

## Scope and Non-goals
- Scope:
  - 收紧 analyze/save/cancel 断言，禁止 `status=error` 仍判定通过。
  - 去除 Webview 自动化隐藏回退路径。
  - 提供 E2E 最小可运行配置注入，减少环境偶发失败。
  - 为 runner 增加失败工件落盘与验证机制。
- Non-goals:
  - 不在本计划中引入全新的 E2E 框架。
  - 不将 smoke 扩展为全量业务回归套件。

## Task Matrix
| ID | Priority | Owner | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- | --- |
| S1 | P0 | Maintainers | Completed | 收紧 `test/e2e/smoke/index.js` 成功判定 | analyze/save/cancel 任一失败都必须 fail |
| S2 | P0 | Maintainers | Completed | 移除 Webview 自动化后门与跳过成功分支 | 不再存在 fallback 直通与 skip-cancel 假通过 |
| S3 | P1 | Maintainers | Completed | 在 extension 注入最小 E2E 模板绑定 | 新环境下 smoke 可自洽运行 |
| S4 | P1 | Maintainers | Completed | `run-e2e-smoke.js` 增加失败工件输出 | 每次失败有结构化 JSON 工件可追溯 |
| S5 | P1 | Maintainers | Completed | 增加分阶段执行和严格工件验证模式 | CI 可分模式执行且可验证工件质量 |

## Execution Order
1. 先收紧断言与移除后门（S1/S2），确保测试信号可信。
2. 再做 E2E 配置注入和 runner 能力增强（S3/S4）。
3. 最后补齐分阶段执行和工件严格校验（S5），提升 CI 可维护性。

## Verification
- Commands:
  - `npm run test:e2e:smoke`
  - `npm run test:e2e:smoke:workspace`
  - `npm run test:e2e:smoke:no-workspace`
  - `npm run test:e2e:smoke:verify-artifacts`
  - `npm run test:e2e:smoke:verify-artifacts:strict`
  - `npx vitest run scripts/run-e2e-smoke.test.ts`
  - `npm run test`
  - `npm run build`
- Evidence:
  - smoke 中 `status=error` 场景被稳定拦截。
  - failure artifact 字段完整且 schema 可校验。
  - workspace/no-workspace 两种模式均可独立执行与验证。

## Risks and Rollback
- Risks:
  - 断言收紧后，环境抖动更容易暴露为失败。
  - 去除 fallback 后，某些历史隐式依赖会立即暴露。
- Rollback:
  - 可临时降级为非严格工件校验模式（仅用于应急，不建议长期保留）。
  - 单个断言块可按 case 回滚，但需同步记录 false-green 风险。

## Progress Log
- `2026-02-21`: 完成 S1/S2，收紧断言并移除回退路径。
- `2026-02-21`: 完成 S3，增加 extension 侧 E2E 最小模板与配置注入。
- `2026-02-21`: 完成 S4/S5，runner 新增失败工件、阶段执行、严格验证和报告输出。

## Follow-up
- 将关键 smoke 断言映射到 CI 报表维度，建立长期趋势监控（失败阶段、重试次数、工件质量）。
