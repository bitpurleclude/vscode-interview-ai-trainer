# 后端 API/模板层（backend-api）

## 模块定位与职责
负责配置、模板执行、请求构建与对外 API 适配层，统一 LLM/ASR/Embedding/Token 的请求入口。

## 目录与关键文件
- `src/interviewTrainer/infra/api/it_apiConfig.ts`：配置结构与默认值、用户目录定位
- `src/interviewTrainer/infra/api/it_configService.ts`：配置加载/合并/保存（含模板配置）
- `src/interviewTrainer/infra/api/it_templateExecutor.ts`：模板渲染、请求执行、模板变量解析
- `src/interviewTrainer/infra/api/it_requestBuilder.ts`：将模板与变量转为请求体
- `src/interviewTrainer/infra/api/it_llm.ts` / `it_embedding.ts`：通用 LLM/Embedding 调用入口
- `src/interviewTrainer/infra/api/it_baidu.ts` / `it_qianfan.ts` / `it_volc_asr.ts`：厂商适配
- `src/interviewTrainer/infra/api/it_llmTypes.ts`：LLM 配置类型
- `src/interviewTrainer/infra/api/it_toolsPresets.ts` + `toolsPresets/presets/*`：工具预设

## 主要流程
1) `ItConfigService` 读取 `config/*.yaml` + 用户配置，合并为 `ItConfigBundle`
2) `it_templateExecutor` 按模板分类与环境选择模板，调用 `it_requestBuilder` 生成请求
3) 执行请求并记录 trace（供 dryrun/live 与日志使用）

## 关键调用链
- 设置页模板测试：`webview` → `it_webviewTestHandlers.ts` → `it_templateExecutor.ts`
- 分析流程模板：`domain/analyze/*` → `it_resolveBindingTemplate()` → `it_buildTemplateLlmConfig()`

## 配置与环境
- `config/templates.yaml`：模板定义
- `config/providers/*.yaml`：厂商默认参数
- 用户配置目录：`it_apiConfig.ts` 中解析

## 注意事项
- 模板变量需与前端“可引用变量”一致，否则易出现 dryrun/live 不一致
- `templateEnv` 与 `environment` 影响模板选择，注意 prod/dev 区分

## 常见问题
- 请求 400：通常是模板参数缺失/类型不匹配
- stream 不生效：模板中 `request.stream` 与 `response.mode` 需匹配

## 测试建议
- 使用设置页 dryrun/live 测试模板
- 对新增模板先走 `it_templateExecutor` 并查看日志
