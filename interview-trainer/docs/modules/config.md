# 配置（config）

## 模块定位与职责
提供默认配置模板，扩展端启动时会拷贝/合并到用户配置目录。

## 关键文件
- `config/api_config.yaml`：API/环境/绑定默认值
- `config/app_config.yaml`：应用层配置
- `config/skill_config.yaml`：分析/检索/评价策略
- `config/templates.yaml`：模板定义
- `config/providers/*.yaml`：厂商 provider 默认参数

## 关键调用链
- `ItConfigService` 读取 `config/*` → 合并到 `ItConfigBundle`
- Webview 设置页读取/更新配置 → 写回用户配置

## 注意事项
- `templates.yaml` 的字段应与前端“可引用变量”保持一致
- provider 默认参数会被环境配置覆盖
