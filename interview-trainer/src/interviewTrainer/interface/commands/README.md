# interface/commands

VS Code 命令入口与注册说明。

- 仅负责命令绑定与触发。
- 命令逻辑应调用 application/useCases 或 services。
