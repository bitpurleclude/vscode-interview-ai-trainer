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
