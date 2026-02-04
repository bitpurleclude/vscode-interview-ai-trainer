# 拆分重构规划书（SPLIT_REFACTOR_PLAN）

目的
- 将超 1k 行文件拆分为职责清晰、可复用、易测试的模块。
- 保持现有功能与对外接口不变，降低回归风险。
- 拆分过程分阶段执行，每阶段可独立验证。

范围（当前超 1k 行文件）
1) interview-trainer/src/interviewTrainer/api/it_toolsPresets.ts
2) interview-trainer/src/interviewTrainer/core/it_analyze.ts
3) interview-trainer/src/interviewTrainer/core/it_evaluation.ts
4) interview-trainer/src/interviewTrainer/core/it_notes.ts
5) interview-trainer/webview/src/components/settings/SettingsTemplateManager.tsx

通用原则
- 拆分先“抽离无状态/纯函数”再“抽离有状态/流程编排”。
- 先迁移内部函数，再改引用路径，最后删旧代码。
- 拆分后文件命名与目录结构能一眼看出职责。
- 每个阶段完成后运行构建验证。

拆分规划（逐文件）

一、it_toolsPresets.ts（API 预设）
目标：拆分预设定义、组合逻辑、类型定义。
建议结构：
- interview-trainer/src/interviewTrainer/api/toolsPresets/index.ts
  - 统一导出与注册入口
- interview-trainer/src/interviewTrainer/api/toolsPresets/types.ts
  - 预设结构与类型
- interview-trainer/src/interviewTrainer/api/toolsPresets/builders.ts
  - 组装/规范化/合并逻辑
- interview-trainer/src/interviewTrainer/api/toolsPresets/presets/*.ts
  - 按功能分组的预设集合（例如 web_search、coding、vision 等）

拆分步骤（建议顺序）：
1. 抽出类型与常量 → types.ts
2. 抽出工具构建函数 → builders.ts
3. 按类别拆预设列表 → presets/*.ts
4. index.ts 汇总导出，旧文件仅保留 re-export

二、it_analyze.ts（核心分析流程）
目标：拆分流程编排、ASR、题目解析、评价、结果合成。
建议结构：
- interview-trainer/src/interviewTrainer/core/analyze/flow.ts
  - 主流程编排（原入口）
- interview-trainer/src/interviewTrainer/core/analyze/audio.ts
  - 音频预处理、分片、格式转换
- interview-trainer/src/interviewTrainer/core/analyze/asr.ts
  - ASR 调用、重试、并发
- interview-trainer/src/interviewTrainer/core/analyze/questions.ts
  - 题目解析/分段逻辑
- interview-trainer/src/interviewTrainer/core/analyze/evaluation.ts
  - 评价流程调用
- interview-trainer/src/interviewTrainer/core/analyze/result.ts
  - 结果合成、输出结构

拆分步骤：
1. 抽离纯工具函数（audio/文本）
2. 抽离 ASR 调用与并发控制
3. 抽离题目解析/分段
4. 抽离评价调用
5. flow.ts 只保留编排与聚合

三、it_evaluation.ts（评价逻辑）
目标：拆分 prompt 生成、解析、评分。
建议结构：
- interview-trainer/src/interviewTrainer/core/evaluation/prompt.ts
- interview-trainer/src/interviewTrainer/core/evaluation/parser.ts
- interview-trainer/src/interviewTrainer/core/evaluation/scoring.ts
- interview-trainer/src/interviewTrainer/core/evaluation/types.ts

拆分步骤：
1. 抽出提示词拼装与模板
2. 抽出输出解析
3. 抽出评分规则/权重计算
4. 入口文件只保留 orchestrate

四、it_notes.ts（笔记检索与索引）
目标：拆分索引、检索、缓存与排序。
建议结构：
- interview-trainer/src/interviewTrainer/core/notes/indexer.ts
- interview-trainer/src/interviewTrainer/core/notes/search.ts
- interview-trainer/src/interviewTrainer/core/notes/cache.ts
- interview-trainer/src/interviewTrainer/core/notes/ranking.ts
- interview-trainer/src/interviewTrainer/core/notes/utils.ts

拆分步骤：
1. 抽离缓存读写
2. 抽离文本切片/索引构建
3. 抽离召回/检索
4. 抽离排序与过滤

五、SettingsTemplateManager.tsx（模板管理 UI）
目标：拆分 UI 与状态逻辑、测试逻辑。
建议结构：
- interview-trainer/webview/src/components/settings/template/TemplateListPanel.tsx
- interview-trainer/webview/src/components/settings/template/TemplateEditor.tsx
- interview-trainer/webview/src/components/settings/template/TemplateSidebar.tsx
  - 变量/密钥/Token/选项
- interview-trainer/webview/src/components/settings/template/TemplateTestPanel.tsx
- interview-trainer/webview/src/hooks/useTemplateTest.ts
  - Dry-run / Live 逻辑
- interview-trainer/webview/src/hooks/useTemplateSelection.ts
  - 列表选中/删除/状态

拆分步骤：
1. 抽出列表组件 + 选中逻辑
2. 抽出编辑器组件
3. 抽出侧栏（参数/密钥/Token）
4. 抽出测试区 + hook
5. SettingsTemplateManager.tsx 仅保留布局组合

执行顺序（建议）
1) it_analyze.ts
2) it_toolsPresets.ts
3) it_notes.ts
4) it_evaluation.ts
5) SettingsTemplateManager.tsx

验证与交付
- 每一阶段拆分后运行：npm run build
- 阶段完成后提交：git commit
- 全部完成后打包：npm run package
