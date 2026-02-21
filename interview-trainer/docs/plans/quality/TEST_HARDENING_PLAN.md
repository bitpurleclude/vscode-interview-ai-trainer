# TEST_HARDENING_PLAN

## Document Metadata
- Document Type: `Plan`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/interviewTrainer/application/`
  - `interview-trainer/src/interviewTrainer/interface/`
  - `interview-trainer/webview/src/`
  - `interview-trainer/test/`
  - `interview-trainer/scripts/run-e2e-smoke.js`

## Background and Goals
- 提升测试套件对真实回归的敏感度，减少“假绿”结果。
- 收敛仅覆盖 util 的测试偏差，把 coverage 重心拉回核心业务链路。
- 强化 smoke 与 fault-matrix 的失败契约，确保失败可诊断、可复现。

## Scope and Non-goals
- Scope:
  - 完善分析主链路、设置页与协议边界的契约测试。
  - 强化 smoke 断言与失败注入矩阵，补齐关键失败分支覆盖。
  - 统一测试夹具、日志证据与 artifact 合同，降低排障成本。
- Non-goals:
  - 不追求“覆盖率数字最大化”而牺牲测试有效性。
  - 不在本计划中引入新的测试框架迁移。

## Current Gaps
- 覆盖率统计曾偏向工具函数，业务链路的回归信号密度不足。
- E2E smoke 在部分路径存在“可通过但不严格”的风险。
- 失败场景的工件与日志约束不统一，导致问题定位成本偏高。

## Task Matrix
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| P19-1 | P0 | In Progress | 继续收紧 smoke 成功/失败判定，防止状态误判 | `status=error` 或关键步骤缺失时必须 fail |
| P19-2 | P0 | In Progress | 优化 coverage 关注范围，覆盖核心 use-case/flow/service | 核心链路测试覆盖显著提升且稳定 |
| P19-3 | P1 | In Progress | 扩展分析流程故障矩阵（单故障/组合故障） | 失败路径行为可预测、错误可读 |
| P19-4 | P1 | In Progress | 补齐 guardrails clamp 与边界输入测试 | 非法配置输入会被稳定归一化并可断言 |
| P19-5 | P1 | In Progress | 强化 UI E2E 关键链路与失败注入覆盖 | 设置/分析/取消/保存/协议均有成功+失败合同 |

## Execution Order
1. 先做 P19-1，保证 smoke 信号可信。
2. 再推进 P19-2，扩大核心链路覆盖并稳定基线。
3. 然后完成 P19-3/P19-4，强化失败路径和边界行为。
4. 最后深化 P19-5，补齐 UI E2E 成功/失败矩阵。

## Verification
- Commands:
  - `npm run test`
  - `npm run build`
  - `npm run test:e2e:smoke`
  - `npm run test:e2e:smoke:verify-artifacts:strict`
- Evidence:
  - 核心链路断言优先于表层覆盖率数字。
  - smoke 在 workspace/no-workspace 双模式下均可稳定识别失败。
  - 失败注入场景有结构化 artifact 支撑复盘。

## Risks and Rollback
- Risks:
  - 断言严格化后，环境抖动可能触发更多短期失败。
  - 覆盖范围调整可能导致历史门槛失真，触发 CI 波动。
- Rollback:
  - 分阶段启用严格项，必要时临时降级为告警并附整改计划。
  - 对新增断言按模块回滚，保留已验证稳定的核心合同。

## Progress Log
- `2026-02`: 建立测试加固计划并启动 P19 分批推进。
- `2026-02-21`: 文档重建并完成结构化规范，清理历史乱码内容。

## Follow-up
- 与 `docs/plans/quality/SECURITY_TEST_PLAN.md` 和 `docs/review/E2E_SMOKE_STRICTNESS_EXECUTION_LOG_2026-02-21.md` 保持任务编号与状态同步。
