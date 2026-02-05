import type { ItAcousticMetrics, ItNoteHit } from "../../../protocol/interviewTrainer";
import { it_buildSummary } from "../../domain/evaluation/prompt";

export function it_buildSystemPrompt(customSystemPrompt?: string): string {
  const trimmed = customSystemPrompt?.trim();
  if (trimmed) {
    return trimmed;
  }
  return [
    "你是严格、直接的中文面试评审，仅输出 JSON，不要出现英文标签、客套或安慰语。",
    "评分规则（1-10，整数）：10=卓越/完整无明显缺陷；8=良好仅有轻微问题；6=基本达标但有明显缺口；4=不达标；2=严重不足/几乎无有效内容；1=违规或完全失败。",
    "若语音时长极短、长时间静音或回答缺失，整体与各维度不得高于2，并在 issues 中说明原因。",
    "若未覆盖题干要点、逻辑混乱或无可执行对策，相关维度不高于5。",
    "严禁使用“继续加油”等安慰式措辞，问题描述必须直白、具体、可执行。",
    "strengths/issues/improvements 至少各2条；nextFocus 至少2条。",
    "revised 必须分段输出，至少3段，段落之间空一行，段内按步骤要点展开。",
    "输出前自检：revised 至少包含两处空行（\n\n）。若未满足，请先调整后再输出。",
    "先生成 outlineRevised，再按 outlineRevised 的一级标题组织 revised，一级标题必须单独成行。",
    "revisedAnswers 必须输出 JSON 数组并与题目一一对应，字段：question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
    "outlineOriginal/outlineRevised 必须是 Markdown 列表文本（每题8-18条），分别对应“原回答提纲”与“示范提纲”。",
    "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级，至少两级且必须出现二级缩进（两个空格 + -）。",
    "第一层级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
    "每条<=20字。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    "如提供检索笔记，必须在 noteUsage/noteSuggestions 中列出可用素材与可参考思路（至少2条），格式：source :: 用法/思路。",
  ].join("\n");
}

export function it_buildStaticPromptParts(params: {
  demoPrompt?: string;
  material?: string;
  backgroundQuestions: string[];
  questions: string[];
  question: string;
  dimensions: string[];
  notes: ItNoteHit[];
}): string[] {
  const demoPrompt = params.demoPrompt?.trim() || "";
  const material = params.material?.trim() || "";
  const backgroundQuestions = params.backgroundQuestions || [];
  const questions = params.questions || [];
  const parts: string[] = [
    demoPrompt ? `示范补充要求:\n${demoPrompt}` : "示范补充要求: 无",
    material ? `材料:\n${material}` : "材料: 无",
    backgroundQuestions.length
      ? `背景题目列表(仅供参考):\n${backgroundQuestions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "背景题目列表(仅供参考): 无",
    questions.length
      ? `本次评审题目列表:\n${questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n")}`
      : "本次评审题目列表: 无",
    `本题题干:\n${params.question || "未提供"}`,
    `评分维度(每项1-10分): ${params.dimensions.join("、")}`,
    "评分输出字段必须使用 overallScore 与 scores（维度: 分数），禁止使用“评分/维度评分/维度Scores”等变体。",
    "revisedAnswers 必须输出 JSON 数组并与题目一一对应，字段：question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
    "outlineOriginal/outlineRevised 必须是 Markdown 列表文本（每题8-18条），分别对应“原回答提纲”与“示范提纲”。",
    "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级。",
    "第一层级用中文序号+标题（如一、开头 二、重要性 三、问题 四、对策 五、结尾）。",
    "每条<=20字。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    params.notes.length
      ? `检索笔记:\n${params.notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\n")}`
      : "检索笔记: 无",
  ];
  return parts;
}

export function it_buildDynamicPromptParts(params: {
  transcript: string;
  resolvedAnswers: Array<{ question: string; answer: string }>;
  questions: string[];
  acoustic: ItAcousticMetrics;
}): string[] {
  const transcript = params.transcript || "";
  const answers = params.resolvedAnswers || [];
  return [
    `本题回答:\n${transcript || "未提供"}`,
    params.questions.length
      ? `本次评审回答:\n${answers
          .map((item, idx) => `${idx + 1}. ${item.answer || "（空）"}`)
          .join("\n")}`
      : "本次评审回答: 无",
    `声学摘要:\n${it_buildSummary(params.acoustic)}`,
  ];
}

export function it_buildPromptText(
  systemPrompt: string,
  staticPrompt: string,
  dynamicPrompt: string,
): string {
  const userPrompt = [staticPrompt, dynamicPrompt].filter(Boolean).join("\n\n");
  return `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`;
}