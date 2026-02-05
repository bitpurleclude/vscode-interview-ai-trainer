export interface ItSessionsConfig {
  sessionsDir: string;
  allowUnicode: boolean;
  maxSlugLen: number;
  similarityThreshold: number;
  centerSubdir?: string;
}

export interface ItTopicMeta {
  topicTitle: string;
  questionText: string;
  questionList: string[];
  questionHash: string;
  createdAt: string;
  updatedAt: string;
  overallScore?: number;
}