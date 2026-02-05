# application

应用层：用例编排与跨域协调。

## 职责
- 组织 domain 与 infra 的协作。
- 管控流程、并发、重试、状态机等用例逻辑。
- 不直接处理外部 I/O（交由 infra）。
