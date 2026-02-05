# 协议与共享类型（backend-protocol）

## 模块定位与职责
定义扩展端与 Webview 之间共享的类型、消息数据结构与状态模型。

## 目录与关键文件
- `src/protocol/interviewTrainer.ts`：核心类型（ItState/ItAnalyzeRequest/ItAnalyzeResponse 等）

## 关键调用链
- 后端：`InterviewTrainerExtension` / interface / application / domain 全部依赖此类型定义
- 前端：`webview/src/types.ts` 以此为基础对齐

## 注意事项
- 修改协议类型需同步前端 `webview/src/types.ts`
- 任何字段改动都可能影响历史数据解析
