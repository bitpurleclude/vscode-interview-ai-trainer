# 资源（assets）

## 模块定位与职责
存放 VS Code 插件图标与侧边栏图标资源。

## 关键文件
- `assets/icon.svg`：扩展主图标
- `assets/sidebar-icon.svg`：侧边栏图标

## 注意事项
- 资源会被打包到 VSIX，修改后需重新 `npm run package`
- 图标尺寸与对比度应符合 VS Code 主题显示效果
