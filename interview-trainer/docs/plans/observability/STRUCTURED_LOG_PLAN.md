# Structured Logging Plan

## Document Metadata
- Document Type: `Plan + Execution`
- Status: `Completed`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-08`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/interviewTrainer/application/services/it_logging.ts`
  - `interview-trainer/src/interviewTrainer/application/services/it_traceLogger.ts`
  - `interview-trainer/src/interviewTrainer/application/services/it_guardrails.ts`
  - `interview-trainer/src/interviewTrainer/interface/handlers/`
  - `interview-trainer/src/interviewTrainer/infra/`
  - `interview-trainer/config/guardrails.yaml`

## Background and Goals
- 建立统一结构化日志体系，提升分析流程、协议异常、配置变更、模板调用等关键路径的可观测性。
- 保持分层依赖方向：`Interface -> Application -> (Domain, Infra)`。
- 在日志开关关闭时仍保留 `error` 级日志，保障故障诊断能力。
- 所有日志上限参数集中在 `config/guardrails.yaml`，业务代码不硬编码。

## Scope and Non-goals
- Scope:
  - 统一事件命名、等级策略、日志结构与脱敏约束。
  - 覆盖核心运行链路、Webview 协议桥、模板执行、录音、持久化、缓存与健康检查。
  - 建立可测试的日志契约，并在回归中持续验证。
- Non-goals:
  - 不将日志系统改造为外部 SaaS 观测平台接入工程。
  - 不替换全部历史日志实现为一次性“大重写”。

## Current Gaps
- 历史日志入口分散在 `it_logging.ts`、`it_traceLogger.ts` 与局部 `appendLine` 调用。
- 输出形态混合（文本、半结构化、trace payload），自动化断言成本高。
- 事件命名与脱敏策略在不同路径上不一致。

## Architecture Rules

### Layer Responsibility
- Interface: 记录请求边界与响应边界，不承载复杂日志策略。
- Application: 定义事件 DTO、级别、上下文字段和开关行为。
- Domain: 仅保留纯业务逻辑，不依赖具体日志实现。
- Infra: 提供 sink 适配（OutputChannel/文件/远端预留）。

### Canonical Log Shape (JSON Line)
```json
{
  "ts": "2026-02-08T15:00:00.000Z",
  "level": "info",
  "event": "analysis.retrieval.start",
  "layer": "application",
  "module": "flow_retrievalStage",
  "runId": "run_abc",
  "requestId": "req_123",
  "stage": "retrieval",
  "status": "start",
  "errorCode": "",
  "message": "retrieval stage started",
  "detail": {
    "questionCount": 3
  }
}
```

### Naming and Level Policy
- Event naming: `<domain>.<action>.<status>`。
- Log levels: `debug | info | warn | error`。
- 内部日志可使用英文 event/message，UI 文案保持用户可读语义。

### Switch and Guardrails Policy
- Trace switch off: 仅输出 `error` 级结构化日志。
- Trace switch on: 输出所有等级。
- 上限策略统一来源：`config/guardrails.yaml` 的 `logging` 配置。
- 上限解析与 clamp 统一经过：`application/services/it_guardrails.ts`。

## Task Matrix
| ID | Priority | Owner | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- | --- |
| P0 | P0 | Maintainers | Completed | 规划文档与约束落地 | 计划文档与 guardrails 键位齐备 |
| P1 | P0 | Maintainers | Completed | 结构化 logger 与 sink 基础设施 | 新旧调用可共存，核心日志可结构化输出 |
| P2 | P0 | Maintainers | Completed | 高价值链路接入（分析/模板/保存） | 关键生命周期具备 `start/success/error` |
| P3 | P1 | Maintainers | Completed | Interface 路径接入与测试 | route handler 可统一输出结构化日志 |
| P4 | P1 | Maintainers | Completed | 文档同步与交付检查 | build/test/e2e/package 流程通过 |
| P5 | P1 | Maintainers | Completed | 全 handler 边界日志封装 | 所有 Webview handler 走统一 wrapper |
| P6 | P1 | Maintainers | Completed | 协议异常观测与错误码返回 | missing handler 等异常可结构化追踪 |
| P7 | P1 | Maintainers | Completed | E2E 协议守卫断言 | smoke 可验证真实 missing-handler 路径 |
| P8 | P1 | Maintainers | Completed | command/token/messenger 观测 | 命令边界与 token 生命周期事件完整 |
| P9 | P1 | Maintainers | Completed | 配置/录音/持久化/缓存观测 | 关键写路径与缓存维护有可追踪事件 |
| P10 | P1 | Maintainers | Completed | trace 事件命名标准化 | evaluation/cache/warmup/indexer 事件统一 |
| P11 | P1 | Maintainers | Completed | 事件字段提升与模板 trace 统一 | 顶层字段统一，trace-off 保持 error 输出 |
| P12 | P1 | Maintainers | Completed | watcher/stream-drop/runtime 覆盖 | 流式丢弃与全局运行时错误可观测 |
| P13 | P2 | Maintainers | Completed | bridge 与工作区选择链路覆盖 | resolve/send/ack/selection 生命周期可观测 |
| P14 | P2 | Maintainers | Completed | 模板/结果/Provider/录音/分析阶段覆盖 | 核心动作具备结构化事件 |
| P15 | P2 | Maintainers | Completed | core use-case 与测试链路细粒度日志 | 基础动作与模板测试细节可追踪 |
| P16 | P2 | Maintainers | Completed | 环境配置与模板执行器观测 | 环境动作和模板重试生命周期可追踪 |
| P17 | P2 | Maintainers | Completed | guardrails 归一化摘要与回归测试 | 畸形配置回退可诊断且可测试 |
| P18 | P2 | Maintainers | Completed | webview 分析动作与配置同步观测 | UI 侧 run/cancel/save/config-sync 可追踪 |

## Execution Order
1. 建立基础设施与约束（P0-P4）。
2. 全量边界与协议观测覆盖（P5-P13）。
3. 深化业务动作与回归契约（P14-P18）。

## Verification
- Commands:
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e:smoke`
  - `npm run package`
- Evidence:
  - 关键链路具备稳定 `event/errorCode` 结构，可做自动化断言。
  - trace 开关关闭时仍可捕获 error 级事件。
  - guardrail clamp 行为有可追踪日志与测试保护。

## Risks and Rollback
- Risks:
  - 接入范围大，短期可能增加日志噪声和阅读负担。
  - 脱敏策略过严可能损失定位细节。
- Rollback:
  - 采用分阶段落地，可对单模块日志接入进行局部回滚。
  - 保留兼容 wrapper，避免一次性替换导致不可控回退。

## Progress Log
- `2026-02-08`: 启动结构化日志计划，完成 P0。
- `2026-02-08`: 完成 P1-P4，建立基础设施并通过交付链路验证。
- `2026-02-08` 至 `2026-02-21`: 连续完成 P5-P18，覆盖协议桥、E2E 守卫、配置/模板/录音/缓存/分析阶段等观测链路。

## Follow-up
- 评估是否需要将结构化日志输出扩展到可选文件 sink，方便离线审计。
- 基于现有 event taxonomy 建立自动化告警分级策略（errorCode -> action guideline）。
