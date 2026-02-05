# 日志与实时输出（backend-logging）

## 模块定位与职责
统一日志输出与实时流式更新，便于排查模板与请求问题。

## 目录与关键文件
- `src/interviewTrainer/application/services/it_logging.ts`：日志输出与 Webview stream 更新
- `src/interviewTrainer/infra/logging/it_traceLogger.ts`：trace 日志封装

## 关键调用链
- 模板测试失败：`it_webviewTestHandlers.ts` → `it_logging.ts`
- 分析流程：`application/useCases/it_analysisFlow.ts` → `it_logging.ts` → Webview

## 注意事项
- 输出面板：`Interview Trainer`
- 日志开关默认关闭，仅设置页开启后打印
