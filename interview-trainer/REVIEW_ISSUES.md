# 代码审查问题清单

更新时间：2026-01-30
说明：根据当前审查结果汇总（已按要求忽略密钥/Secret 相关问题）。

## 已解决（2026-01-30）
- P0-1 已改为异步 I/O：历史列表、清理向量缓存、音频转换与录音文件读写改为异步，减少扩展宿主阻塞。`src/interviewTrainer/storage/it_history.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- P1-1 LLM ???????????????????? 0 ????`src/interviewTrainer/core/it_analyze.ts`, `webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/core/it_report.ts`, `src/protocol/interviewTrainer.ts`
- P1-2 已尊重配置：移除 LLM `max_retries` 最少 5 次的强制逻辑。`src/interviewTrainer/core/it_analyze.ts`, `src/interviewTrainer/core/it_evaluation.ts`
- P1-3 已移除 120 段限制：LLM 分段使用完整语音片段。`src/interviewTrainer/core/it_analyze.ts`
- P1-4 已支持 `center_subdir`：历史报告优先在子目录内匹配，找不到时再回退。`src/interviewTrainer/storage/it_history.ts`
- P1-5 已添加请求超时与清理：Webview pending 不再无限堆积。`webview/src/messenger.ts`
- P1-6 已避免多 handler 回应冲突：有 `messageId` 时只响应一次。`src/webview/WebviewProtocol.ts`
- P1-7 YAML 解析已做容错：配置损坏不再导致加载崩溃。`src/interviewTrainer/api/it_apiConfig.ts`
- P1-8 已加入统一释放：扩展加入 `context.subscriptions` 并实现 `dispose`。`src/extension.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- P1-9 重新加载配置已同步提示词，避免 UI 覆盖旧值。`webview/src/InterviewTrainer.tsx`
- P1-10 语料读取失败已兜底为空，避免整体失败。`src/interviewTrainer/core/it_notes.ts`
- P2-1 前后端类型改为共享来源，避免漂移。`webview/src/types.ts`, `src/protocol/interviewTrainer.ts`
- P2-2 题干解析移除前端重复实现，仅走后端解析。`webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/core/it_questionParser.ts`
- P2-3 Doubao baseUrl 兼容已含 `/api/v3` 的情况。`src/interviewTrainer/api/it_llm.ts`
- P2-4 乱码文本已修复。`src/interviewTrainer/core/it_report.ts`, `src/interviewTrainer/core/it_evaluation.ts`
- P2-5 Baidu `err_no` 字符串误判已修复。`src/interviewTrainer/api/it_baidu.ts`
- P2-6 SNR 中位数计算已改用排序结果。`src/interviewTrainer/utils/it_audio.ts`
- P2-7 语调输出改为“音量趋势”描述，避免误导。`src/interviewTrainer/utils/it_audio.ts`
- P3-1 音频段落文本输出已规范化，避免乱码显示。`src/interviewTrainer/utils/it_audio.ts`
- P2-8 英文分词与关键词提取已修复，不再粘连。`src/interviewTrainer/core/it_notes.ts`, `src/interviewTrainer/core/it_analyze.ts`
- P2-9 逐题起点改为优先使用“第1题”标记，支持 11+ 题号。`src/interviewTrainer/core/it_analyze.ts`
- P2-11 AudioContext 使用后主动关闭，避免泄漏。`webview/src/InterviewTrainer.tsx`
- P2-12 录音计时器卸载时已清理。`webview/src/InterviewTrainer.tsx`
- P3-2 Baidu ASR `language` 已纳入请求参数。`src/interviewTrainer/api/it_baidu.ts`
- P3-3 PCM 分片转写与逐题答案拼接加入分隔符。`src/interviewTrainer/core/it_analyze.ts`
- P3-4 Base64 转换已改为分块拼接，降低卡顿。`webview/src/InterviewTrainer.tsx`
- P3-5 Webview 不再长期保留，减少内存占用。`src/extension.ts`
- P3-6 语料缓存改为递归 mtime，降低缓存失效遗漏。`src/interviewTrainer/core/it_notes.ts`
- P3-7 ASR Provider 下拉按能力过滤。`webview/src/InterviewTrainer.tsx`
- P3-8 输入设备刷新会清空缓存并重新探测。`webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- P3-9 历史报告选择优先匹配 slug 或最近修改文件。`src/interviewTrainer/storage/it_history.ts`
- P3-10 历史/会话遍历已加强异常隔离。`src/interviewTrainer/storage/it_history.ts`
- P3-11 CSP nonce 改为加密随机。`src/webview/InterviewTrainerWebviewViewProvider.ts`
- P3-14 逐题答案拼接加入空格并规范空白。`src/interviewTrainer/core/it_analyze.ts`
- P3-15 相似度匹配改为使用题干兜底。`src/interviewTrainer/storage/it_sessions.ts`
- P3-18 截断后尾缀改为 ASCII `...`，避免乱码。`src/interviewTrainer/core/it_notes.ts`
- P3-19 同步遍历改为显式栈，避免深层递归栈溢出。`src/interviewTrainer/core/it_notes.ts`

## 本轮新增
- 无（本轮为问题修复与清单更新）。

## 累计问题
- 严重：LLM 分段失败时逐题时间全为 0，逐题声学/检索对齐失真（按产品要求不启用启发式时，建议清理未使用的启发式代码）。`src/interviewTrainer/core/it_analyze.ts:1205`
- 低：`it_audio.ts` 存在乱码字符串字面量（语调等），与协议/前端类型不一致。`src/interviewTrainer/utils/it_audio.ts:84`
- 中等：LLM `max_retries` 被强制设为最少 5 次，用户配置可能被忽略，失败时等待时间被放大。`src/interviewTrainer/core/it_analyze.ts:270`, `src/interviewTrainer/core/it_evaluation.ts:250`
- 低：语调判断基于音量斜率而非基频/音高，语调结论不可靠。`src/interviewTrainer/utils/it_audio.ts:79`
- 中等：历史报告查找仅扫描题目目录根部 `.md`，当 `center_subdir` 配置存在时会找不到报告。`src/interviewTrainer/storage/it_history.ts:30`, `src/interviewTrainer/storage/it_sessions.ts:135`
- 中等：前后端类型重复定义，存在漂移风险；当前 `tone` 字面量已不一致。`src/protocol/interviewTrainer.ts`, `webview/src/types.ts`
- 低：Baidu ASR 配置项 `language` 未在请求中使用，界面设置无效易误导。`src/interviewTrainer/api/it_baidu.ts`
- 中等：语料文件读取失败会直接抛错（`it_readText`/`it_readTextAsync` 无有效兜底），可能导致笔记构建整体失败。`src/interviewTrainer/core/it_notes.ts:45`
- 中等：LLM 分段仅取前 120 个语音片段，长音频后半段被丢弃，可能导致分段/对齐错误。`src/interviewTrainer/core/it_analyze.ts:352`
- 低：题号解析仅覆盖“十”以内，二十/三十等无法识别，标记分段可能失败。`src/interviewTrainer/core/it_evaluation.ts:133`
- 低：PCM 分片转写结果直接 `join("")` 无分隔符，英文/数字可能粘连，影响可读性与检索。`src/interviewTrainer/core/it_analyze.ts:882`
- 严重：大量同步 I/O 在扩展宿主线程执行，可能阻塞 UI/录音流程。`src/interviewTrainer/core/it_notes.ts`, `src/interviewTrainer/storage/it_history.ts`, `src/interviewTrainer/storage/it_sessions.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- 中等：Webview 端 `it_pcmToBase64`/`it_bytesToBase64` 逐字节拼接字符串，处理较大音频时性能差且易卡 UI。`webview/src/InterviewTrainer.tsx:63`
- 低：报告模板字符串已损坏（如 `item.note` 分隔符乱码、章节标题包含异常字符），报告格式可能异常。`src/interviewTrainer/core/it_report.ts:116`
- 严重：`InterviewTrainerExtension` 未加入 `context.subscriptions`，OutputChannel/计时器等资源缺少统一释放。`src/extension.ts`, `src/interviewTrainer/InterviewTrainerExtension.ts`
- 中等：Webview 中 `AudioContext` 创建后未关闭，可能造成资源泄漏。`webview/src/InterviewTrainer.tsx`
- 中等：录音计时器仅在录音停止时清理，组件卸载时未兜底清理。`webview/src/InterviewTrainer.tsx`
- 中等：`retainContextWhenHidden: true` 长驻 Webview，内存占用偏高。`src/extension.ts`
- 中等：YAML 解析缺少 try/catch，配置文件损坏会导致加载失败。`src/interviewTrainer/api/it_apiConfig.ts`
- 中等：语料缓存仅检查目录 mtime，文件内容变更可能不刷新。`src/interviewTrainer/core/it_notes.ts`
- 中等：题干解析逻辑前后端重复实现，存在漂移风险。`webview/src/InterviewTrainer.tsx`, `src/interviewTrainer/core/it_questionParser.ts`
- 中等：Doubao LLM 的 baseUrl 可能已含 `/api/v3`，当前拼接会出现重复路径。`src/interviewTrainer/api/it_llm.ts`
- 中等：报告/评语等文本中存在乱码字符。`src/interviewTrainer/core/it_report.ts`, `src/interviewTrainer/core/it_evaluation.ts`, `src/interviewTrainer/core/it_notes.ts`
- 中等：ASR Provider 下拉未按能力过滤，且默认值偏向百度，切换提供方体验不一致。`webview/src/InterviewTrainer.tsx`
- 中等：音频输入设备列表刷新时走缓存，实际设备变更不生效。`src/interviewTrainer/InterviewTrainerExtension.ts`
- 中等：百度 ASR 错误码判断 `err_no` 为字符串 `"0"` 时会被误判为错误。`src/interviewTrainer/api/it_baidu.ts`
- 中等：Webview request 无超时，pending 可能永久堆积。`webview/src/messenger.ts`
- 中等：同一 `messageType` 支持多 handler，但共用 `messageId` 回应，可能导致响应混乱。`src/webview/WebviewProtocol.ts`
- 低：历史记录仅取目录内第一个 `.md`，可能打开错误报告。`src/interviewTrainer/storage/it_history.ts`
- 低：历史/会话目录遍历未全面 try/catch，权限异常可能导致崩溃。`src/interviewTrainer/storage/it_history.ts`, `src/interviewTrainer/storage/it_sessions.ts`
- 高风险：`resetMicPermissionCache` 直接改动 VS Code 用户数据目录（WebStorage/Local Storage/Preferences），路径推断不可靠且可能破坏用户配置。`src/interviewTrainer/InterviewTrainerExtension.ts`
- 低：Webview CSP nonce 使用 `Math.random()` 生成，随机性不足且可预测。`src/webview/InterviewTrainerWebviewViewProvider.ts:62`
- 低：Webview 样式多处使用 `color-mix(...)`，旧版 VS Code/Chromium 不支持时背景与按钮高亮可能失效。`webview/src/styles.css:9`
- 中等：麦克风诊断/申请权限逻辑为“空实现”，直接写死 `unknown`，UI 显示与实际权限/设备状态不一致。`webview/src/InterviewTrainer.tsx:1304`, `webview/src/InterviewTrainer.tsx:1313`
- 中等：重新加载配置后未同步提示词字段，导致 UI 仍显示旧提示词，保存时可能覆盖真实配置。`webview/src/InterviewTrainer.tsx:1274`
- 中等：关键词/分词对英文先去空白再 split，导致单词被拼成一个 token，影响关键词检索质量。`src/interviewTrainer/core/it_notes.ts:162`, `src/interviewTrainer/core/it_analyze.ts:774`
- 中等：多题分段时首题起点被强制设为 0，未利用“第1题”标记，前置引导语会被计入第1题。`src/interviewTrainer/core/it_analyze.ts:123`
- 低：多题分段仅支持“十”以内题号，11 题以上难以通过标记定位。`src/interviewTrainer/core/it_analyze.ts:119`
- 低：逐题答案拼接直接 `join("")` 无分隔符，英文/数字可读性与检索效果下降。`src/interviewTrainer/core/it_analyze.ts:552`
- 低：查找历史题目时相似度仅使用 `candidateTitle`，当标题为空而题干存在时无法做模糊匹配，可能生成重复目录。`src/interviewTrainer/storage/it_sessions.ts:111`, `src/interviewTrainer/storage/it_sessions.ts:168`
- 低：火山 ASR 多句返回使用 `parts.join("")` 无分隔符，英文/数字容易粘连影响可读性与后续检索。`src/interviewTrainer/api/it_volc_asr.ts:79`

## 追加（第1轮）
- 中等：LLM `max_retries` 被强制设为最少 5 次，用户配置可能被忽略，失败时等待时间被放大。`src/interviewTrainer/core/it_analyze.ts:270`, `src/interviewTrainer/core/it_evaluation.ts:250`
- 低：语调判断基于音量斜率而非基频/音高，语调结论不可靠。`src/interviewTrainer/utils/it_audio.ts:79`
- 中等：历史报告查找仅扫描题目目录根部 `.md`，当 `center_subdir` 配置存在时会找不到报告。`src/interviewTrainer/storage/it_history.ts:30`, `src/interviewTrainer/storage/it_sessions.ts:135`

## 追加（第2轮）
- 中等：前后端类型重复定义，存在漂移风险；当前 `tone` 字面量已不一致。`src/protocol/interviewTrainer.ts`, `webview/src/types.ts`
- 低：Baidu ASR 配置项 `language` 未在请求中使用，界面设置无效易误导。`src/interviewTrainer/api/it_baidu.ts`
- 中等：语料文件读取失败会直接抛错（`it_readText`/`it_readTextAsync` 无有效兜底），可能导致笔记构建整体失败。`src/interviewTrainer/core/it_notes.ts:45`

## 追加（第3轮）
- 中等：LLM 分段仅取前 120 个语音片段，长音频后半段被丢弃，可能导致分段/对齐错误。`src/interviewTrainer/core/it_analyze.ts:352`
- 低：题号解析仅覆盖“十”以内，二十/三十等无法识别，标记分段可能失败。`src/interviewTrainer/core/it_evaluation.ts:133`
- 低：PCM 分片转写结果直接 `join("")` 无分隔符，英文/数字可能粘连，影响可读性与检索。`src/interviewTrainer/core/it_analyze.ts:882`

## 追加（第4轮）
- 低：Webview CSP nonce 使用 `Math.random()` 生成，随机性不足且可预测。`src/webview/InterviewTrainerWebviewViewProvider.ts:62`

## 追加（第5轮）
- 低：Webview 样式多处使用 `color-mix(...)`，旧版 VS Code/Chromium 不支持时背景与按钮高亮可能失效。`webview/src/styles.css:9`

## 追加（第6轮）
- 中等：麦克风诊断/申请权限逻辑为“空实现”，直接写死 `unknown`，UI 显示与实际权限/设备状态不一致。`webview/src/InterviewTrainer.tsx:1304`, `webview/src/InterviewTrainer.tsx:1313`

## 追加（第7轮）
- 中等：重新加载配置后未同步提示词字段，导致 UI 仍显示旧提示词，保存时可能覆盖真实配置。`webview/src/InterviewTrainer.tsx:1274`

## 追加（第8轮）
- 中等：关键词/分词对英文先去空白再 split，导致单词被拼成一个 token，影响关键词检索质量。`src/interviewTrainer/core/it_notes.ts:162`, `src/interviewTrainer/core/it_analyze.ts:774`

## 追加（第9轮）
- 中等：多题分段时首题起点被强制设为 0，未利用“第1题”标记，前置引导语会被计入第1题。`src/interviewTrainer/core/it_analyze.ts:123`

## 追加（第10轮）
- 低：多题分段仅支持“十”以内题号，11 题以上难以通过标记定位。`src/interviewTrainer/core/it_analyze.ts:119`

## 追加（第11轮）
- 低：查找历史题目时相似度仅使用 `candidateTitle`，当标题为空而题干存在时无法做模糊匹配，可能生成重复目录。`src/interviewTrainer/storage/it_sessions.ts:111`, `src/interviewTrainer/storage/it_sessions.ts:168`

## 追加（第12轮）
- 低：逐题答案拼接直接 `join("")` 无分隔符，英文/数字可读性与检索效果下降。`src/interviewTrainer/core/it_analyze.ts:552`

## 追加（第13轮）
- 低：火山 ASR 多句返回使用 `parts.join("")` 无分隔符，英文/数字容易粘连影响可读性与后续检索。`src/interviewTrainer/api/it_volc_asr.ts:79`

## 追加（第14轮）
- 低：`questionList` 仅过滤非空但未 trim，前后空格会导致后续按题目匹配的检索/映射失效。`src/interviewTrainer/core/it_analyze.ts:1204`

## 追加（第15轮）
- 中等：检索查询缓存 key 只包含 workspaceRoot/sourceCount/corpus.length，内容变更但数量不变时会命中旧缓存，笔记命中可能过期。`src/interviewTrainer/core/it_analyze.ts:1473`

## 追加（第16轮）
- 中等：千帆 LLM baseUrl 无规范化，始终拼接 `/chat/completions`，当用户已配置完整路径时会重复拼接导致请求失败。`src/interviewTrainer/api/it_qianfan.ts:22`

## 追加（第17轮）
- 低：Webview `request` 超时只 resolve 错误对象而非 reject，且部分调用未检查 `status`（如取消/打开报告），会静默失败缺少提示。`webview/src/messenger.ts:41`, `webview/src/InterviewTrainer.tsx:993`, `webview/src/InterviewTrainer.tsx:1001`

## 追加（第18轮）
- 中等：火山引擎标准版轮询只要返回非空文本就直接结束，可能在状态未完成时提前返回导致转写不完整。`src/interviewTrainer/api/it_volc_asr.ts:215`

## 追加（第19轮）
- 低：`it_postWithRetries` 没有退避/延时，错误时会快速重试，易触发服务端限流或配额消耗。`src/interviewTrainer/api/it_volc_asr.ts:105`

## 追加（第20轮）
- 中等：`it_makeSlug` 在允许 Unicode 时仅替换非法字符，未处理结尾空格/点号及保留名，Windows 下可能生成无效文件名导致写入失败。`src/interviewTrainer/utils/it_text.ts:23`

## 追加（第21轮）
- 低：会话目录日期使用 `toISOString()`（UTC），本地跨时区/临界时刻可能归档到前/后一天。`src/interviewTrainer/storage/it_sessions.ts:194`

## 追加（第22轮）
- 中等：语料目录监听使用 `RelativePattern(workspaceRoot, path.join(normalized,...))`，若用户配置为绝对路径，pattern 可能失效导致语料更新不触发重建。`src/interviewTrainer/InterviewTrainerExtension.ts:283`

## 追加（第23轮）
- 低：导入音频仅取 `getChannelData(0)`，立体声右声道被丢弃，可能遗漏有效语音内容。`webview/src/InterviewTrainer.tsx:797`

## 追加（第24轮）
- 中等：取消分析仅设置 abort 标记，但 ASR 分片循环/LLM 调用未检查，取消后仍可能继续转写并写入报告。`src/interviewTrainer/core/it_analyze.ts:945`, `src/interviewTrainer/core/it_analyze.ts:1182`

## 追加（第25轮）
- 中等：Baidu ASR 仅在 PCM 时分片；WAV/M4A 直接整段发送，大文件易触发长度限制导致失败。`src/interviewTrainer/core/it_analyze.ts:1074`

## 追加（第26轮）
- 低：题目解析启发式仅识别“第N题/问：”格式，常见的“1.”、“一、”或“第1题”无冒号会被识别为无题目。`src/interviewTrainer/core/it_questionParser.ts:23`, `src/interviewTrainer/core/it_questionParser.ts:24`

## 追加（第27轮）
- 低：Markdown 分段仅识别 `##/###` 标题，`#` 一级标题与更深层级被忽略，导致整篇合并为大块、检索粒度变差。`src/interviewTrainer/core/it_notes.ts:183`

## 追加（第28轮）
- 中等：单段落超长时 `it_splitByParagraphs` 不再继续切分，可能生成超过上限的块，向量检索易超出模型输入限制。`src/interviewTrainer/core/it_notes.ts:156`

## 追加（第29轮）
- 低：按时间段取答案时采用“重叠即归属”，跨题边界的语音片段会被多个题目重复收录，影响逐题评估。`src/interviewTrainer/core/it_analyze.ts:635`

## 追加（第30轮）
- 低：LLM 分段映射未校验 questionIndex 范围，越界值被静默丢弃，可能出现已回答但结果为空。`src/interviewTrainer/core/it_analyze.ts:415`

## 追加（第31轮）
- 低：Embedding 缓存 key 直接使用 baseUrl 原串，尾部 `/` 或大小写差异会造成缓存重复/命中率下降。`src/interviewTrainer/core/it_notes.ts:267`

## 追加（第32轮）
- 中等：检索 answers 只在数量完全匹配时生效，LLM 仅回答部分题目时会丢弃已识别答案，检索查询退化为纯题干。`src/interviewTrainer/core/it_analyze.ts:1476`

## 追加（第33轮）
- 低：异常分支使用 `\"?????\"` 字符串作为判断/提示，明显为乱码占位，实际错误难以触发且提示不可读。`src/interviewTrainer/InterviewTrainerExtension.ts:1970`

## 追加（第34轮）
- 中等：Webview 分析请求超时仅返回错误对象，不会通知后端取消；长任务仍会继续并写入报告，UI 显示失败但文件已生成。`webview/src/messenger.ts:41`, `webview/src/InterviewTrainer.tsx:957`

## 追加（第35轮）
- 中等：后端未限制并发分析请求，超时后用户重复发起会同时运行多个分析，可能竞争写入同一主题目录。`src/interviewTrainer/InterviewTrainerExtension.ts:1932`

## 追加（第36轮）
- 中等：`it_buildCorpusAsync` 在 `skipMtimeCheck` 分支直接读取缓存文件，未按 `maxCacheBytes` 做大小保护，可能读入超大缓存导致内存飙升。`src/interviewTrainer/core/it_notes.ts:200`

## 追加（第37轮）
- 低：历史记录回溯报告路径时，找不到目标文件会选取最新 `.md` 作为报告，若目录内有其他笔记会打开错误文件。`src/interviewTrainer/storage/it_history.ts:28`

## 追加（第38轮）
- 低：话题相似度使用逐字符位置对比，前缀相同但主题不同也可能被合并，产生错用历史目录的问题。`src/interviewTrainer/storage/it_sessions.ts:33`

## 追加（第39轮）
- 中等：主题目录基于截断 slug，当同日出现相同前缀题目时会复用目录，导致两题记录混在一起。`src/interviewTrainer/storage/it_sessions.ts:192`

## 追加（第40轮）
- 中等：逐题检索与评价使用 `Promise.all` 并发请求，多题场景可能集中触发 Embedding/LLM 限流，导致整体失败率升高。`src/interviewTrainer/core/it_analyze.ts:1504`, `src/interviewTrainer/core/it_analyze.ts:1661`

## 追加（第41轮）
- 中等：LLM 分段/拆分的 JSON 提取仅截取首尾花括号，遇到模型输出多段 JSON 或文本内含括号时易解析失败。`src/interviewTrainer/core/it_analyze.ts:350`

## 追加（第42轮）
- 低：录音停止若未生成文件直接抛错并提前退出，未清理临时目录，长期使用会堆积垃圾文件。`src/interviewTrainer/InterviewTrainerExtension.ts:1837`

## 追加（第43轮）
- 中等：火山 ASR flash 模式不分片上传，长音频仍走单次请求，可能超出服务端限制并导致转写失败。`src/interviewTrainer/core/it_analyze.ts:1011`
