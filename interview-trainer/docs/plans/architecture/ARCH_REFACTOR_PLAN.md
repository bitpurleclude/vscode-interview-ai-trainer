# 架构重构规划（ARCH_REFACTOR_PLAN）

## Document Metadata
- Document Type: `Plan`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02-05`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/src/interviewTrainer/interface/`
  - `interview-trainer/src/interviewTrainer/application/`
  - `interview-trainer/src/interviewTrainer/domain/`
  - `interview-trainer/src/interviewTrainer/infra/`
  - `interview-trainer/webview/src/`
  - `interview-trainer/docs/architecture/`

## Background and Goals
- 在不改变现有功能行为的前提下，逐步建立清晰分层边界和稳定依赖方向。
- 通过阶段化迁移降低大规模重构风险，并提升模块可测性与可维护性。

## Scope and Non-goals
- Scope:
  - 明确扩展端与 Webview 端分层目录和职责。
  - 迁移高耦合流程到 Application 编排层，收敛 Interface/Domain 越层依赖。
  - 通过文档与测试同步锁定架构约束。
- Non-goals:
  - 不做一次性“大爆炸”重写。
  - 不在本计划中替换现有协议模型与全量目录布局。

## Task Matrix (Summary)
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| A1 | P0 | In Progress | 分层目录职责与依赖方向固化 | Interface/Application/Domain/Infra 职责边界可审计 |
| A2 | P0 | In Progress | 高耦合模块分阶段迁移与拆分 | 关键流程编排从入口/handler 下沉到 use-case/flow |
| A3 | P1 | In Progress | 文档与测试同步（含架构检查） | 构建、测试、架构检查可稳定通过 |

## Verification
- Commands:
  - `npm run build`
  - `npm run test`
  - `npm run check:arch`
- Evidence:
  - 关键模块不存在反向依赖与跨层 I/O 渗透。
  - 迁移后流程行为与原契约保持一致。

## Risks and Rollback
- Risks:
  - 分阶段重构期间可能出现双路径并存，导致维护复杂度短期上升。
  - 类型边界变更可能触发连锁编译/测试失败。
- Rollback:
  - 以批次粒度回滚单阶段迁移，不回滚整条链路。
  - 保留兼容适配层，确保回退窗口内业务可运行。

## Progress Log
- `2026-02-05`: 建立架构重构计划与阶段目标。
- `2026-02-21`: 文档规范化，补齐任务矩阵与验证/回滚口径。

## Legacy Detailed Plan
> 以下内容保留原始重构规划细节与任务分解。

更新时间：2026-02-05

目标：在不改变功能与外部行为的前提下，建立清晰的前后端分层边界，降低耦合，提升可维护性与可扩展性。

---

## 1. 现状概述（简述）

- 扩展端与 Webview 端均已按“功能目录”拆分，但层级边界仍混杂：
  - 业务流程与请求执行、存储、协议类型等交织。
  - handlers 直接触达多层逻辑，难以复用与测试。
- Webview 端存在“按页面/按功能”与“按层次”并存，职责不够聚焦。

---

## 2. 目标架构总览（建议结构）

### 2.1 扩展端（Extension / Backend）

```
src/
  extension.ts
  interviewTrainer/
    interface/
      commands/
      webview/
      handlers/
    application/
      services/
      useCases/
    domain/
      analyze/
      notes/
      entities/
      errors/
    infra/
      api/
      storage/
      utils/
    protocol/
    constants/
```

### 2.2 Webview（Frontend）

```
webview/src/
  app/
    App.tsx
    router.tsx
  features/
    practice/
      components/
      hooks/
      types.ts
    settings/
      components/
      hooks/
      types.ts
  shared/
    components/
    hooks/
    utils/
  messenger/
    index.ts
  types/
```

---

## 3. 模块边界与职责范围（必须遵守）

### 3.1 Interface 层（接口层）
- 仅负责：接收 VS Code 命令 / Webview 消息、输入校验、权限与上下文收集。
- 禁止：直接处理业务流程或 I/O 逻辑。

### 3.2 Application 层（应用层）
- 负责：流程编排、用例组织、跨模块协调（如：开始分析 -> 调用多个 Domain 处理 -> 汇总输出）。
- 可以调用：Domain、Infra。
- 禁止：写入 UI、直接做复杂 I/O。

### 3.3 Domain 层（领域层）
- 负责：核心业务逻辑（题目解析、评分、分段、笔记检索策略等）。
- 禁止：任何外部 I/O、模板请求执行、文件读写。

### 3.4 Infra 层（基础设施层）
- 负责：API 请求、模板执行、存储读写、文件系统、网络、日志适配。
- 禁止：直接编排业务流程。

### 3.5 Protocol 层
- 统一协议类型定义（Webview/Backend 共享）。
- 禁止：带业务逻辑。

---

## 4. 迁移计划（分阶段，避免大爆炸）

### Phase 0 - 预备阶段（结构铺设）
- 建立目标目录结构（空目录/README 说明）。
- 新增 `docs/architecture/`（若需要）用于架构说明与边界规范。
- 不移动代码，仅建立目录与约束。

### Phase 1 - 协议与类型统一
- 将 `src/protocol/*` 与 `webview/src/types.ts` 对齐：
  - 统一为 `src/protocol/` 为源头。
  - Webview 通过类型镜像或导出脚本同步（不引入 Node 依赖）。
- 清理重复类型定义。

### Phase 2 - Infra 抽离（API/存储/工具）
- API 相关：
  - `src/interviewTrainer/api/*` 迁移至 `infra/api/*`。
- Storage 相关：
  - `src/interviewTrainer/storage/*` 迁移至 `infra/storage/*`。
- 工具：
  - `src/interviewTrainer/utils/*` 迁移至 `infra/utils/*` 或 `domain/utils`（按是否纯逻辑区分）。

### Phase 3 - Domain 归位（核心逻辑）
- 将 `core/analyze/*`、`core/notes/*` 移入 `domain/*`。
- 保证 domain 只保留纯逻辑和模型。

### Phase 4 - Application 编排
- 将 `core/it_analysisFlow.ts` 等流程文件重组为 `application/useCases/*`。
- 流程中调用 domain + infra，禁止渗透到 interface。

### Phase 5 - Interface 重新接线
- 将 `handlers/*` 放入 `interface/webview` 并薄化。
- `InterviewTrainerExtension.ts` 只保留命令注册与调用 application 用例。

### Phase 6 - Webview 整理
- 按 feature 拆分：practice / settings / shared。
- 把 hooks 与 UI 组件对齐到 feature 目录。
- messenger 统一为 `webview/src/messenger`。

---

## 5. 迁移输出物清单

- 目录结构落地
- 应用层 useCases + services 划分
- handlers 简化（只做消息桥接）
- API/Storage/Utils 归入 infra
- Protocol 类型统一

---

## 6. 风险与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| 循环依赖 | domain / infra / application 可能互相引用 | 迁移时强制单向依赖 |
| 路径重写造成漏改 | import 路径多 | 使用批量脚本 + 类型检查 |
| Webview 构建失败 | esbuild 入口/路径变化 | 每阶段 build 验证 |
| 文档失真 | 文档路径更新后失效 | 文档更新作为每阶段任务 |

---

## 7. 文档更新清单（需写入计划）

必须更新：
- `AGENTS.md`（新增架构约束、目录规范、分层边界）
- `docs/modules/`：
  - `frontend-entry.md`
  - `frontend-components.md`
  - `backend-webview-bridge.md`
  - `config.md`
  - `scripts.md`
- `docs/architecture/README.md`（新增：分层架构说明与迁移状态）

可选更新：
- `README.md`（总体架构 + 开发导航）
- `PLUGIN_DEV_GUIDE.md`（改动后路径与流程）

---

## 8. 交付与验证标准

- `npm run build` 必须通过
- `npm run package` 产物可生成
- VS Code 中核心功能（分析/转写/评价/笔记）行为不变
- Webview UI 不应变形
- 重要日志与配置路径不改变（除非计划确认）

---

## 9. 下一步执行策略（建议）

1) 按 Phase 0-2 先完成基础结构与 API/Storage 拆分
2) 再做 domain/application 接线
3) 最后处理 Webview 目录与类型统一

每阶段完成后必须：build + 手动回归关键流程。

---

## 10. 任务拆解清单（可执行任务）

### Phase 0 - 结构铺设
1. 新增目标目录树（空目录 + README 约束）。
2. 新增 `docs/architecture/README.md` 初版（架构原则 + 迁移状态表）。
3. 更新 `AGENTS.md`：写入分层边界与禁止事项。

### Phase 1 - 协议与类型统一
4. 盘点 `src/protocol/*` 与 `webview/src/types.ts` 的重叠/冲突项。
5. 定义“单一来源协议”策略（源在 `src/protocol/`）。
6. 生成/同步 Webview 协议类型（镜像文件或构建脚本方案）。
7. 清理重复类型定义，修复 import 依赖。

### Phase 2 - Infra 抽离
8. 迁移 `src/interviewTrainer/api/*` → `src/interviewTrainer/infra/api/*`。
9. 迁移 `src/interviewTrainer/storage/*` → `src/interviewTrainer/infra/storage/*`。
10. 将 `src/interviewTrainer/utils/*` 归入 `infra/utils` 或 `domain/utils`（按纯逻辑与 I/O 区分）。
11. 批量修复 import 路径并运行 `npm run build`。

### Phase 3 - Domain 归位
12. 迁移 `core/analyze/*` → `domain/analyze/*`。
13. 迁移 `core/notes/*` → `domain/notes/*`。
14. 清理 domain 中的 I/O 逻辑（如有则上移到 infra）。
15. 统一 domain 内部依赖，保证无 infra 反向依赖。

### Phase 4 - Application 编排
16. 新建 `application/useCases/` 并迁移分析流程文件。
17. 将 `it_analysisFlow.ts` 等流程封装为 use case（入参/出参规范）。
18. 建立 `application/services/`，抽出配置/会话/进度协作逻辑。
19. 让 useCases 只依赖 domain + infra 接口，不直接依赖 handlers。

### Phase 5 - Interface 重新接线
20. 迁移 `handlers/*` → `interface/webview/*` 并薄化（仅解析输入/派发 useCase）。
21. `InterviewTrainerExtension.ts` 仅保留命令注册与调用 useCase。
22. 清理旧入口/旧路径引用。

### Phase 6 - Webview 整理
23. 新建 `webview/src/features/` 结构并迁移 practice/settings。
24. 迁移 hooks 与 components 到对应 feature 目录。
25. 统一 `messenger` 与协议类型引用路径。
26. 全量修复 import + 运行 webview build。

### Phase 7 - 文档更新与校验
27. 更新 `docs/modules/*`（路径变更、模块职责、调用链）。
28. 更新 `README.md`、`PLUGIN_DEV_GUIDE.md`（架构与迁移说明）。
29. 全量 `npm run build`，通过后 `npm run package`。

---

> 以上为架构规划与迁移计划，已附可执行任务清单。执行前每个任务可再细化为文件级迁移列表。
