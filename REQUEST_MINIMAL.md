# Responses 最小可用请求结构（gmn.chuangzuoli.com/responses）

## 必需字段
- `model`
- `input`（必须是 Responses 规范的 message 结构，不能是纯字符串或 Chat 结构）

## 最小可用 JSON（已验证 200）
```json
{
  "model": "gpt-5.2-codex",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        { "type": "input_text", "text": "ping" }
      ]
    }
  ]
}
```

## 请求头（最小）
- `Authorization: Bearer <API_KEY>`
- `Content-Type: application/json`

## 备注
- `input` 为字符串或 Chat 结构（`{role, content}` 但缺少 `type: message`/`input_text`）会返回 400。
- 需要流式输出时可加：`Accept: text/event-stream` + `stream: true`。

优先建议保留

instructions：控制评审/分析风格，是插件核心能力
stream：实时输出体验（你已经在用）
reasoning（如果服务端支持）：可调“思考强度”，用于质量/速度权衡
prompt_cache_key：同一会话复用提示词，减少成本和延迟
有场景再用

tools + tool_choice + parallel_tool_calls：只有在接入工具/联网/搜索/检索时才有意义
当前意义较小

store：目前插件侧没有用到存储
include：仅当你需要拿到 reasoning.encrypted_content 这类额外返回时才需要
