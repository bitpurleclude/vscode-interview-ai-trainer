# 面试训练助手（vscode-interview-ai-trainer）

面试训练助手是一款用于结构化面试训练的 VS Code/Windsurf 插件。支持录音或导入音频，自动转写、检索知识库、评分并生成 Markdown 报告。插件内置 `ffmpeg`（随 VSIX 打包），无需额外安装即可使用。

## 主要能力

- 录音 / 导入：系统麦克风录音，或导入常见音频格式（自动转 16k 单声道 PCM）。
- 题干管理：支持材料/小题列表输入，支持导入 txt/md，分析时自动识别题目。
- 多题分段：多题自动分段与对齐，给出单题用时与答案文本。
- 面试评价：声学指标 + 转写文本 + 评分与改写建议。
- 答题提纲：输出“你的回答/示范答案”提纲，使用 Markdown 缩进层级。
- 知识库检索：可配置笔记、题库、评分标准、知识点、示范答案目录。
- 缓存与诊断：清理向量缓存/语料索引，查看缓存目录与并发参数。

## 安装

1. 生成 VSIX：`interview-trainer/build/interview-trainer.vsix`
2. VS Code/Windsurf 通过 “Extensions: Install from VSIX...” 安装，或使用：
   ```bash
   code --install-extension ./interview-trainer/build/interview-trainer.vsix --force
   ```

## 快速使用

1. 打开侧边栏“面试训练助手”。
2. 填写题干或导入题干文件（txt/md）。
3. 录音或导入音频。
4. 点击“开始分析”，等待完成。
5. 在结果页查看转写、评价、提纲与报告；点击“保存结果”打开报告文件。

## 题干与输入示例

### 题干材料
```
在全民健身理念日益深入人心的当下，各地举办马拉松赛事。请谈谈你的看法。
```

### 小题列表（推荐）
```
1. 你怎么看待马拉松赛事热？
2. 马拉松赛事在组织上存在哪些问题？
3. 你会提出哪些改进建议？
```

### 题干文件格式
- 支持 `.txt` / `.md`
- 可包含“材料 + 小题列表”，分析时自动识别

## 分析流程（状态展示）

开始分析后会逐步显示进度：
- 题目解析
- 语音转写
- 声学分析
- 多题分段（仅多题）
- 笔记学习（语料扫描与检索）
- 面试评价
- 结果生成 / 文件写入

## 输出与文件结构

默认输出目录：`<工作区>/sessions/YYYYMMDD/<topic-slug>/`

- `attempt-XX-*.wav`：录音文件
- `*.md`：总报告（含转写/评价/提纲/示范）
- `reference_notes.md`：引用笔记与可参考素材（同题共享）
- `attempts.json`：每次作答结构化记录
- `meta.json`：题目元信息

### 报告结构示例

```
# 题目标题

## 第1次作答
Timestamp: ...
Audio file: ...
Total duration: ...

### 转写文本
...

### 声学分析
| 指标 | 数值 |
| --- | --- |
| 时长 | ... |
...

### 面试评价
- 总结: ...
- 维度评分:
  - 内容完整性: 6
  - 逻辑清晰度: 5
...

### 示范性修改
1. 题目文本
   - 建议用时: 4分钟
   - 原回答:
     ...
   - 答题提纲（你的回答）:
     - 一、开头
       - ...
   - 示范:
     ...
   - 答题提纲（示范）:
     - 一、开头
       - ...
```

## 设置说明（设置页）

### 1) 提供者配置
- 每个 Provider 独立 YAML 文件，可包含 LLM / Embedding / ASR。
- 可在设置页新增 Provider，并打开配置文件。

### 2) 通用配置
- 环境（prod/test/dev）：可直接输入新环境名称并保存。
- 当前使用的 LLM/ASR Provider、保存目录。

### 3) LLM（评分/问答）
- Provider / Model / Base URL / API Key
- 温度 / TopP / 超时 / 重试
- “测试 LLM 接口”用于验证配置

### 4) ASR（语音转写）
- Provider / Base URL / API Key / Secret
- 语言 / dev_pid
- 分片(s) / 并发 / 超时 / 重试
- Mock 文本（仅 provider=mock 时使用）

### 5) 评分提示词 & 示范答案提示词
- 评分提示词控制评分规则与输出字段
- 示范提示词控制示范答案结构与时长
- 提纲输出使用 Markdown 列表缩进

### 6) 输入设备
- 刷新/选择麦克风输入设备
- 可设置 `IT_FFMPEG_INPUT=audio=设备名` 指定设备

### 7) 检索配置
- 启用检索 / 模式（向量语义或词面匹配）
- TopK / MinScore
- Embedding Provider/Model/Base URL/API Key/超时/重试/批大小/Query 上限
- 可清理向量缓存与语料索引

### 8) 默认知识库目录
```
inputs/notes       # 笔记
inputs/prompts     # 题目或提示语料
inputs/rubrics     # 评分标准
inputs/knowledge   # 知识点
inputs/examples    # 示范/例子
```

## 配置文件位置

- 全局配置目录：`<VS Code 全局存储>/interview_trainer/`
- 主要文件：
  - `api_config.yaml`：LLM/ASR 配置
  - `skill_config.yaml`：检索与目录配置
  - `providers/*.yaml`：Provider 配置

设置页点击“查看配置文件”可直接打开。
补充：`interview-trainer/config/templates.*.example.yaml` 会随 VSIX 打包，并在插件启动时自动合并到用户 `templates.yaml`（仅补充缺失模板，不覆盖已有配置）。

## SiliconFlow API 接入模板（通用）

下面这套模板按本项目当前模板执行链路编写，已对齐：
- 插件模板变量与执行逻辑：`interview-trainer/src/interviewTrainer/infra/api/it_templateExecutor.ts`
- LLM Chat 调用结构：`interview-trainer/src/interviewTrainer/infra/api/it_llm.ts`
- OpenAI Compatible Chat 请求结构：`interview-trainer/src/interviewTrainer/infra/api/it_requestBuilder.ts`

对应 SiliconFlow 官方 Chat Completions 文档要点：
- Base URL：`https://api.siliconflow.cn/v1`
- Endpoint：`POST /chat/completions`
- 鉴权：`Authorization: Bearer <SILICONFLOW_API_KEY>`
- 必填参数：`model`、`messages`

### 可直接复用模板（templates.yaml）

仓库内已提供示例文件：
`interview-trainer/config/templates.siliconflow.example.yaml`

也可直接复制以下通用片段到你的 `templates.yaml`：

```yaml
version: 1
environments:
  prod:
    templates:
      "llm:siliconflow-chat":
        id: "llm:siliconflow-chat"
        name: "SiliconFlow Chat Completions"
        category: "llm"
        request:
          method: "POST"
          url: "https://api.siliconflow.cn/v1/chat/completions"
          headers:
            Authorization: "Bearer {{secrets.siliconflow_api_key}}"
            Content-Type: "application/json"
          body:
            model: "<YOUR_CHAT_MODEL>"
            messages: "{{messages}}"
            temperature: "{{temperature}}"
            top_p: "{{topP}}"
            stream: false
          timeoutSec: 60
        response:
          mode: "json"
          textPath: "choices[0].message.content"

      "embedding:siliconflow-embedding":
        id: "embedding:siliconflow-embedding"
        name: "SiliconFlow Embeddings"
        category: "embedding"
        request:
          method: "POST"
          url: "https://api.siliconflow.cn/v1/embeddings"
          headers:
            Authorization: "Bearer {{secrets.siliconflow_api_key}}"
            Content-Type: "application/json"
          body:
            model: "{{model}}"
            input: "{{embeddingInput}}"
          timeoutSec: 30
        response:
          mode: "json"

    bindings:
      llm:
        questionParse: "llm:siliconflow-chat"
        title: "llm:siliconflow-chat"
        segment: "llm:siliconflow-chat"
        evaluation: "llm:siliconflow-chat"
      asr:
        transcription: "<YOUR_EXISTING_ASR_TEMPLATE_ID>"
      embedding:
        retrieval: "embedding:siliconflow-embedding"

    secrets:
      - "siliconflow_api_key"

    param_options:
      reasoning_effort:
        - "low"
        - "medium"
        - "high"
        - "xhigh"

    token_options:
      auto_refresh: true
```

### 使用说明

1. 将 `<YOUR_CHAT_MODEL>` 替换为你在 SiliconFlow 已开通的聊天模型名。
2. 在设置页的“API 模板管理”中新增密钥名 `siliconflow_api_key` 并保存真实 Key。
3. `asr.transcription` 绑定请保留你当前可用的 ASR 模板 ID（SiliconFlow 此处仅提供 LLM/Embedding 接入模板）。
4. 如果暂时不使用向量检索，可在检索设置中切到 `keyword` 模式，先只验证 LLM 链路。
5. 为兼容本插件当前模板执行路径，建议先用 `stream: false`；稳定后再按需扩展 SSE 流式模板。

## 火山方舟（ARK）API 接入模板（Chat Completions）

基于官方 Chat Completions 方式（你给的示例 `curl`）可直接接入本插件模板系统：
- Endpoint：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- Header：`Content-Type: application/json`、`Authorization: Bearer <ARK_API_KEY>`
- Body 关键字段：`model`、`messages`

### 可直接复用模板（templates.yaml）

仓库内已提供示例文件：
`interview-trainer/config/templates.volc-ark.example.yaml`

也可直接复制以下片段到你的 `templates.yaml`：

```yaml
version: 1
environments:
  prod:
    templates:
      "llm:volc-ark-chat":
        id: "llm:volc-ark-chat"
        name: "Volcengine Ark Chat Completions"
        category: "llm"
        request:
          method: "POST"
          url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
          headers:
            Authorization: "Bearer {{secrets.ark_api_key}}"
            Content-Type: "application/json"
          body:
            model: "doubao-1-5-pro-32k-250115"
            messages: "{{messages}}"
            temperature: "{{temperature}}"
            top_p: "{{topP}}"
            stream: false
          timeoutSec: 60
        response:
          mode: "json"
          textPath: "choices[0].message.content"

    bindings:
      llm:
        questionParse: "llm:volc-ark-chat"
        title: "llm:volc-ark-chat"
        segment: "llm:volc-ark-chat"
        evaluation: "llm:volc-ark-chat"
      asr:
        transcription: "<YOUR_EXISTING_ASR_TEMPLATE_ID>"

    secrets:
      - "ark_api_key"
```

### 使用说明

1. 在设置页“API 模板管理”里新增密钥名 `ark_api_key` 并保存你的火山 API Key。
2. 如果模型名不同，替换 `model: "doubao-1-5-pro-32k-250115"`。
3. `asr.transcription` 继续绑定你当前可用 ASR 模板（这套模板只覆盖 LLM）。
4. 先用模板测试的 dry-run / live 验证，再绑定到 `questionParse/title/segment/evaluation`。

### Embedding（多模态）模板

如果你要按火山方舟官方 `embeddings/multimodal` 方式接入，可使用下列模板片段（已写入 `interview-trainer/config/templates.volc-ark.example.yaml`）：

```yaml
"embedding:volc-ark-multimodal":
  id: "embedding:volc-ark-multimodal"
  name: "Volcengine Ark Embeddings Multimodal"
  category: "embedding"
  request:
    method: "POST"
    url: "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal"
    headers:
      Authorization: "Bearer {{secrets.ark_api_key}}"
      Content-Type: "application/json"
    body:
      model: "doubao-embedding-vision-250615"
      input:
        - type: "text"
          text: "{{embeddingInput}}"
        - type: "image_url"
          image_url:
            url: "{{imageUrl}}"
    timeoutSec: 30
  response:
    mode: "json"
    jsonPath: "data[0].embedding"
```

运行说明：
- 当模板 URL 使用 `embeddings/multimodal` 且检索阶段一次传入多条文本时，插件会自动在客户端做 fan-out（逐条请求并聚合向量），以兼容该接口单次返回单向量的行为。

模板测试时可在“变量 JSON”里传入：

```json
{
  "imageUrl": "https://ark-project.tos-cn-beijing.volces.com/images/view.jpeg"
}
```

注意：
- 多模态模板主要用于“图文联合向量”场景。
- 若用于当前插件的文本检索链路，建议优先使用纯文本 embedding 模板，或先将检索模式切为 `keyword` 以避免向量批处理不匹配。

## 百度语音转文字（Token + 请求）模板

下面这套模板对应你给的两步调用：
1. 先调用 `oauth/2.0/token` 获取 `access_token`
2. 再调用 `https://vop.baidu.com/server_api` 做 ASR

仓库内已提供示例文件：
`interview-trainer/config/templates.baidu-asr-token.example.yaml`

可直接复用片段如下：

```yaml
version: 1
environments:
  prod:
    templates:
      "token:baidu-asr-access-token":
        id: "token:baidu-asr-access-token"
        name: "Baidu ASR Access Token"
        category: "token"
        request:
          method: "POST"
          url: "https://aip.baidubce.com/oauth/2.0/token"
          query:
            grant_type: "client_credentials"
            client_id: "{{secrets.baidu_asr_api_key}}"
            client_secret: "{{secrets.baidu_asr_secret_key}}"
          headers:
            Content-Type: "application/json"
          timeoutSec: 30
        response:
          mode: "json"
          textPath: "access_token"
        token:
          name: "baidu_asr_access_token"
          valuePath: "access_token"
          expiresInPath: "expires_in"
          refreshBeforeSec: 86400
          maxRetries: 1
          enabled: true

      "asr:baidu-vop-token":
        id: "asr:baidu-vop-token"
        name: "Baidu VOP ASR With Token"
        category: "asr"
        request:
          method: "POST"
          url: "https://vop.baidu.com/server_api"
          headers:
            Content-Type: "application/json"
            Accept: "application/json"
          body:
            format: "{{audio.format}}"
            rate: "{{audio.rate}}"
            channel: "{{audio.channel}}"
            cuid: "interview-trainer"
            dev_pid: "{{asr.dev_pid}}"
            speech: "{{audioFile}}"
            len: "{{audio.byteLength}}"
            token: "{{tokens.baidu_asr_access_token}}"
          timeoutSec: 120
        response:
          mode: "json"
          textPath: "result[0]"

    bindings:
      asr:
        transcription: "asr:baidu-vop-token"

    secrets:
      - "baidu_asr_api_key"
      - "baidu_asr_secret_key"

    token_options:
      auto_refresh: true
```

### 使用步骤

1. 在设置页“API 模板管理”新增并保存两个密钥：
`baidu_asr_api_key`、`baidu_asr_secret_key`。
2. 在模板绑定中把 `asr.transcription` 绑定到 `asr:baidu-vop-token`。
3. 点击“刷新全部 Token”或先做一次 token 模板 live 测试，确认 `baidu_asr_access_token` 已生成。
4. 再做 ASR 模板 live 测试，确认返回 `result[0]` 文本。

说明：
- `refreshBeforeSec: 86400` 表示在过期前 1 天自动刷新 token（百度默认有效期通常约 30 天）。
- 如果你需要指定 `cuid`，把 `cuid: "interview-trainer"` 改成固定设备标识即可。

## 性能优化建议

- 语料大导致检索慢：精简 `inputs/*` 目录。
- 向量检索慢：降低 TopK、缩短 Query 上限；或改用词面匹配。
- 转写慢：提高 ASR 并发，缩短分片时长。
- 长音频建议分段录制或分段导入。

## 常见问题

- 录音无设备：刷新输入设备，检查系统麦克风权限。
- 导入音频失败：确认格式可被 ffmpeg 识别，必要时先转 WAV(16kHz 单声道)。
- 转写/评分报错：检查 API Key、网络、Base URL。
- 检索慢/无结果：检查知识库目录内容与 embedding 配置。

## 构建与打包

```bash
cd interview-trainer
npm install
npm run build
npm run test
npm run package
```

## 兼容性

- 基于 VS Code Extension API，理论上支持 VS Code 内核 IDE（Windsurf、Cursor、VSCodium 等）。
- 需要支持 Webview 与侧边栏视图。

更多细节见 `docs/`。
