import { it_callEmbedding } from "../api/it_embedding";
import type { ItVectorSearchConfig } from "../../domain/notes/types";

export async function it_requestEmbeddings(
  cfg: ItVectorSearchConfig,
  texts: string[],
): Promise<number[][]> {
  return it_callEmbedding(cfg, texts);
}
