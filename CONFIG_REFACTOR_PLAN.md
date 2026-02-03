# 配置重构规划（新增/写入/保存 + 请求发送）

## 1. 目标
- 解决当前配置“过于抽象”、难以追踪“新增/写入/保存”与实际请求参数对应关系的问题。
- 统一多供应商/多任务（题目解析、多题分段、面试评价）配置入口，降低误配与维护成本。
- 为后续支持 `Responses`（含自定义路径）与更多能力开关（web_search、file_search、reasoning、stream 等）打下清晰结构基础。

## 1.1 实施进度（完成一项标记一项）
- [x] 12.1 状态流式仅显示最新 200 字（UI 截断）
- [x] 12.2 面试评价三路流式并行展示
- [x] 11. Responses 支持（openai_compatible + 自定义 responsesPath + toolsPreset）
- [x] 10. 设置页改造（Profile 管理 + 任务覆盖）
- [x] 3-7 配置重构（ConfigService + 保存/迁移）

## 2. 当前痛点（简述）
- 配置来源多（全局/工作区/任务级/临时），合并逻辑分散且不透明。
- “新增配置”与“写入保存”位置不统一，导致 UI 与运行时读取不一致。
- 请求构造在多个模块内分叉，难以定位某个字段最终如何影响请求。

## 3. 重构方案概览
1) **引入统一配置服务（ConfigService）**：集中负责加载、合并、规范化、校验、掩码、保存。
2) **统一配置结构（NormalizedConfig）**：以 provider/profile/task 三层分明为核心，明确“新增/写入/保存”的落点。
3) **请求发送统一入口（RequestBuilder）**：对 Chat/Responses/OpenAI-compatible 等模式使用同一入口生成请求体与 URL。

## 4. 新配置结构（建议）
```json
{
  "profiles": {
    "default": {
      "provider": "openai_compatible",
      "baseUrl": "https://...",
      "apiKey": "***",
      "apiMode": "chat|responses",
      "responsesPath": "/v1/responses", 
      "model": "...",
      "reasoningEffort": "minimal|low|medium|high",
      "maxOutputTokens": 800,
      "stream": true,
      "webSearch": false,
      "fileSearch": false,
      "reusePrefix": true,
      "tooling": {
        "toolsPreset": "codex_like",
        "tools": [/* 可选: 允许高级用户覆盖 */]
      }
    }
  },
  "tasks": {
    "question_parse": { "profile": "default", "overrides": { "reasoningEffort": "minimal" } },
    "segment_split": { "profile": "default", "overrides": { "maxOutputTokens": 0 } },
    "evaluation": { "profile": "default", "overrides": { "reasoningEffort": "medium" } }
  }
}
```
> 说明：profiles 代表“新增配置”的主落点；tasks 只保留与任务相关的最小覆盖。

## 5. “新增/写入/保存”具体流程
### 5.1 新增配置（UI/设置页）
- 新增时只操作 `profiles.<name>` 下的字段。
- UI 不直接写入散落字段，而是调用 `ConfigService.saveProfile()`。

### 5.2 修改配置
- 修改配置时仅修改 `profiles.<name>` 或 `tasks.<task>.overrides`。
- 通过 `ConfigService.update()` 做字段规范化（如 baseUrl 去尾斜杠、空字符串清理）。

### 5.3 保存配置
- 所有保存只写一个文件（如 `settings.json` 或插件自有配置文件），确保 UTF-8。
- 由 `ConfigService.save()` 统一写入，并记录变更摘要与版本号（用于后续迁移）。

## 6. 请求发送的统一构建流程
1) 运行时通过 `ConfigService.getEffectiveConfig(task)` 获取：
   - profile 基础配置 + task overrides 的最终结果（NormalizedConfig）。
2) 交给 `RequestBuilder`：
   - 根据 `apiMode=chat|responses` 选择端点与 body 结构。
   - `responses` 模式可使用 `responsesPath`（如 `https://gmn.chuangzuoli.com/responses`）。
3) 统一日志：
   - 输出“最终 URL + 请求体摘要 + 关键参数”（隐藏 apiKey）。

## 7. 迁移策略
- 首次启动检测旧配置：自动迁移为 `profiles.default + tasks.*.overrides`。
- 保留兼容读取：若旧字段存在，写入迁移后的新结构。

## 8. 风险与兼容性
- 风险：工具列表（tools）在某些网关为必填，需要预置 `toolsPreset`。
- 兼容：保留旧字段读取兜底，避免历史配置失效。

## 9. 实施步骤（高层）
1) 新增 `ConfigService` 与 `RequestBuilder`。
2) UI 与任务调用端改为使用统一服务。
3) 迁移旧配置与日志输出。
4) 回归测试：题目解析 / 多题分段 / 评价 + 旧配置兼容。

## 10. 设置页改造规划（接口配置管理）
### 10.1 结构分区
- 顶部：**当前激活 Profile**（下拉选择 + 新建/复制/删除）。
- 中部：**Profile 详情**（基础连接 + 模型 + 高级能力）。
- 底部：**任务覆盖**（题目解析 / 多题分段 / 面试评价，各自选择 Profile + overrides）。

### 10.2 Profile 详情字段
- 连接类：provider、baseUrl、apiKey（脱敏显示）、apiMode（chat/responses）。
- Responses 专属：responsesPath（默认 `/v1/responses`，可改 `/responses`）。
- 模型类：model、temperature、topP、maxOutputTokens。
- 推理/流式：reasoningEffort、stream、maxRetries、timeoutSec。
- 能力开关：webSearch、fileSearch、reusePrefix。
- 工具预设：toolsPreset（如 codex_like）+ “高级自定义 tools”（可折叠）。

### 10.3 任务覆盖区（Task Overrides）
- 每个任务：选择 Profile + 可选覆盖项（仅常用字段，避免复杂度过高）。
- 覆盖仅写入 `tasks.<task>.overrides`，不污染 profile。

### 10.4 交互与校验
- 新建 Profile：输入名称后复制默认值。
- 修改即时保存，但保留“保存按钮”明确写入。
- baseUrl、responsesPath、model 必填校验。
- apiKey 为空仅允许保存配置，不允许实际调用。

### 10.5 兼容与迁移提示
- 首次加载旧配置：提示“已迁移到 profiles.default”。
- 旧字段只读展示，避免误操作。

### 10.6 可观测性
- 设置页显示“当前请求配置来源”：profile 名称 + overrides 列表。

## 11. Responses 支持修改规划
### 11.1 配置新增
- profile 增加 `apiMode`（chat/responses）与 `responsesPath`。
- 增加 `tooling.toolsPreset` 与可选 `tooling.tools` 覆盖。
- 增加可选 `responsesOptions`（include/store/prompt_cache_key）。

### 11.2 请求构造策略
- `apiMode=responses` 时：
  - URL = `baseUrl + responsesPath`。
  - body 使用 `instructions + input` 结构：
    - `input` 采用 `[{type:"message", role, content:[{type:"input_text", text}]}]`。
  - 支持 `reasoning.effort`、`max_output_tokens`、`stream` 等字段。
- 兼容 `tools`：如遇网关必须字段（如 GMN），通过 `toolsPreset` 自动注入。

### 11.3 网关兼容（GMN 等）
- 预置 `codex_like` 工具清单，保证最小可用请求。
- 若 `toolsPreset=codex_like` 则自动添加：
  - `tools`、`tool_choice`、`parallel_tool_calls`、`include` 等必要字段。
- 允许高级用户通过 `tooling.tools` 覆盖默认工具列表。

### 11.4 流式解析
- SSE 事件处理：`response.created` / `response.output_text.delta` / `response.completed`。
- 非流式：解析 `output_text` 聚合输出。
- 失败时记录请求摘要与响应体（脱敏）。

### 11.5 回退与兼容
- 如果 responses 请求失败（4xx/5xx），提示用户检查 `responsesPath` 与工具预设。
- 保留 chat 路径不受影响，作为兜底。

## 12. 状态流式显示与面试评价三路流式并行（UI 规划）
### 12.1 状态流式“仅显示最新 200 字”
- 目标：避免状态面板从头到尾无限追加导致噪音与卡顿。
- 规则：每次更新仅保留**最新 200 字**，不足则原样显示。
- 位置：状态显示组件（题目解析 / 多题分段 / 面试评价共用）。
- 兼容：日志仍完整保存，状态面板仅做“可视截断”。  

### 12.2 面试评价三条答案同时流式显示
- 目标：三题评价同时开始、同时展示，减少等待与误解。
- UI 结构：将“面试评价”区域扩展为三列或三块卡片并排/分区显示（自适应宽度）。
- 渲染策略：
  - 每题各自维护 stream buffer（独立 200 字截断规则）。
  - 三路流式同时刷新，不互相覆盖。
- 状态指示：每题显示“正在输出/已完成/失败”的小状态标签。

### 12.3 面积与可读性
- 面试评价区域高度增加（或可展开），保证同时显示三条内容不拥挤。
- 折叠逻辑：输出完成后可自动折叠为“标题 + 预览（200 字）”。

### 12.4 交互与开关
- 开关：延续现有“流式显示开关”，三路流式同一开关控制。
- 高级设置：保留“最大显示字数 N（默认 200）”配置项，便于后续扩展。
