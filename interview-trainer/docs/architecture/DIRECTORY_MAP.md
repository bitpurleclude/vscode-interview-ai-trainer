# 目录分类与职责（Directory Map）
```
interview-trainer/
├─ assets/                 # 插件图标资源
├─ config/                 # 默认配置与 providers
├─ scripts/                # 构建脚本
├─ src/                    # 扩展端源码（Node/VS Code）
│  ├─ extension.ts         # 扩展入口
│  ├─ protocol/            # 前后端共享类型定义
│  ├─ webview/             # Webview 视图/协议桥
│  └─ interviewTrainer/    # 业务逻辑（API/核心/handlers/存储等）
├─ webview/                # Webview 前端（React）
│  └─ src/                 # 组件/状态/样式/通信
├─ build/                  # 打包产物（VSIX）
├─ out/                    # extension 编译产物
└─ media/                  # webview 打包资源
```

## 重点目录说明
- `assets/`：插件图标与侧边栏图标（VS Code manifest 使用）。
- `config/`：默认配置（api/app/skill/templates/providers）。
- `src/interviewTrainer/`：后端核心逻辑（分析、检索、评价、模板、日志）。
- `webview/src/`：前端 UI、数据流与与扩展端通信。

## 排除目录
- `node_modules/`、`build/`、`out/`、`media/` 为产物或依赖，不写工程文档。
