# Architecture

该目录记录 interview-trainer 的分层架构与重构进度。

## 分层说明
- Interface：VS Code 命令、Webview 桥接与事件处理（接 I/O）。
- Application：用例编排与跨域协调（调 domain + infra）。
- Domain：核心业务规则与流程（不做 I/O）。
- Infra：外部依赖实现（API/存储/录音/日志/工具）。
- Protocol：跨层/前后端共享的协议类型。

## Protocol 位置
- 后端协议：`src/protocol/interviewTrainer.ts`
- Webview 端类型：`webview/src/types.ts`（重导出/对齐协议）

## 重构进度
| Phase | 范围 | 状态 |
| --- | --- | --- |
| Phase 0 | 目录扫描与计划 | 完成 |
| Phase 1 | Protocol 调整 | 完成 |
| Phase 2 | Infra 迁移 | 完成 |
| Phase 3 | Domain 迁移 | 完成 |
| Phase 4 | Application 迁移 | 完成 |
| Phase 5 | Interface 接线 | 进行中 |
| Phase 6 | Webview 适配 | 未开始 |

## 参考文档
- `ARCH_REFACTOR_PLAN.md`
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/DIRECTORY_MAP.md`
- `ARCH_COMPLIANCE_REPORT.md`
