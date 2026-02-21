# Architecture Remediation Exec Plan (2026-02-21)

## Document Metadata
- Document Type: `Plan + Execution`
- Status: `Completed`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-21`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/extension.ts`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/flow.ts`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/flow_evaluationStage.ts`
  - `interview-trainer/src/interviewTrainer/application/flows/analyze/flow_persistStage.ts`
  - `interview-trainer/src/interviewTrainer/interface/e2e/`
  - `interview-trainer/webview/src/InterviewTrainer.tsx`
  - `interview-trainer/webview/src/hooks/useE2ETestBridge.ts`
  - `interview-trainer/.github/workflows/e2e-smoke.yml`

## Background and Goals
- 将架构审查结论转化为可执行修复清单，避免仅停留在“原则层”描述。
- 在不破坏现有 smoke/E2E 行为的前提下，收敛入口文件复杂度并强化分层边界。
- 补齐自动化守卫，降低未来回归为“静默违规”的概率。

## Scope and Non-goals
- Scope:
  - 拆分扩展端与 Webview 端 E2E 测试桥逻辑，降低生产入口耦合。
  - 继续分解分析主流程 `flow.ts`，把阶段细节转入独立 stage 模块。
  - 增加架构边界检查与 CI 前置质量门禁。
  - 同步文档术语与实际代码结构。
- Non-goals:
  - 不在本轮重写整条分析业务链路。
  - 不变更已有 E2E command id / protocol message id。
  - 不引入破坏性配置迁移。

## Task Matrix
| ID | Priority | Owner | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- | --- |
| A1 | P0 | Maintainers | Completed | 将 extension 里的 E2E harness 迁移到 `interface/e2e` | `src/extension.ts` 不再承载主要 E2E 编排细节，smoke 命令保持兼容 |
| A2 | P0 | Maintainers | Completed | 将 `InterviewTrainer.tsx` 内联 E2E 协议处理提取到 hook/modules | 根组件职责聚焦组合与状态编排，E2E handler 独立可测 |
| A3 | P1 | Maintainers | Completed | 拆分 analyze flow 阶段实现（evaluation/persist） | `flow.ts` 只保留 pipeline 协调，阶段细节外移 |
| A4 | P1 | Maintainers | Completed | 增加架构边界检查脚本与 CI 执行 | 违反依赖方向时检查非零退出并阻断 PR |
| A5 | P1 | Maintainers | Completed | 在 smoke 前增加 build/test/check:arch 质量门 | PR 先过质量门，再执行 smoke |
| A6 | P2 | Maintainers | Completed | 文档术语对齐协议共享机制与实际实现 | 架构文档不再出现与代码不一致描述 |

## Execution Order
1. `Phase 1`: A4/A5/A6，先建立自动化边界和门禁，降低后续改造风险。
2. `Phase 2`: A1/A2，拆分入口层 E2E 逻辑，保持协议兼容。
3. `Phase 3`: A3，继续细化 analyze flow 分层与阶段职责。

## Verification
- Commands:
  - `npm run check:arch`
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e:smoke`（在可运行环境）
- Evidence:
  - 流程拆分后，既有 fault-matrix/smoke 契约保持通过。
  - CI 工作流中 smoke 不再绕过 build/test/arch check。
  - 入口文件复杂逻辑显著下降，职责更清晰。

## Risks and Rollback
- Risks:
  - E2E 桥拆分导致消息映射遗漏，出现测试指令不可达。
  - Flow 阶段外移时引入状态透传缺失，导致行为回退。
  - CI 门禁变严后短期触发更多失败，影响交付节奏。
- Rollback:
  - 保留拆分前命令/协议常量不变，必要时按模块回滚到原入口实现。
  - 若阶段拆分产生不可控回归，可仅回滚对应 stage 模块改动。
  - CI 门禁可临时降级为告警，但需附带整改 issue 和截止日期。

## Progress Log
- `2026-02-21`: 创建执行计划并完成 A4/A5/A6（架构检查、CI 门禁、文档同步）。
- `2026-02-21`: 完成 A1，extension 端 E2E harness 提取至 `interface/e2e`。
- `2026-02-21`: 完成 A2，webview E2E bridge 从 `InterviewTrainer.tsx` 提取为 `useE2ETestBridge` 及子模块。
- `2026-02-21`: 完成 A3，`flow.ts` 进一步瘦身并提取 evaluation/persist stage 模块。

## Follow-up
- 把 `check:arch` 的规则集持续扩展到更多目录边界，避免“只覆盖核心路径”。
- 对 analyze flow 继续推进“阶段输入输出显式化”，降低隐式上下文依赖。
