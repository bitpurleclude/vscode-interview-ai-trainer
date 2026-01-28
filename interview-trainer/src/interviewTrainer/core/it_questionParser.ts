import { ItLlmConfig, it_callLlmChat } from "../api/it_llm";

export interface ItParsedQuestions {
  material: string;
  questions: string[];
  source: "llm" | "heuristic";
  raw?: string;
}

function it_cleanQuestionText(text: string): string {
  return text
    .replace(/^第\s*[一二三四五六七八九十0-9]+\s*[题问][：:]?/, "")
    .replace(/^【?题目】?/, "")
    .replace(/^\d+[.、]/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function it_parseQuestionsHeuristic(text: string): ItParsedQuestions {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { material: "", questions: [], source: "heuristic" };
  }

  const marker = /第\s*[一二三四五六七八九十0-9]+\s*[题问][：:]/g;
  const matches = Array.from(normalized.matchAll(marker));
  if (!matches.length) {
    return {
      material: normalized.replace(/【题目】/g, "").trim(),
      questions: [],
      source: "heuristic",
    };
  }

  const firstIdx = matches[0].index ?? 0;
  let material = normalized.slice(0, firstIdx).replace(/【题目】/g, "").trim();
  const questions: string[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index ?? normalized.length : normalized.length;
    const raw = normalized.slice(start, end).trim();
    const cleaned = raw.split(/解析[:：]|答案[:：]|建议[:：]|参考[:：]|点评[:：]/)[0].trim();
    const question = it_cleanQuestionText(cleaned);
    if (question) {
      questions.push(question);
    }
  }

  if (!questions.length) {
    material = normalized.replace(/【题目】/g, "").trim();
  }

  return {
    material,
    questions,
    source: "heuristic",
  };
}

function it_extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function it_parseQuestions(
  text: string,
  llmConfig?: ItLlmConfig | null,
): Promise<ItParsedQuestions> {
  const fallback = it_parseQuestionsHeuristic(text);
  if (!llmConfig || !text.trim()) {
    return fallback;
  }

  const systemPrompt =
    "你是中文材料解析助手，请从材料中提取背景材料与题目列表。只输出JSON。";
  const userPrompt = [
    "要求:",
    "1) material 只保留背景材料或引导语，不要包含题目、解析或答案。",
    "2) questions 仅包含真实题目，每题单独一句，去掉“解析/答案/参考/建议/点评”等内容。",
    "3) 如果没有题目，请返回 questions 为空数组。",
    "输出JSON字段: material, questions。",
    "",
    "材料如下:",
    text,
  ].join("\n");

  try {
    const content = await it_callLlmChat(llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const parsed = it_extractJson(content);
    if (parsed && Array.isArray(parsed.questions)) {
      const questions = parsed.questions.map((item: any) => it_cleanQuestionText(String(item))).filter(Boolean);
      const material = String(parsed.material || "").trim();
      if (questions.length) {
        return {
          material,
          questions,
          source: "llm",
          raw: content,
        };
      }
    }
  } catch {
    // ignore and fallback
  }

  return fallback;
}
