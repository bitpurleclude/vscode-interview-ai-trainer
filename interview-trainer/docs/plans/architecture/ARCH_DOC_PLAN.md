# 架构分类与工程文档规划（草案）

## Document Metadata
- Document Type: `Plan`
- Status: `In Progress`
- Owner: `Interview Trainer Maintainers`
- Created: `2026-02`
- Last Updated: `2026-02-21`
- Related Paths:
  - `interview-trainer/docs/architecture/`
  - `interview-trainer/docs/modules/`
  - `interview-trainer/src/`
  - `interview-trainer/webview/src/`
  - `interview-trainer/scripts/`
  - `interview-trainer/config/`

## Background and Goals
- 对前后端模块进行统一归档和分层解释，形成可维护、可审计的工程文档体系。
- 让新同学和 AI 维护者能快速定位模块职责、调用链和注意事项。

## Scope and Non-goals
- Scope:
  - 产出 architecture 总览、目录图和模块文档，并保持命名与目录一致。
  - 覆盖扩展端、Webview、脚本和配置目录的职责说明。
  - 在文档中标注关键调用链与排障建议。
- Non-goals:
  - 不把本计划扩展为功能设计文档或产品说明书。
  - 不覆盖 `node_modules/build/out/media` 等产物目录。

## Task Matrix (Summary)
| ID | Priority | Status | Plan | Acceptance |
| --- | --- | --- | --- | --- |
| D1 | P0 | In Progress | 输出 `ARCHITECTURE_OVERVIEW` 与 `DIRECTORY_MAP` | 架构总览和目录职责文档完整 |
| D2 | P1 | In Progress | 分模块文档补齐（backend/frontend/scripts/config） | 模块文档按模板覆盖关键目录 |
| D3 | P1 | In Progress | 文档交叉校验与构建验证 | 文档描述与代码路径一致，构建链路通过 |

## Verification
- Commands:
  - `npm run build`
  - `npm run test`
- Evidence:
  - 文档路径、模块名称与代码结构一致。
  - 关键调用链描述可映射到实际文件。

## Risks and Rollback
- Risks:
  - 目录重构或文件迁移后文档容易过期。
  - 模板不统一会导致文档可读性下降。
- Rollback:
  - 保留历史文档版本，按模块分批回滚文档变更。
  - 在索引文档中标注“待同步”状态，避免错误信息扩散。

## Progress Log
- `2026-02`: 形成初版文档规划草案和落地目录。
- `2026-02-21`: 文档规范化，补齐任务矩阵与验证/回滚口径。

## Legacy Detailed Plan
> 以下内容保留原始草案内容与确认记录。

> 目标：对 `interview-trainer/` 目录下前端与后端进行模块/目录级别归档，
> 形成架构梳理与工程文档，覆盖用途、流程、注意事项等。

## 一、范围与排除（待确认）

**覆盖范围**
- 后端扩展：`src/` 及其子目录（含 `src/interviewTrainer/`、`src/protocol/`、`src/webview/`）
- 前端 Webview：`webview/src/` 及其子目录
- 构建与脚本：`scripts/`、`config/`

**建议排除（已确认）**
- `node_modules/`
- `build/`
- `out/`
- `media/`（webview 构建产物）

**已确认保留**
- `assets/`（需要说明用途/来源）

> 已确认：`assets/` 需要说明

## 二、文档落地位置（拟定）

在 `interview-trainer/docs/` 下输出：
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`（总体架构与数据流）
- `docs/architecture/DIRECTORY_MAP.md`（目录分类与职责）
- `docs/modules/`（模块/目录工程文档）
  - `backend-api.md`（`src/interviewTrainer/api/`）
  - `backend-core.md`（`src/interviewTrainer/core/`）
  - `backend-handlers.md`（`src/interviewTrainer/handlers/`）
  - `backend-storage.md`（`src/interviewTrainer/storage/`）
  - `backend-utils.md`（`src/interviewTrainer/utils/`）
  - `backend-constants.md`（`src/interviewTrainer/constants/`）
  - `backend-protocol.md`（`src/protocol/`）
  - `backend-webview-bridge.md`（`src/webview/`）
  - `frontend-components.md`（`webview/src/components/`）
  - `frontend-hooks.md`（`webview/src/hooks/`）
  - `frontend-utils.md`（`webview/src/utils/`）
  - `frontend-constants.md`（`webview/src/constants/`）
  - `frontend-entry.md`（`webview/src` 入口与样式）
  - `scripts.md`（`scripts/`）
  - `config.md`（`config/`）

> 已确认：目录路径按上述结构执行（如需调整再补充）

## 三、文档模板（拟定：互联网公司常见要求）

每个模块文档包含：
1) 模块定位与职责  
2) 目录/关键文件清单  
3) 主要流程与数据流  
4) 与其他模块的依赖关系  
5) 配置项与环境依赖  
6) 注意事项/限制  
7) 常见问题与排查建议  
8) 测试与验证建议

## 四、执行步骤

1) 扫描目录与核心入口文件  
2) 输出 `DIRECTORY_MAP` 与总览  
3) 逐模块编写工程文档  
4) 交叉校验（前端/后端依赖一致）  
5) 按要求执行构建测试、提交与打包

## 五、确认结果

- 文档输出目录与命名：按本草案执行
- `assets/`：保留并写说明
- 需要标注“关键调用链（文件路径级）”
