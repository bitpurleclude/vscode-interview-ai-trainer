# API 配置指南（百度语音 + 千帆大模型）

## 配置文件位置
首次启动后生成：
`globalStorage/interview_trainer/api_config.yaml`

## 关键字段
```yaml
active:
  environment: prod
  llm: baidu_qianfan
  asr: baidu_vop

environments:
  prod:
    llm:
      provider: baidu_qianfan
      model: ernie-4.5-turbo-128k
      base_url: https://qianfan.baidubce.com/v2
      api_key: "你的千帆 API Key"
    asr:
      provider: baidu_vop
      base_url: https://vop.baidu.com/server_api
      api_key: "你的百度 ASR API Key"
      secret_key: "你的百度 ASR Secret Key"
      max_chunk_sec: 50
      dev_pid: 1537
```

## 安全建议
- 推荐将 Key 存入 VS Code SecretStorage。
- `api_key` 可留空，扩展会优先读取 SecretStorage。

## 测试模式
```yaml
environments:
  test:
    asr:
      provider: mock
      mock_text: "这里填入离线测试转写结果"
```
启用 mock 便于离线测试与 UI 调试。


## 注意
- 百度语音转文字的 `api_key`/`secret_key` 来源于「百度语音技术」，与千帆大模型 API Key 不同。
- 如果只有千帆 API Key，请在百度智能云控制台新建语音识别应用以获取 Secret Key。
- 长音频分析报 3310 时，可将 `max_chunk_sec` 下调到 20-30，或切分音频后再导入。
