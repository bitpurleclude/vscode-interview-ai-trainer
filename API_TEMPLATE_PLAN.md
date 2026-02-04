API 模板化接入规划（面向“无预设方案”的多厂商 API）

目标
- 允许用户用“请求模板 + 占位符”的方式快速接入任何 API，无需内置专用适配器。
- 保留插件现有能力（题目解析 / 多题分段 / 面试评价），但支持为每个任务绑定不同模板。
- 提供“现场测试”（Dry-run 与 Live Test），方便快速验证模板可用性与流式输出。
- 采用“彻底替换”方案：用统一模板管理替代当前 LLM/ASR/Embedding 的传统表单配置。
- 保留非 API 相关设置（提示词、输入设备、检索策略、历史命名）为独立区块。

一、模板类型清单（可扩展）
1) 非流式 REST JSON（最通用）
   - 典型：POST/GET + JSON body
   - 适合：普通 Chat/Responses/自定义接口
2) SSE 流式（text/event-stream）
   - 典型：stream=true + SSE 数据增量
   - 适合：需要实时输出的面试评价 / 题目解析
3) NDJSON/Chunked JSON
   - 典型：一行一个 JSON（非 SSE）
   - 适合：部分网关或代理服务
4) WebSocket 流式
   - 适合：部分厂商以 WS 输出增量
5) multipart/form-data
   - 适合：音频/图片/文件上传（ASR/TTS 等）
6) 二进制请求/响应
   - 适合：TTS 输出音频、ASR 直接上传原始音频
7) 签名/鉴权模板
   - API Key / Query Key / HMAC 签名 / OAuth Token 刷新

二、模板分类（能力类型，建议必填）
- LLM（文本生成/评审/解析）
- ASR（语音转文字）
- TTS（文字转语音）
- Embedding（向量化/检索）
- Vision（图片理解）
- Tools/Function（工具调用/结构化输出）
作用
- 列表分组更清晰，模板更容易复用
- 任务绑定时限制可选范围（例如：题目解析/多题分段/面试评价 -> 仅 LLM）
- 未来扩展新能力不会与现有模板混杂
- 彻底替换旧表单后，分类成为主导航入口

三、占位符与变量绑定（核心）
- 占位符语法：{{var}}
- 变量白名单（系统提供，模板只允许引用这些变量）
  - 基础：inputText / systemPrompt / model / stream / timeoutSec
  - 质量：reasoning / reasoningEffort / instructions
  - 任务上下文：taskName / questionIndex / questionText / answerText
  - 连接：baseUrl / responsesPath / apiKey（仅注入，不落盘）
- 类型注入：占位符支持“字符串/数字/对象/数组/布尔”类型，避免全部变字符串。
- 未知占位符或未提供变量：阻止发送并提示错误。

四、模板结构（建议 schema）
- TemplateMeta
  - id / name / provider / category / tags / version / updatedAt
- Request
  - method / url / headers / query / body / timeoutSec / stream
- ResponseParsing
  - mode: json | sse | ndjson | websocket | binary
  - textPath（简易路径）
  - jsonPath（高级可选）
  - errorPath / statusPath / doneSignal
- StreamingParsing（仅流式）
  - eventDelimiter（默认 \n\n）
  - dataPrefix（默认 "data:"）
  - deltaPath（增量字段路径）
  - doneSignals（例如 [DONE], status=completed）
  - heartbeatPattern（可选，忽略心跳）

五、SSE 流式模板需要配置的设计项
1) 请求层
   - stream=true / Accept: text/event-stream / 超时更长
2) 事件边界
   - 分块规则：\n\n 为一条事件（可配置）
3) 数据解析
   - data: 前缀处理
   - data JSON 解析与字段路径（deltaPath）
4) 完成条件
   - data: [DONE] 或 finish/status 字段
5) 错误解析
   - errorPath + 原始 data 兜底
6) 展示策略
   - 拼接策略 + UI 节流 + 最大展示长度（如 200 字）

六、模板现场测试（强烈建议）
1) Dry-run（不发网）
   - 占位符替换结果预览
   - 校验必填字段与类型
2) Live Test（真实请求）
   - 真实发包，显示请求、响应、耗时
   - SSE 模式实时预览增量输出
3) 日志
   - 自动脱敏 Authorization / apiKey
   - 错误时保存响应片段用于排查

七、配置写入 / 管理 / 使用流程（建议）
1) 新建模板
   - 选择“分类（能力类型）” + “模板类型” -> 填写 URL/Headers/Body -> 选择解析模式
2) 绑定任务
   - 题目解析 / 多题分段 / 面试评价 仅允许绑定 LLM 模板
   - ASR/Embedding 绑定到各自能力入口
3) 统一环境管理
   - 环境（prod/dev/自定义）作为容器：保存模板集合 + 任务绑定
   - 切换环境即切换整套 API 方案
4) 保存方式
   - 模板配置存 JSON（UTF-8）
   - 密钥存 SecretStorage（只在运行时注入）
5) 请求发送
   - 运行时选择任务 -> 载入模板 -> 注入变量 -> 发送
6) 响应处理
   - 非流式：按 textPath / jsonPath 取文本
   - 流式：按 deltaPath 逐块输出
7) 现场测试
   - 模板编辑页面直接测试（Dry-run / Live Test）

八、迁移策略（从现有配置到模板）
1) 预置“官方模板”
   - 现有 OpenAI/Responses 等适配器转换为模板并标记 category=LLM
2) 旧配置兼容
   - 首次打开时自动生成模板并提示“已迁移”
3) 逐步废弃旧字段
   - 提供迁移提示与只读视图

九、开发阶段规划（分步执行）
阶段 1：模板 schema + UI 编辑器 + Dry-run
阶段 2：非流式请求发送与解析
阶段 3：SSE 流式解析与实时输出
阶段 4：任务绑定与旧配置迁移
阶段 5：测试、日志完善、文档补充

十、参数分层与发送规则（关键约束）
1) 本地策略参数（不发送）
   - 影响运行流程（切分、并发、重试、超时、前缀复用等）
2) 模板参数（按模板引用才发送）
   - 仅当模板中引用 {{var}} 才进入请求体
3) 未知变量处理
   - 模板中出现未知变量 -> 直接提示错误并阻止发送
4) 引用状态面板
   - 模板编辑区右侧显示“可引用参数 + 引用状态”
   - 已引用/未引用/未定义/空值四种状态

十一、reasoning.effort 与 toolsPreset
1) reasoning.effort
   - 改为“自由输入 + 常用值可保存”
   - 空值不发送；仅模板引用时发送
2) toolsPreset
   - 当前插件不需要，默认废弃不展示

十二、彻底替换方案（规划要点）
1) 旧配置页面完全替换
   - 移除传统 LLM/ASR/Embedding 表单
   - 所有配置统一进入“模板管理 + 任务绑定”
2) 入口统一
   - “环境”作为顶层容器
   - “模板列表”与“绑定面板”并列
3) 兼容保障
   - 首次迁移自动生成模板（LLM/ASR/Embedding）
   - 旧配置文件保留只读备份
4) 运维能力
   - 导入/导出模板集合（JSON）
   - 一键复制环境
   - 模板级测试（Dry-run/Live/SSE）
5) 检索配置替代方案
   - 检索所需的模型/向量参数写入 Embedding 模板
   - 其他检索策略参数独立保留为“检索策略”子面板

十三、影响文件与修改方向（概览）
1) Webview 页面（UI/编辑/测试）
   - interview-trainer/webview/src/InterviewTrainer.tsx
   - 新增：TemplateManager / TemplateEditor / TemplateTestPanel
2) 扩展端配置与存储
   - 新增 TemplateService（模板 CRUD + 环境切换）
   - SecretStorage 保存 API Key（模板仅占位符）
3) 请求构建与解析
   - it_requestBuilder.ts：模板驱动构建 + 占位符注入
   - 新增 TemplateParser / SseParser
4) Webview ↔ Extension 通信
   - it_webviewHandlers.ts / protocol/interviewTrainer.ts
5) 迁移与文档
   - 旧配置迁移脚本（首次启动生成模板）
   - README.md 更新模板化接入说明

十四、UI 结构示意（字符画：完整规划，全部内嵌）
说明：所有配置、测试、密钥与引用状态均内嵌在设置主页面，不再使用弹窗。
1) 主设置页（默认 LLM 分类）
┌────────────────────────── 设置页（模板化统一管理） ──────────────────────────┐
│ 全局/环境                                                                  │
│ 环境: [prod ▼] 新建[____] [创建并切换] [复制当前] [删除环境] [重载] [查看配置]│
│ 保存目录: [sessions____________]  日志: [关▼]  实时输出: [开] 折叠:[开] 预览:200│
├────────────────────────── API 模板管理（LLM 分类） ─────────────────────────┤
│ 分类: [LLM ▼] [ASR] [Embedding] [TTS灰] [Vision灰] [Tools灰]               │
│ ┌───────────────┐   ┌──────────────────────────────────────────────┬──────┐ │
│ │ LLM / 评价    │   │ 模板编辑                                     │参数/│ │
│ │ LLM / 分段    │   │ 名称: [________]  分类:[LLM▼] 类型:[SSE▼]    │引用 │ │
│ │ LLM / 解析    │   │ URL: [https://...____________] Method:[POST▼]│状态 │ │
│ │ ASR / 转写    │   │ Headers: { "Authorization":"Bearer {{secrets.k1}}" }│面板│ │
│ │ Emb / 检索    │   │ Body: { "model":"{{model}}","input":[...] }  │      │ │
│ └───────────────┘   │ 解析: textPath[...] jsonPath[...] errorPath[...]      │ │
│                     │ SSE: deltaPath[...] doneSignals[...]                  │ │
│                     └──────────────────────────────────────────────┴──────┘ │
│ 可引用参数(LLM)             引用状态                                         │
│ {{model}}                   ✅ 已引用                                        │
│ {{stream}}                  ⚪ 未引用                                        │
│ {{reasoningEffort}}         ⚠ 空值                                           │
│ {{unknown_var}}             ❌ 未定义                                        │
│ 密钥库(命名) + 变量选项（reasoning.effort 可自定义并保存）                     │
│ 测试区 [Dry-run] [Live]  请求预览(脱敏) | 响应预览(实时)                      │
├────────────────────────── 绑定与本地策略 ───────────────────────────────────┤
│ 任务绑定(LLM): 解析[...] 分段[...] 评价[...]                                 │
│ ASR 绑定: 转写[...]   Embedding 绑定: 检索[...]                              │
│ LLM 本地策略: 超时/重试/防重复/前缀复用                                       │
│ LLM 模板参数(仅模板引用才发送): model / reasoning.effort / web_search / stream │
│ ASR 本地策略: 分片/并发/超时/重试  | 可选发送: lang/dev_pid                   │
│ Embedding 本地策略: topK/chunk/overlap                                       │
├────────────────────────── 提示词 / 输入 / 检索 / 历史 ──────────────────────┤
│ 提示词：题目解析 / 多题分段 / 面试评价                                       │
│ 输入设备：录音设备选择                                                      │
│ 检索策略：TopK/MinScore/并发/缓存/目录（模板绑定仅显示）                     │
│ 历史命名：规则/长度/前缀/预览                                               │
└───────────────────────────────────────────────────────────────────────────┘

2) ASR 分类（内嵌示意）
┌────────────────────────── API 模板管理（ASR 分类） ─────────────────────────┐
│ 分类: [LLM] [ASR ▼] [Embedding] [TTS灰] [Vision灰] [Tools灰]               │
│ ┌───────────────────────┐   ┌────────────────────────────────────────────┬──┐│
│ │ ASR / 转写-默认        │   │ 模板编辑                                     │参││
│ │ ASR / 转写-备用        │   │ 名称/类型/URL/Headers/Body/解析             │数││
│ └───────────────────────┘   └────────────────────────────────────────────┴──┘│
│ 可引用参数(ASR) + 引用状态 + 密钥库                                         │
│ 测试区 [Dry-run] [Live]  请求预览(脱敏) | 响应预览(实时)                     │
└────────────────────────────────────────────────────────────────────────────┘

3) Embedding 分类（内嵌示意）
┌──────────────────────── API 模板管理（Embedding 分类） ─────────────────────┐
│ 分类: [LLM] [ASR] [Embedding ▼] [TTS灰] [Vision灰] [Tools灰]               │
│ ┌───────────────────────┐   ┌────────────────────────────────────────────┬──┐│
│ │ Emb / 检索-默认        │   │ 模板编辑                                     │参││
│ │ Emb / 检索-备用        │   │ 名称/类型/URL/Headers/Body/解析             │数││
│ └───────────────────────┘   └────────────────────────────────────────────┴──┘│
│ 可引用参数(Embedding) + 引用状态 + 密钥库                                   │
│ 测试区 [Dry-run] [Live]  请求预览(脱敏) | 响应预览(实时)                     │
└────────────────────────────────────────────────────────────────────────────┘

待你确认后，我会按此规划进入下一步实现。

十五、代码修改方向（明确到模块/文件）
1) Webview 设置页与组件
   - interview-trainer/webview/src/InterviewTrainer.tsx
     - 彻底替换旧 LLM/ASR/Embedding 表单，改为“模板管理 + 任务绑定”。
     - 新增右侧“可引用参数/引用状态”面板（随分类切换）。
     - 保留并重排：提示词区、输入设备区、检索策略区、历史命名区。
   - interview-trainer/webview/src/components/*
     - 新增 TemplateManager / TemplateEditor / TemplateTestPanel / ParamUsagePanel。
   - interview-trainer/webview/src/styles.css
     - 新布局样式（模板列表/编辑区/右侧状态面板/测试区）。
2) 协议与前后端数据结构
   - interview-trainer/src/protocol/interviewTrainer.ts
     - 重建 ItConfigSnapshot：加入 templates、bindings、paramUsage、envMeta。
     - 移除旧 llm/asr Profiles 依赖或保留为迁移兼容字段。
3) 配置存储与迁移
   - interview-trainer/src/interviewTrainer/api/it_apiConfig.ts
     - 新增模板存储结构（templates、template_sets、bindings）。
     - 保留旧字段为只读迁移来源。
   - interview-trainer/src/interviewTrainer/api/it_configService.ts
     - 新增 Template CRUD、环境切换、模板绑定、迁移逻辑。
     - SecretStorage 改为模板级 apiKey 存取。
4) Webview ↔ Extension handlers
   - interview-trainer/src/interviewTrainer/handlers/it_webviewConfigHandlers.ts
     - 删除 LLM/ASR Profile 的保存/加载接口，替换为模板 CRUD 与绑定接口。
   - interview-trainer/src/interviewTrainer/handlers/it_webviewRetrievalHandlers.ts
     - Embedding 接入改为“绑定 Embedding 模板”，仅保留检索策略保存逻辑。
   - interview-trainer/src/interviewTrainer/handlers/it_webviewTestHandlers.ts
     - 测试改为模板驱动：Dry-run/Live/SSE 统一入口。
5) 核心调用链
   - interview-trainer/src/interviewTrainer/core/it_analyze.ts
     - 题目解析/多题分段/面试评价：从“LLM 配置”改为“LLM 模板绑定”。
   - interview-trainer/src/interviewTrainer/core/it_questionParser.ts
     - LLM 解析走模板执行器（仍保留 heuristics 兜底）。
   - interview-trainer/src/interviewTrainer/core/it_notes.ts
     - Embedding 走模板执行器（保持缓存与检索逻辑）。
   - interview-trainer/src/interviewTrainer/core/it_embeddingWarmup.ts
     - 预计算使用模板绑定的 Embedding 配置。
6) 请求构建与执行
   - interview-trainer/src/interviewTrainer/api/it_requestBuilder.ts
     - 增加“模板渲染 + 占位符注入 + 类型注入”能力。
   - interview-trainer/src/interviewTrainer/api/it_llm.ts / it_embedding.ts / it_baidu.ts / it_volc_asr.ts
     - 保留原实现作为兼容适配，新增模板驱动执行入口。

十六、可复用接口/代码优化思路
1) 统一执行器（TemplateExecutor）
   - 将 LLM/ASR/Embedding 的请求发送与解析收敛为一个执行器：
     - 输入：模板 + 变量 + 解析规则
     - 输出：统一结果 + 可选流式回调
   - 复用现有 it_callLlmChatStreaming / it_callEmbedding 的基础逻辑。
2) 统一日志与脱敏
   - 复用 it_webviewTestHandlers.ts 里的 header 脱敏逻辑，
     统一用于模板测试与运行期的 debug 输出。
3) 统一配置快照
   - 复用 it_configSnapshot.ts 的“聚合快照”模式，
     新增模板快照字段，减少前端拼装逻辑。
4) 统一 SecretStorage
   - 复用 it_applySecretOverrides 的 secret 读取方式，
     将 key 存储扩展为 templateId 维度（而非 provider/profile）。
5) 兼容旧接口减少改动量
   - LLM/ASR/Embedding 的旧调用函数保留，
     由 TemplateExecutor “适配”到旧函数，降低改动风险。
6) 逐步替换策略
   - 第一阶段仅新增模板执行器与 UI，
     旧配置迁移后走模板执行路径；
     旧代码保持可回退，降低上线风险。
