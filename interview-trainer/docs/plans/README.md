# Plan Docs Index

## Purpose
- 统一管理“计划类文档”的存放位置，避免根目录继续堆积计划文件。
- 明确每类文档的归属目录，降低查找和维护成本。

## Placement Rules
- 架构规划文档放在：`docs/plans/architecture/`
- 缺陷修复文档放在：`docs/plans/bugfix/`
- 重构与清理文档放在：`docs/plans/refactor/`
- 质量与测试文档放在：`docs/plans/quality/`
- 观测与日志演进文档放在：`docs/plans/observability/`
- 审查问题与执行日志放在：`docs/review/`
- 架构报告文档放在：`docs/architecture/`

## Standards
- Plan/Fix Plan/Execution Log 结构模板：`docs/review/PLAN_TEMPLATE.md`
- 审查文档索引：`docs/review/README.md`
- 文本编码：UTF-8（无 BOM）

## Plan Documents by Category
| Category | File | Type | Status | Last Updated |
| --- | --- | --- | --- | --- |
| Architecture | `docs/plans/architecture/ARCH_REFACTOR_PLAN.md` | Plan | In Progress | 2026-02-21 |
| Architecture | `docs/plans/architecture/ARCH_DOC_PLAN.md` | Plan | In Progress | 2026-02-21 |
| Bugfix | `docs/plans/bugfix/BUGFIX_PLAN.md` | Fix Plan | In Progress | 2026-02-21 |
| Refactor | `docs/plans/refactor/REFACTOR_TASKS_PLAN.md` | Plan + Execution | In Progress | 2026-02-21 |
| Refactor | `docs/plans/refactor/CLEANUP_PLAN.md` | Plan + Execution | In Progress | 2026-02-21 |
| Quality | `docs/plans/quality/SECURITY_TEST_PLAN.md` | Plan + Execution | In Progress | 2026-02-21 |
| Quality | `docs/plans/quality/TEST_HARDENING_PLAN.md` | Plan | In Progress | 2026-02-21 |
| Observability | `docs/plans/observability/STRUCTURED_LOG_PLAN.md` | Plan + Execution | Completed | 2026-02-21 |

## Related Non-Plan Docs
| Category | File | Purpose |
| --- | --- | --- |
| Architecture Report | `docs/architecture/ARCH_COMPLIANCE_REPORT.md` | 架构合规扫描与剩余风险 |
| Review Issues | `docs/review/REVIEW_ISSUES.md` | 审查问题清单与状态 |

## Maintenance Rules
- 新增计划文档时，必须先放入对应分类目录，再更新本索引。
- 计划执行后，必须更新 `Status` 与 `Last Updated`。
- 重大结构调整后，需同步更新本索引与 `docs/review/README.md`、`docs/architecture/README.md`。
