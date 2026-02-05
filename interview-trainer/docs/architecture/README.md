# 架构说明（Architecture）

本目录用于记录架构原则、分层边界与迁移进度。

## 分层原则
- Interface：只接收输入与派发，不做业务逻辑。
- Application：用例编排，协调 domain 与 infra。
- Domain：核心业务逻辑，禁止 I/O。
- Infra：外部依赖/存储/网络/模板执行。
- Protocol：协议类型定义（前后端共享）。

## Protocol 同步策略
- 单一来源：`src/protocol/interviewTrainer.ts`
- Webview 侧通过 `webview/src/types.ts` 进行类型 re-export（仅类型，不参与运行时打包）。
- 禁止在 Webview 侧新增重复协议类型。

## 迁移状态
| Phase | 说明 | 状态 |
| --- | --- | --- |
| Phase 0 | 结构铺设与约束文档 | 完成 |
| Phase 1 | 协议与类型统一 | 完成 |
| Phase 2 | Infra 抽离 | 进行中 |
| Phase 3 | Domain 归位 | 未开始 |
| Phase 4 | Application 编排 | 未开始 |
| Phase 5 | Interface 重新接线 | 未开始 |
| Phase 6 | Webview 整理 | 未开始 |

## 相关文档
- 架构规划：`ARCH_REFACTOR_PLAN.md`
- 总览：`ARCHITECTURE_OVERVIEW.md`
- 目录图：`DIRECTORY_MAP.md`
