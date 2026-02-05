import { it_callEmbedding } from "../../infra/api/it_embedding";
import type { ItVectorSearchConfig } from "../notes/types";

export async function it_requestEmbeddings(
  cfg: ItVectorSearchConfig,
  texts: string[],
): Promise<number[][]> {
  return it_callEmbedding(cfg, texts);
}
