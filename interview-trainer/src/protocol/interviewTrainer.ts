export type ItWorkflowStep =
  | "init"
  | "recording"
  | "acoustic"
  | "asr"
  | "notes"
  | "evaluation"
  | "report"
  | "write";

export type ItStepStatus = "pending" | "running" | "success" | "error";

export type ItRecordingState = "idle" | "recording" | "paused";

export interface ItStepState {
  id: ItWorkflowStep;
  status: ItStepStatus;
  progress: number;
  message?: string;
  elapsedSec?: number;
}

export interface ItState {
  statusMessage: string;
  overallProgress: number;
  recordingState: ItRecordingState;
  steps: ItStepState[];
  lastError?: ItUserError;
}

export interface ItAudioPayload {
  format: "pcm" | "wav" | "m4a";
  sampleRate: number;
  byteLength: number;
  durationSec: number;
  base64: string;
}

export interface ItAnalyzeRequest {
  audio: ItAudioPayload;
  questionText?: string;
  questionList?: string[];
  sessionLabel?: string;
}

export interface ItAcousticMetrics {
  durationSec: number;
  speechDurationSec: number;
  speechRateWpm?: number;
  pauseCount: number;
  pauseAvgSec: number;
  pauseMaxSec: number;
  rmsDbMean: number;
  rmsDbStd: number;
  snrDb?: number;
}

export interface ItNoteHit {
  score: number;
  source: string;
  snippet: string;
}

export interface ItAudioSegment {
  type: "speech" | "silence";
  startSec: number;
  endSec: number;
  durationSec: number;
  text?: string;
  volumeDb?: number;
  volumeLabel?: string;
  volumeDeltaPct?: number;
  speechRateWpm?: number;
  pauseSec?: number;
  tone?: "升调" | "降调" | "平稳";
}

export interface ItQuestionTiming {
  question: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  note?: string;
}

export interface ItEvaluation {
  topicTitle: string;
  topicSummary: string;
  scores: Record<string, number>;
  overallScore: number;
  strengths: string[];
  issues: string[];
  improvements: string[];
  nextFocus: string[];
  revisedAnswers?: ItRevisedAnswer[];
  mode: "llm" | "heuristic";
  raw?: string;
  prompt?: string;
}

export interface ItRevisedAnswer {
  question: string;
  original: string;
  revised: string;
}

export interface ItAnalyzeResponse {
  transcript: string;
  detailedTranscript?: string;
  acoustic: ItAcousticMetrics;
  evaluation: ItEvaluation;
  notes: ItNoteHit[];
  audioSegments?: ItAudioSegment[];
  questionTimings?: ItQuestionTiming[];
  reportPath: string;
  topicDir: string;
  audioPath: string;
}

export interface ItHistoryItem {
  topicTitle: string;
  reportPath: string;
  topicDir: string;
  timestamp: string;
  overallScore?: number;
}

export interface ItConfigSnapshot {
  activeEnvironment: string;
  llmProvider: string;
  asrProvider: string;
  acousticProvider: string;
  sessionsDir: string;
}

export interface ItUserError {
  type: string;
  reason: string;
  solution: string;
}
