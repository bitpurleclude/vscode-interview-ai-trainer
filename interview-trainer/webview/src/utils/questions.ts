import { request } from "../messenger";

export async function parseQuestionsRemote(
  text: string,
): Promise<{ prompt: string; questions: string[]; source: string } | null> {
  try {
    const resp = await request("it/parseQuestions", { text });
    if (resp?.status === "success" && resp.content) {
      const material = String(resp.content.material || "").trim();
      const questions = Array.isArray(resp.content.questions)
        ? resp.content.questions.map((item: any) => String(item)).filter(Boolean)
        : [];
      if (material || questions.length) {
        return {
          prompt: material,
          questions,
          source: String(resp.content.source || "unknown"),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}
