export interface ItCorpusItem {
  kind: string;
  source: string;
  text: string;
}

export interface ItNoteHit {
  score: number;
  source: string;
  snippet: string;
}
