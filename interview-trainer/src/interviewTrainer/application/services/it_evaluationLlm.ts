import type { ItNoteHit } from "../../../protocol/interviewTrainer";
import { it_requestLlmChatStreaming } from "../../infra/clients/llmClient";
import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import type { ItEvaluationConfig } from "./it_evaluationTypes";
import {
  it_extractJsonPayload,
  it_extractOutlineHeadings,
  it_toOutlineArray,
} from "../../domain/evaluation/parser";

function it_canUseLlm(config: ItEvaluationConfig): boolean {
  return Boolean(config.template || config.apiKey);
}

function it_maskLlmConfig(config: ItLlmConfig): Record<string, unknown> {
  const { templateContext, template, ...rest } = config;
  return {
    ...rest,
    apiKey: config.apiKey ? "***" : "",
    template: template
      ? {
          id: template.id,
          name: template.name,
          category: template.category,
        }
      : undefined,
  };
}

async function it_generateRevisedByOutline(
  config: ItEvaluationConfig,
  items: Array<{
    question: string;
    outlineRevised?: string[];
    notes?: ItNoteHit[];
  }>,
  demoPrompt?: string,
  materialText?: string,
  backgroundQuestions?: string[],
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void,
): Promise<string[] | null> {
  if (!items.length || !it_canUseLlm(config)) {
    return null;
  }
  const systemPrompt = [
    "你是中文面试示范回答生成器，只输出 JSON。",
    "必须先根据提纲组织回答，再输出回答。",
    "回答必须按给定一级标题分段：每个标题单独一行作为小标题，标题后空一行写正文，段落之间空一行。",
    "不得更改一级标题文本与顺序，不得输出提纲本身。",
    "正文需覆盖二级要点，语言正式、逻辑清晰、衔接自然。",
    "输出 JSON 格式: { \"answers\": [ { \"revised\": \"...\" } ] }",
  ].join("\n");
  const material = materialText?.trim() || "";
  const background = backgroundQuestions && backgroundQuestions.length ? backgroundQuestions : [];
  const userPrompt = [
    demoPrompt ? `示范补充要求:\n${demoPrompt}` : "示范补充要求: 无",
    material ? `材料:\n${material}` : "材料: 无",
    background.length
      ? `背景题目列表(仅供参考):\n${background
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "背景题目列表(仅供参考): 无",
    items
      .map((item, idx) => {
        const outlineLines = item.outlineRevised || [];
        const headings = it_extractOutlineHeadings(outlineLines);
        const notes = item.notes || [];
        return [
          `第${idx + 1}题题干:\n${item.question || "未提供"}`,
          headings.length
            ? `一级标题(必须原样作为分段标题,顺序不可变):\n${headings
                .map((h) => `- ${h}`)
                .join("\n")}`
            : "一级标题: 无",
          outlineLines.length
            ? `提纲(含二级):\n${outlineLines.join("\n")}`
            : "提纲: 无",
          notes.length
            ? `检索笔记:\n${notes.map((note) => `- ${note.source} :: ${note.snippet}`).join("\n")}`
            : "检索笔记: 无",
        ].join("\n");
      })
      .join("\n\n"),
  ].join("\n\n");

  try {
    const callConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      topP: config.topP,
      timeoutSec: config.timeoutSec,
      maxRetries: Math.max(0, Number(config.maxRetries ?? 1)),
      antiRepeat: config.antiRepeat,
      useResponses: config.useResponses,
      apiMode: config.apiMode,
      responsesPath: config.responsesPath,
      promptCacheKey: config.promptCacheKey,
      reasoningEffort: config.reasoningEffort,
      maxOutputTokens: config.maxOutputTokens,
      reusePrefix: config.reusePrefix,
      stream: config.stream,
      template: config.template,
      templateEnv: config.templateEnv,
      templateContext: config.templateContext,
      templateVars: config.templateVars,
      templateMaxRetries: config.templateMaxRetries,
    };
    onTrace?.("面试评价 LLM 请求（按提纲生成示范）", {
      config: it_maskLlmConfig(callConfig),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    onStream?.({ text: "", reset: true });
    const content = await it_requestLlmChatStreaming(
      callConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        onDelta: onStream
          ? (_delta: string, full: string) => onStream({ text: full })
          : undefined,
        stream: callConfig.stream,
      },
    );
    onStream?.({ text: content, done: true });
    onTrace?.("面试评价 LLM 返回（按提纲生成示范）", { text: content });
    const parsed = it_extractJsonPayload(content);
    const list = Array.isArray(parsed?.answers)
      ? parsed.answers
      : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    if (!Array.isArray(list) || !list.length) {
      return null;
    }
    return list.map((entry: any) => String(entry?.revised || ""));
  } catch (error) {
    onTrace?.("面试评价 LLM 失败（按提纲生成示范）", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function it_generateOutlines(
  config: ItEvaluationConfig,
  items: Array<{ question: string; original: string; revised: string }>,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void,
): Promise<Array<{ outlineOriginal?: string[]; outlineRevised?: string[] }> | null> {
  if (!items.length || !it_canUseLlm(config)) {
    return null;
  }
  const systemPrompt = [
    "你是答题提纲生成器，只输出 JSON。",
    "每题输出 outlineOriginal/outlineRevised，为关键词式提纲（必须是 Markdown 列表文本字符串，不得输出数组）。",
    "必须包含多层结构（至少两级），只能使用 Markdown 列表缩进表示层级，且必须出现二级缩进（两个空格+ -），禁止使用箭头符号与平铺列表。",
    "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
    "每条<=20字，尽量用关键词短语，避免完整长句。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    "每题8-18条。",
  ].join("\n");
  const userPrompt = [
    "请根据以下题目与回答生成提纲：",
    items
      .map((item, idx) =>
        [
          `${idx + 1}. 题目: ${item.question}`,
          `原回答: ${item.original || "（空）"}`,
          `示范: ${item.revised || "（空）"}`,
        ].join("\n"),
      )
      .join("\n\n"),
    "",
    "输出 JSON 格式: { \"outlines\": [ { \"outlineOriginal\": \"Markdown列表...\", \"outlineRevised\": \"Markdown列表...\" } ] }，outlineOriginal/outlineRevised 必须是 Markdown 列表字符串（必须包含二级缩进，禁止使用箭头符号）。",
  ].join("\n");
  try {
    const callConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      topP: config.topP,
      timeoutSec: config.timeoutSec,
      maxRetries: Math.max(0, Number(config.maxRetries ?? 1)),
      antiRepeat: config.antiRepeat,
      useResponses: config.useResponses,
      apiMode: config.apiMode,
      responsesPath: config.responsesPath,
      promptCacheKey: config.promptCacheKey,
      reasoningEffort: config.reasoningEffort,
      maxOutputTokens: config.maxOutputTokens,
      reusePrefix: config.reusePrefix,
      stream: config.stream,
      template: config.template,
      templateEnv: config.templateEnv,
      templateContext: config.templateContext,
      templateVars: config.templateVars,
      templateMaxRetries: config.templateMaxRetries,
    };
    onTrace?.("面试评价 LLM 请求（提纲修复）", {
      config: it_maskLlmConfig(callConfig),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    onStream?.({ text: "", reset: true });
    const content = await it_requestLlmChatStreaming(
      callConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        onDelta: onStream
          ? (_delta: string, full: string) => onStream({ text: full })
          : undefined,
        stream: callConfig.stream,
      },
    );
    onStream?.({ text: content, done: true });
    onTrace?.("面试评价 LLM 返回（提纲修复）", { text: content });
    const parsed = it_extractJsonPayload(content);
    const outlineList = Array.isArray(parsed?.outlines)
      ? parsed.outlines
      : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    if (!Array.isArray(outlineList) || !outlineList.length) {
      return null;
    }
    return outlineList.map((entry: any) => ({
      outlineOriginal: it_toOutlineArray(
        entry?.outlineOriginal ?? entry?.outline_original ?? entry?.outlineUser,
      ),
      outlineRevised: it_toOutlineArray(
        entry?.outlineRevised ?? entry?.outline_revised ?? entry?.outlineDemo,
      ),
    }));
  } catch (error) {
    onTrace?.("面试评价 LLM 失败（提纲修复）", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export { it_canUseLlm, it_generateRevisedByOutline, it_generateOutlines };
