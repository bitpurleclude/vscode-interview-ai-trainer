# 代码审查问题清单

更新时间：2026-01-31
说明：本清单已按严重程度重排；✅ 表示已解决，⏳ 表示未解决。历史“追加”已合并到目录，本轮新增已同步到目录。

格式约定：
- 记录格式：<状态> <严重程度> - <问题描述> `path:line`
- 严重程度：严重 / 高 / 中 / 低

## 未解决问题（按严重程度）

### 严重
- （暂无）

### 高
- ⏳ 高 - 高风险：`resetMicPermissionCache` 直接改动 VS Code 用户数据目录（WebStorage/Local Storage/Preferences），路径推断不可靠且可能破坏用户配置。`src/interviewTrainer/InterviewTrainerExtension.ts`

### 中
- ⏳ 中 - 麦克风诊断/申请权限逻辑为“空实现”，直接写死 `unknown`，UI 显示与实际权限/设备状态不一致。`webview/src/InterviewTrainer.tsx:1304`, `webview/src/InterviewTrainer.tsx:1313`
- ⏳ 中 - 检索查询缓存 key 只包含 workspaceRoot/sourceCount/corpus.length，内容变更但数量不变时会命中旧缓存，笔记命中可能过期。`src/interviewTrainer/core/it_analyze.ts:1473`
- ⏳ 中 - 千帆 LLM baseUrl 无规范化，始终拼接 `/chat/completions`，用户已配置完整路径时会重复拼接导致请求失败。`src/interviewTrainer/api/it_qianfan.ts:22`
- ⏳ 中 - 火山引擎标准版轮询只要返回非空文本就直接结束，可能在状态未完成时提前返回导致转写不完整。`src/interviewTrainer/api/it_volc_asr.ts:215`
- ⏳ 中 - `it_makeSlug` 允许 Unicode 时未处理结尾空格/点号及保留名，Windows 下可能生成无效文件名导致写入失败。`src/interviewTrainer/utils/it_text.ts:23`
- ⏳ 中 - 语料目录监听使用 `RelativePattern(workspaceRoot, path.join(normalized,...))`，若用户配置为绝对路径，pattern 可能失效导致语料更新不触发重建。`src/interviewTrainer/InterviewTrainerExtension.ts:283`
- ⏳ 中 - 取消分析仅设置 abort 标记，但 ASR 分片循环/LLM 调用未检查，取消后仍可能继续转写并写入报告。`src/interviewTrainer/core/it_analyze.ts:945`, `src/interviewTrainer/core/it_analyze.ts:1182`
- ⏳ 中 - Baidu ASR 仅在 PCM 时分片；WAV/M4A 直接整段发送，大文件易触发长度限制导致失败。`src/interviewTrainer/core/it_analyze.ts:1074`
- ⏳ 中 - 单段落超长时 `it_splitByParagraphs` 不再继续切分，可能生成超过上限的块，向量检索易超出模型输入限制。`src/interviewTrainer/core/it_notes.ts:156`
- ⏳ 中 - 检索 answers 只在数量完全匹配时生效，LLM 仅回答部分题目时会丢弃已识别答案，检索查询退化为纯题干。`src/interviewTrainer/core/it_analyze.ts:1476`
- ⏳ 中 - Webview 分析请求超时仅返回错误对象，不会通知后端取消；长任务仍会继续并写入报告，UI 显示失败但文件已生成。`webview/src/messenger.ts:41`, `webview/src/InterviewTrainer.tsx:957`
- ⏳ 中 - 后端未限制并发分析请求，超时后用户重复发起会同时运行多个分析，可能竞争写入同一主题目录。`src/interviewTrainer/InterviewTrainerExtension.ts:1932`
- ⏳ 中 - `it_buildCorpusAsync` 在 `skipMtimeCheck` 分支直接读取缓存文件，未按 `maxCacheBytes` 做大小保护，可能读入超大缓存导致内存飙升。`src/interviewTrainer/core/it_notes.ts:200`
- ⏳ 中 - 主题目录基于截断 slug，当同日出现相同前缀题目时会复用目录，导致两题记录混在一起。`src/interviewTrainer/storage/it_sessions.ts:192`
- ⏳ 中 - 逐题检索与评价使用 `Promise.all` 并发请求，多题场景可能集中触发 Embedding/LLM 限流，导致整体失败率升高。`src/interviewTrainer/core/it_analyze.ts:1504`, `src/interviewTrainer/core/it_analyze.ts:1661`
- ⏳ 中 - LLM 分段/拆分的 JSON 提取仅截取首尾花括号，遇到模型输出多段 JSON 或文本内含括号时易解析失败。`src/interviewTrainer/core/it_analyze.ts:350`
- ⏳ 中 - 火山 ASR flash 模式不分片上传，长音频仍走单次请求，可能超出服务端限制并导致转写失败。`src/interviewTrainer/core/it_analyze.ts:1011`
- ⏳ 中 - Embedding 响应数组缺失部分向量时 `it_parseEmbeddingResponse` 会返回部分结果且不校验数量，导致向量与输入错位。`src/interviewTrainer/api/it_embedding.ts:66`
- ⏳ 中 - 多题场景 `it_buildQuestionTimingsFromSegments` 只要有一个题号标记缺失就返回空数组，放弃已找到的起点，导致用时统计被整体放弃。`src/interviewTrainer/core/it_analyze.ts:122`
- ⏳ 中 - LLM/Embedding 请求重试 `for (attempt <= cfg.maxRetries)` 未设默认值，`maxRetries` 未配置时循环不执行而直接失败。`src/interviewTrainer/api/it_llm.ts:38`, `src/interviewTrainer/api/it_embedding.ts:147`
- ⏳ 中 - 题目解析请求异常未捕获，`parseQuestionsFromText` 抛错会导致 `isProcessing` 无法复位，界面卡在“处理中”。`webview/src/InterviewTrainer.tsx:900`, `webview/src/InterviewTrainer.tsx:928`
- ⏳ 中 - 导入音频无文件体积限制，直接整文件读入内存并走 `OfflineAudioContext` 渲染，大文件易导致 UI 卡死或内存暴涨。`webview/src/InterviewTrainer.tsx:765`
- ⏳ 中 - 嵌入预热在录音/分析中直接 `return` 且不重试，忙碌期触发的 warmup 可能被永久跳过。`src/interviewTrainer/InterviewTrainerExtension.ts:410`
- ⏳ 中 - `max_chunk_sec` 未校验，若配置为 0/负数会退化为 1 字节分片，造成极端分片数量与 ASR 调用风暴。`src/interviewTrainer/core/it_analyze.ts:109`
- ⏳ 中 - PCM 分片先一次性构建所有 base64 块，长音频会在内存中同时保留全部分片，存在内存峰值风险。`src/interviewTrainer/core/it_analyze.ts:109`
- ⏳ 中 - 多题检索时任一查询失败会让 `Promise.all` 整体拒绝，导致所有检索结果丢失且无法降级。`src/interviewTrainer/core/it_notes.ts:959`
- ⏳ 中 - 向量检索请求出错会直接抛出并中断分析流程，缺少“返回空检索/降级词面检索”的兜底。`src/interviewTrainer/core/it_notes.ts:827`
- ⏳ 中 - Embedding 内存缓存无上限策略，长期运行或语料规模扩大时可能造成内存持续增长。`src/interviewTrainer/core/it_notes.ts:43`
- ⏳ 中 - 火山标准版轮询在 `status=success` 但文本为空时直接返回空串，后续分析按“成功转写”继续，易产出空报告。`src/interviewTrainer/api/it_volc_asr.ts:217`
- ⏳ 中 - `timeoutSec` 未做有效数值校验，配置为 0/NaN 时会传入 axios 导致立即失败或失去超时保护。`src/interviewTrainer/api/it_llm.ts:42`, `src/interviewTrainer/api/it_embedding.ts:151`, `src/interviewTrainer/api/it_qianfan.ts:47`
- ⏳ 中 - `attempts.json` 采用读-改-写且无锁，多次并发分析/保存时存在覆盖丢失记录的竞争条件。`src/interviewTrainer/storage/it_sessions.ts:252`

### 低
- ⏳ 低 - Webview 样式多处使用 `color-mix(...)`，旧版 VS Code/Chromium 不支持时背景与按钮高亮可能失效。`webview/src/styles.css:9`
- ⏳ 低 - 火山 ASR 多句返回使用 `parts.join("")` 无分隔符，英文/数字容易粘连影响可读性与后续检索。`src/interviewTrainer/api/it_volc_asr.ts:79`
- ⏳ 低 - `questionList` 仅过滤非空但未 trim，前后空格会导致后续按题目匹配的检索/映射失效。`src/interviewTrainer/core/it_analyze.ts:1204`
- ⏳ 低 - Webview `request` 超时只 resolve 错误对象而非 reject，且部分调用未检查 `status`（如取消/打开报告），会静默失败缺少提示。`webview/src/messenger.ts:41`, `webview/src/InterviewTrainer.tsx:993`, `webview/src/InterviewTrainer.tsx:1001`
- ⏳ 低 - `it_postWithRetries` 没有退避/延时，错误时会快速重试，易触发服务端限流或配额消耗。`src/interviewTrainer/api/it_volc_asr.ts:105`
- ⏳ 低 - 会话目录日期使用 `toISOString()`（UTC），本地跨时区/临界时刻可能归档到前/后一天。`src/interviewTrainer/storage/it_sessions.ts:194`
- ⏳ 低 - 导入音频仅取 `getChannelData(0)`，立体声右声道被丢弃，可能遗漏有效语音内容。`webview/src/InterviewTrainer.tsx:797`
- ⏳ 低 - 题目解析启发式仅识别“第N题/问：”格式，常见的“1.”、“一、”或“第1题”无冒号会被识别为无题目。`src/interviewTrainer/core/it_questionParser.ts:23`, `src/interviewTrainer/core/it_questionParser.ts:24`
- ⏳ 低 - Markdown 分段仅识别 `##/###` 标题，`#` 一级标题与更深层级被忽略，导致整篇合并为大块、检索粒度变差。`src/interviewTrainer/core/it_notes.ts:183`
- ⏳ 低 - 按时间段取答案时采用“重叠即归属”，跨题边界的语音片段会被多个题目重复收录，影响逐题评估。`src/interviewTrainer/core/it_analyze.ts:635`
- ⏳ 低 - LLM 分段映射未校验 questionIndex 范围，越界值被静默丢弃，可能出现已回答但结果为空。`src/interviewTrainer/core/it_analyze.ts:415`
- ⏳ 低 - Embedding 缓存 key 直接使用 baseUrl 原串，尾部 `/` 或大小写差异会造成缓存重复/命中率下降。`src/interviewTrainer/core/it_notes.ts:267`
- ⏳ 低 - 异常分支使用 `"?????"` 字符串作为判断/提示，明显为乱码占位，实际错误难以触发且提示不可读。`src/interviewTrainer/InterviewTrainerExtension.ts:1970`
- ⏳ 低 - 历史记录回溯报告路径时，找不到目标文件会选取最新 `.md` 作为报告，若目录内有其他笔记会打开错误文件。`src/interviewTrainer/storage/it_history.ts:28`
- ⏳ 低 - 话题相似度使用逐字符位置对比，前缀相同但主题不同也可能被合并，产生错用历史目录的问题。`src/interviewTrainer/storage/it_sessions.ts:33`
- ⏳ 低 - 录音停止若未生成文件直接抛错并提前退出，未清理临时目录，长期使用会堆积垃圾文件。`src/interviewTrainer/InterviewTrainerExtension.ts:1837`
- ⏳ 低 - JSON 候选提取未忽略字符串内花括号，`it_extractJsonCandidates` 可能截断有效 JSON 导致解析失败。`src/interviewTrainer/core/it_evaluation.ts:110`
- ⏳ 低 - 新一轮分析开始未清空 `analysisResult`，处理中仍展示上次结果，易造成误判。`webview/src/InterviewTrainer.tsx:900`
- ⏳ 低 - 打开报告未检查返回状态，失败时无提示，用户无法感知打开失败原因。`webview/src/InterviewTrainer.tsx:999`
- ⏳ 低 - 加载历史列表未处理失败分支，请求异常时无反馈且界面保持旧列表。`webview/src/InterviewTrainer.tsx:1004`
- ⏳ 低 - 音频转换 fallback 使用默认超时（60s），大文件转换可能超时后仅提示“浏览器无法解码”，掩盖真实原因。`webview/src/InterviewTrainer.tsx:818`
- ⏳ 低 - `it/convertAudioToPcm` 仅在成功路径清理临时目录，失败时残留临时文件夹。`src/interviewTrainer/InterviewTrainerExtension.ts:1502`
- ⏳ 低 - 检索缓存 key 对查询文本仅取前 300 字符，长文本场景易发生缓存碰撞导致命中错误。`src/interviewTrainer/core/it_notes.ts:103`
- ⏳ 低 - 题目解析 JSON 提取仅取首尾 `{}`，遇到代码块/多段 JSON 时容易解析失败并回退。`src/interviewTrainer/core/it_questionParser.ts:61`
- ⏳ 低 - 千帆聊天未校验 `baseUrl` 是否为空，空值会生成 `/chat/completions` 相对路径，报错信息不直观。`src/interviewTrainer/api/it_qianfan.ts:17`
- ⏳ 低 - `it_nextAttemptIndex` 仅按 `##` 标题计数，报告正文出现同级标题会导致尝试次数误增。`src/interviewTrainer/storage/it_sessions.ts:278`

## 已解决问题（✅）

### 严重
- ✅ 严重 - P0-1 已改为异步 I/O：历史列表、清理向量缓存、音频转换与录音文件读写改为异步，减少扩展宿主阻塞。`src/interviewTrainer/storage/it_history.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`

### 高
- ✅ 高 - P1-1 LLM 分段失败导致逐题时间全为 0 的问题已修复。`src/interviewTrainer/core/it_analyze.ts`, `webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/core/it_report.ts`, `src/protocol/interviewTrainer.ts`
- ✅ 高 - P1-2 已尊重配置：移除 LLM `max_retries` 最少 5 次的强制逻辑。`src/interviewTrainer/core/it_analyze.ts`, `src/interviewTrainer/core/it_evaluation.ts`
- ✅ 高 - P1-3 已移除 120 段限制：LLM 分段使用完整语音片段。`src/interviewTrainer/core/it_analyze.ts`
- ✅ 高 - P1-4 已支持 `center_subdir`：历史报告优先在子目录内匹配，找不到时再回退。`src/interviewTrainer/storage/it_history.ts`
- ✅ 高 - P1-5 已添加请求超时与清理：Webview pending 不再无限堆积。`webview/src/messenger.ts`
- ✅ 高 - P1-6 已避免多 handler 回应冲突：有 `messageId` 时只响应一次。`src/webview/WebviewProtocol.ts`
- ✅ 高 - P1-7 YAML 解析已做容错：配置损坏不再导致加载崩溃。`src/interviewTrainer/api/it_apiConfig.ts`
- ✅ 高 - P1-8 已加入统一释放：扩展加入 `context.subscriptions` 并实现 `dispose`。`src/extension.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- ✅ 高 - P1-9 重新加载配置已同步提示词，避免 UI 覆盖旧值。`webview/src/InterviewTrainer.tsx`
- ✅ 高 - P1-10 语料读取失败已兜底为空，避免整体失败。`src/interviewTrainer/core/it_notes.ts`

### 中
- ✅ 中 - P2-1 前后端类型改为共享来源，避免漂移。`webview/src/types.ts`, `src/protocol/interviewTrainer.ts`
- ✅ 中 - P2-2 题干解析移除前端重复实现，仅走后端解析。`webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/core/it_questionParser.ts`
- ✅ 中 - P2-3 Doubao baseUrl 兼容已含 `/api/v3` 的情况。`src/interviewTrainer/api/it_llm.ts`
- ✅ 中 - P2-4 乱码文本已修复。`src/interviewTrainer/core/it_report.ts`, `src/interviewTrainer/core/it_evaluation.ts`
- ✅ 中 - P2-5 Baidu `err_no` 字符串误判已修复。`src/interviewTrainer/api/it_baidu.ts`
- ✅ 中 - P2-6 SNR 中位数计算已改用排序结果。`src/interviewTrainer/utils/it_audio.ts`
- ✅ 中 - P2-7 语调输出改为“音量趋势”描述，避免误导。`src/interviewTrainer/utils/it_audio.ts`
- ✅ 中 - P2-8 英文分词与关键词提取已修复，不再粘连。`src/interviewTrainer/core/it_notes.ts`, `src/interviewTrainer/core/it_analyze.ts`
- ✅ 中 - P2-9 逐题起点改为优先使用“第1题”标记，支持 11+ 题号。`src/interviewTrainer/core/it_analyze.ts`
- ✅ 中 - P2-11 AudioContext 使用后主动关闭，避免泄漏。`webview/src/InterviewTrainer.tsx`
- ✅ 中 - P2-12 录音计时器卸载时已清理。`webview/src/InterviewTrainer.tsx`

### 低
- ✅ 低 - P3-1 音频段落文本输出已规范化，避免乱码显示。`src/interviewTrainer/utils/it_audio.ts`
- ✅ 低 - P3-2 Baidu ASR `language` 已纳入请求参数。`src/interviewTrainer/api/it_baidu.ts`
- ✅ 低 - P3-3 PCM 分片转写与逐题答案拼接加入分隔符。`src/interviewTrainer/core/it_analyze.ts`
- ✅ 低 - P3-4 Base64 转换已改为分块拼接，降低卡顿。`webview/src/InterviewTrainer.tsx`
- ✅ 低 - P3-5 Webview 不再长期保留，减少内存占用。`src/extension.ts`
- ✅ 低 - P3-6 语料缓存改为递归 mtime，降低缓存失效遗漏。`src/interviewTrainer/core/it_notes.ts`
- ✅ 低 - P3-7 ASR Provider 下拉按能力过滤。`webview/src/InterviewTrainer.tsx`
- ✅ 低 - P3-8 输入设备刷新会清空缓存并重新探测。`webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- ✅ 低 - P3-9 历史报告选择优先匹配 slug 或最近修改文件。`src/interviewTrainer/storage/it_history.ts`
- ✅ 低 - P3-10 历史/会话遍历已加强异常隔离。`src/interviewTrainer/storage/it_history.ts`
- ✅ 低 - P3-11 CSP nonce 改为加密随机。`src/webview/InterviewTrainerWebviewViewProvider.ts`
- ✅ 低 - P3-14 逐题答案拼接加入空格并规范空白。`src/interviewTrainer/core/it_analyze.ts`
- ✅ 低 - P3-15 相似度匹配改为使用题干兜底。`src/interviewTrainer/storage/it_sessions.ts`
- ✅ 低 - P3-18 截断后尾缀改为 ASCII `...`，避免乱码。`src/interviewTrainer/core/it_notes.ts`
- ✅ 低 - P3-19 同步遍历改为显式栈，避免深层递归栈溢出。`src/interviewTrainer/core/it_notes.ts`

## 本轮新增（2026-01-31）
- 中 - Embedding 响应数组缺失部分向量时 `it_parseEmbeddingResponse` 会返回部分结果且不校验数量，导致向量与输入错位。`src/interviewTrainer/api/it_embedding.ts:66`
- 中 - 多题场景 `it_buildQuestionTimingsFromSegments` 只要有一个题号标记缺失就返回空数组，放弃已找到的起点，导致用时统计被整体放弃。`src/interviewTrainer/core/it_analyze.ts:122`
- 中 - LLM/Embedding 请求重试 `for (attempt <= cfg.maxRetries)` 未设默认值，`maxRetries` 未配置时循环不执行而直接失败。`src/interviewTrainer/api/it_llm.ts:38`, `src/interviewTrainer/api/it_embedding.ts:147`
- 低 - JSON 候选提取未忽略字符串内花括号，`it_extractJsonCandidates` 可能截断有效 JSON 导致解析失败。`src/interviewTrainer/core/it_evaluation.ts:110`
- 中 - 题目解析请求异常未捕获，`parseQuestionsFromText` 抛错会导致 `isProcessing` 无法复位，界面卡在“处理中”。`webview/src/InterviewTrainer.tsx:900`, `webview/src/InterviewTrainer.tsx:928`
- 中 - 导入音频无文件体积限制，直接整文件读入内存并走 `OfflineAudioContext` 渲染，大文件易导致 UI 卡死或内存暴涨。`webview/src/InterviewTrainer.tsx:765`
- 中 - 嵌入预热在录音/分析中直接 `return` 且不重试，忙碌期触发的 warmup 可能被永久跳过。`src/interviewTrainer/InterviewTrainerExtension.ts:410`
- 中 - `max_chunk_sec` 未校验，若配置为 0/负数会退化为 1 字节分片，造成极端分片数量与 ASR 调用风暴。`src/interviewTrainer/core/it_analyze.ts:109`
- 中 - PCM 分片先一次性构建所有 base64 块，长音频会在内存中同时保留全部分片，存在内存峰值风险。`src/interviewTrainer/core/it_analyze.ts:109`
- 中 - 多题检索时任一查询失败会让 `Promise.all` 整体拒绝，导致所有检索结果丢失且无法降级。`src/interviewTrainer/core/it_notes.ts:959`
- 中 - 向量检索请求出错会直接抛出并中断分析流程，缺少“返回空检索/降级词面检索”的兜底。`src/interviewTrainer/core/it_notes.ts:827`
- 中 - Embedding 内存缓存无上限策略，长期运行或语料规模扩大时可能造成内存持续增长。`src/interviewTrainer/core/it_notes.ts:43`
- 中 - 火山标准版轮询在 `status=success` 但文本为空时直接返回空串，后续分析按“成功转写”继续，易产出空报告。`src/interviewTrainer/api/it_volc_asr.ts:217`
- 中 - `timeoutSec` 未做有效数值校验，配置为 0/NaN 时会传入 axios 导致立即失败或失去超时保护。`src/interviewTrainer/api/it_llm.ts:42`, `src/interviewTrainer/api/it_embedding.ts:151`, `src/interviewTrainer/api/it_qianfan.ts:47`
- 中 - `attempts.json` 采用读-改-写且无锁，多次并发分析/保存时存在覆盖丢失记录的竞争条件。`src/interviewTrainer/storage/it_sessions.ts:252`
- 低 - 新一轮分析开始未清空 `analysisResult`，处理中仍展示上次结果，易造成误判。`webview/src/InterviewTrainer.tsx:900`
- 低 - 打开报告未检查返回状态，失败时无提示，用户无法感知打开失败原因。`webview/src/InterviewTrainer.tsx:999`
- 低 - 加载历史列表未处理失败分支，请求异常时无反馈且界面保持旧列表。`webview/src/InterviewTrainer.tsx:1004`
- 低 - 音频转换 fallback 使用默认超时（60s），大文件转换可能超时后仅提示“浏览器无法解码”，掩盖真实原因。`webview/src/InterviewTrainer.tsx:818`
- 低 - `it/convertAudioToPcm` 仅在成功路径清理临时目录，失败时残留临时文件夹。`src/interviewTrainer/InterviewTrainerExtension.ts:1502`
- 低 - 检索缓存 key 对查询文本仅取前 300 字符，长文本场景易发生缓存碰撞导致命中错误。`src/interviewTrainer/core/it_notes.ts:103`
- 低 - 题目解析 JSON 提取仅取首尾 `{}`，遇到代码块/多段 JSON 时容易解析失败并回退。`src/interviewTrainer/core/it_questionParser.ts:61`
- 低 - 千帆聊天未校验 `baseUrl` 是否为空，空值会生成 `/chat/completions` 相对路径，报错信息不直观。`src/interviewTrainer/api/it_qianfan.ts:17`
- 低 - `it_nextAttemptIndex` 仅按 `##` 标题计数，报告正文出现同级标题会导致尝试次数误增。`src/interviewTrainer/storage/it_sessions.ts:278`

## 以后审查格式模板
- ⏳ <严重程度> - <问题描述> `path:line`
- ✅ <严重程度> - <问题描述> `path:line`
