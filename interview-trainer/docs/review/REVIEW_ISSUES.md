# 代码审查问题清单

更新时间：2026-02-05
说明：已基于当前主分支代码复核。✅ 表示已解决/已消失，⏳ 表示仍存在。
对仍存在项给出可选解决方案（A/B）。

格式约定：
- 记录格式：<状态> <严重程度> - <问题描述> `path:line`
- 严重程度：严重 / 高 / 中 / 低

## 未解决问题（按严重程度）

### 严重
- （暂无）

### 高
- （暂无）

### 中
- ⏳ 中 - 检索查询缓存 key 仅含 workspaceRoot/sourceCount/corpus.length，内容变更但数量不变时会命中旧缓存。`src/interviewTrainer/core/analyze/flow.ts`
  - 方案A：缓存 key 加入目录 mtime/dirtyFiles hash
  - 方案B：缓存 key 加入 corpus cache 文件 hash/mtime
- ⏳ 中 - 千帆 LLM baseUrl 无规范化，始终拼接 `/chat/completions`，完整路径会重复拼接。`src/interviewTrainer/api/it_qianfan.ts`
  - 方案A：检测 baseUrl 已含 `/chat/completions` 则不再拼接
  - 方案B：允许完整 URL override（优先使用用户提供的完整路径）
- ⏳ 中 - 火山标准版轮询只要返回非空文本就直接结束，状态未完成时可能提前返回。`src/interviewTrainer/api/it_volc_asr.ts`
  - 方案A：仅在 status=success/finished 后返回
  - 方案B：连续 N 次相同文本再返回
- ⏳ 中 - `it_makeSlug` 允许 Unicode 时未处理尾随空格/点号与 Windows 保留名。`src/interviewTrainer/utils/it_text.ts`
  - 方案A：trim 末尾 `. ` 并过滤保留名
  - 方案B：检测非法名时追加 hash 后缀
- ⏳ 中 - 语料目录监听用 `RelativePattern(workspaceRoot, path.join(normalized,...))`，绝对路径可能失效。`src/interviewTrainer/core/it_configSnapshot.ts`
  - 方案A：绝对路径改用 glob 字符串 watcher
  - 方案B：相对/绝对路径分支分别创建 watcher
- ⏳ 中 - 取消分析仅设置 abort 标记，ASR 分片循环/LLM 调用未检查。`src/interviewTrainer/core/analyze/flow.ts`
  - 方案A：在分片/并发任务中周期性检查 abort 并中断
  - 方案B：为请求引入可取消 token（axios cancel/signal）
- ⏳ 中 - Baidu ASR 仅 PCM 分片；WAV/M4A 直接整段发送，大文件易超限。`src/interviewTrainer/core/analyze/asr.ts`
  - 方案A：非 PCM 先转 PCM 再分片
  - 方案B：超过阈值强制走 URL 上传
- ⏳ 中 - `it_splitByParagraphs` 对超长段落不再继续切分，易超输入上限。`src/interviewTrainer/core/notes/utils.ts`
  - 方案A：超长段落按 maxLen 强制硬切
  - 方案B：先按标点二次切分
- ⏳ 中 - 检索 answers 仅在数量完全匹配时生效，部分回答会丢弃答案。`src/interviewTrainer/core/analyze/flow.ts`
  - 方案A：允许部分答案，用空串补齐
  - 方案B：按 questionIndex 合并已识别答案
- ⏳ 中 - Webview 请求超时仅返回错误对象，不通知后端取消。`webview/src/messenger.ts`, `webview/src/hooks/useAnalysisFlow.ts`
  - 方案A：超时后主动调用 `it/cancelAnalyze`
  - 方案B：后端引入 runId 校验丢弃过期任务
- ⏳ 中 - 后端未限制并发分析请求，重复发起可同时运行多个分析。`src/interviewTrainer/core/it_analysisFlow.ts`
  - 方案A：新请求来时取消旧任务
  - 方案B：队列化/串行执行
- ⏳ 中 - `it_buildCorpusAsync` 在 skipMtimeCheck 分支读缓存未做大小保护。`src/interviewTrainer/core/notes/indexer.ts`
  - 方案A：读前 stat 校验 size <= maxCacheBytes
  - 方案B：复用 loadCachedCorpus 逻辑
- ⏳ 中 - 主题目录基于截断 slug，同日同前缀会复用目录。`src/interviewTrainer/storage/it_sessions.ts`
  - 方案A：目录已存在且 questionHash 不同则追加后缀
  - 方案B：slug 固定追加短 hash
- ⏳ 中 - 逐题检索/评价使用 Promise.all 并发，多题场景易触发限流。`src/interviewTrainer/core/analyze/flow.ts`
  - 方案A：引入并发限速（p-limit）
  - 方案B：按题串行或分批
- ⏳ 中 - LLM 分段 JSON 提取仅截取首尾花括号，易解析失败。`src/interviewTrainer/core/analyze/shared.ts`
  - 方案A：复用 evaluation 的 JSON 提取器
  - 方案B：实现忽略字符串内花括号的扫描
- ⏳ 中 - 火山 ASR flash 模式不分片上传，长音频仍单次请求。`src/interviewTrainer/core/analyze/asr.ts`
  - 方案A：超长音频强制 standard 模式
  - 方案B：本地拆分后多次 flash
- ⏳ 中 - Embedding 响应数组缺失向量时不校验数量，可能错位。`src/interviewTrainer/api/it_embedding.ts`
  - 方案A：数量不一致直接报错并重试
  - 方案B：缺失向量补空并记录告警
- ⏳ 中 - `it_buildQuestionTimingsFromSegments` 缺任一题号就返回空数组。`src/interviewTrainer/core/analyze/questions.ts`
  - 方案A：保留已识别起点，其余用估算
  - 方案B：只丢缺失题，不丢全部
- ⏳ 中 - LLM/Embedding 请求重试 maxRetries 未设默认值，undefined 时不重试。`src/interviewTrainer/api/it_llm.ts`, `src/interviewTrainer/api/it_embedding.ts`
  - 方案A：构建 config 时统一默认值
  - 方案B：调用处 `Math.max(0, cfg.maxRetries ?? 1)`
- ⏳ 中 - 导入音频无体积限制，直接整文件解码易卡死/内存暴涨。`webview/src/hooks/useAudioCapture.ts`
  - 方案A：设置 size 上限，超出走 ffmpeg 或拒绝
  - 方案B：分块读取并提示耗时
- ⏳ 中 - warmup 忙碌期直接 return 不重试，可能永久跳过。`src/interviewTrainer/core/it_embeddingWarmup.ts`
  - 方案A：忙碌时重新 schedule
  - 方案B：记录 pendingWarmup 标记
- ⏳ 中 - PCM 分片一次性构建所有 base64，长音频内存峰值高。`src/interviewTrainer/core/analyze/audio.ts`
  - 方案A：惰性生成/分批处理
  - 方案B：边处理边释放
- ⏳ 中 - 多题检索任一失败会让 Promise.all 整体失败。`src/interviewTrainer/core/notes/search.ts`
  - 方案A：改为 Promise.allSettled
  - 方案B：失败项降级为空结果
- ⏳ 中 - 向量检索出错会中断分析，缺少降级兜底。`src/interviewTrainer/core/notes/search.ts`, `src/interviewTrainer/core/analyze/flow.ts`
  - 方案A：异常时退回 keyword 检索
  - 方案B：异常返回空检索并记录告警
- ⏳ 中 - Embedding 内存缓存无上限策略，长期运行可能内存增长。`src/interviewTrainer/core/notes/cache.ts`
  - 方案A：LRU + 最大条数
  - 方案B：按 corpus key 切分并定期清理
- ⏳ 中 - 火山标准版 status=success 但文本为空时直接返回空串。`src/interviewTrainer/api/it_volc_asr.ts`
  - 方案A：空文本继续轮询到超时
  - 方案B：视为错误并提示
- ⏳ 中 - `timeoutSec` 未校验有效数值，0/NaN 可能导致立即失败。`src/interviewTrainer/api/it_llm.ts`, `src/interviewTrainer/api/it_embedding.ts`, `src/interviewTrainer/api/it_qianfan.ts`
  - 方案A：统一 clamp >0
  - 方案B：无效值回退默认 30/60s
- ⏳ 中 - `attempts.json` 读-改-写无锁，多并发可能覆盖丢失。`src/interviewTrainer/storage/it_sessions.ts`
  - 方案A：改为 JSONL 追加写
  - 方案B：引入原子写/文件锁

### 低
- ⏳ 低 - Webview 样式使用 `color-mix`，旧版 VS Code/Chromium 不兼容。`webview/src/styles.css`
  - 方案A：提供 fallback 颜色
  - 方案B：构建时降级为固定色
- ⏳ 低 - Webview `request` 超时只 resolve 错误对象而非 reject，部分调用未检查 status。`webview/src/messenger.ts`, `webview/src/InterviewTrainer.tsx`
  - 方案A：统一 reject 并强制 UI 提示
  - 方案B：调用方统一检查 status
- ⏳ 低 - `it_postWithRetries` 无退避延时，易触发限流。`src/interviewTrainer/api/it_volc_asr.ts`
  - 方案A：指数退避 + jitter
- ⏳ 低 - 会话目录日期使用 UTC，跨时区临界可能归档到前/后一天。`src/interviewTrainer/storage/it_sessions.ts`
  - 方案A：改用本地日期
- ⏳ 低 - 导入音频只取 channel 0，立体声右声道丢弃。`webview/src/hooks/useAudioCapture.ts`
  - 方案A：混音为 mono
- ⏳ 低 - 题目解析启发式仅识别“第N题/问”格式，1./一、等未识别。`src/interviewTrainer/core/it_questionParser.ts`
  - 方案A：扩展启发式正则
- ⏳ 低 - 按时间段取答案使用“重叠即归属”，跨题边界会重复收录。`src/interviewTrainer/core/analyze/questions.ts`
  - 方案A：按 overlap 最大归属
  - 方案B：设 overlap 阈值
- ⏳ 低 - LLM 分段 mapping 未校验 questionIndex 范围，越界值被静默丢弃。`src/interviewTrainer/core/analyze/questions.ts`
  - 方案A：越界丢弃并记录 trace
- ⏳ 低 - 异常分支使用“?????” 占位，提示不可读。`src/interviewTrainer/core/it_analysisFlow.ts`
  - 方案A：替换为可读错误码/常量
- ⏳ 低 - 历史记录找不到目标报告时取最新 md，可能误打开。`src/interviewTrainer/storage/it_history.ts`
  - 方案A：找不到直接报错
  - 方案B：仅在 meta 匹配时 fallback
- ⏳ 低 - 新一轮分析开始未清空 `analysisResult`，处理中仍展示上次结果。`webview/src/hooks/useAnalysisFlow.ts`
  - 方案A：分析开始时 setAnalysisResult(null)
- ⏳ 低 - 打开报告未检查返回状态，失败无提示。`webview/src/InterviewTrainer.tsx`
  - 方案A：检查 response.status 并提示
- ⏳ 低 - 加载历史列表失败无反馈。`webview/src/hooks/useAnalysisFlow.ts`
  - 方案A：异常时提示并清空列表
- ⏳ 低 - 音频转换 fallback 默认超时 60s，易掩盖真实错误。`webview/src/messenger.ts`
  - 方案A：按文件大小动态 timeout
- ⏳ 低 - `it/convertAudioToPcm` 失败时不清理临时目录。`src/interviewTrainer/handlers/it_webviewRecordingHandlers.ts`
  - 方案A：finally 清理 tmpDir
- ⏳ 低 - 检索缓存 key 仅取前 300 字符，长文本易碰撞。`src/interviewTrainer/core/notes/cache.ts`
  - 方案A：改为全文 hash
- ⏳ 低 - 题目解析 JSON 提取仅首尾 `{}`，遇到多段 JSON 易失败。`src/interviewTrainer/core/it_questionParser.ts`
  - 方案A：复用 evaluation JSON 解析器
- ⏳ 低 - 千帆 baseUrl 为空时仍拼路径，报错不直观。`src/interviewTrainer/api/it_qianfan.ts`
  - 方案A：空值直接报错或使用默认 baseUrl
- ⏳ 低 - `it_nextAttemptIndex` 仅按 `##` 标题计数，正文同级标题会误增。`src/interviewTrainer/storage/it_sessions.ts`
  - 方案A：使用独立计数文件/JSON

## 已解决/已消失（✅）
- ✅ 中 - `resetMicPermissionCache` 相关逻辑已移除（全仓无该函数）。
- ✅ 中 - 麦克风权限“unknown”空实现已移除，改为错误提示 + 打开系统设置。
- ✅ 中 - 题目解析异常未捕获导致卡死：已迁移到 `useQuestionInput` 并做 try/catch/finally。
- ✅ 中 - `max_chunk_sec` 0/负数导致极端分片：已钳制最小 5s。
- ✅ 低 - 火山 ASR 多句返回无分隔符：已改为 join(" ") 并规范空白。
- ✅ 低 - `questionList` 未 trim：已统一 trim。
- ✅ 低 - Markdown 分段仅识别 `##/###`：已改为 `#`~`###`。
- ✅ 低 - Embedding 缓存 key 未规范化 baseUrl：已做尾部 `/` 归一化。
- ✅ 低 - 话题相似度仅做逐字符对比：已改为 bigram 相似度。

## 以后审查格式模板
- ⏳ <严重程度> - <问题描述> `path:line`
- ✅ <严重程度> - <问题描述> `path:line`
