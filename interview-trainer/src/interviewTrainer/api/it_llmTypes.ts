import type * as vscode from "vscode";
import type { ItApiTemplate } from "../../protocol/interviewTrainer";
import { ItQianfanConfig, ItQianfanMessage } from "./it_qianfan";

export type ItLlmProvider = "baidu_qianfan" | "volc_doubao" | "openai_compatible" | string;
export type ItLlmReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ItLlmConfig extends ItQianfanConfig {
  provider: ItLlmProvider;
  antiRepeat?: boolean;
  useResponses?: boolean;
  apiMode?: "chat" | "responses";
  responsesPath?: string;
  toolsPreset?: string;
  tools?: any[];
  include?: string[];
  store?: boolean;
  promptCacheKey?: string;
  webSearch?: boolean;
  reasoningEffort?: ItLlmReasoningEffort;
  maxOutputTokens?: number;
  reusePrefix?: boolean;
  stream?: boolean;
  template?: ItApiTemplate;
  templateEnv?: string;
  templateContext?: vscode.ExtensionContext;
  templateVars?: Record<string, unknown>;
  templateMaxRetries?: number;
}

export type ItLlmMessage = ItQianfanMessage;
export type ItLlmResponse = {
  text: string;
  responseId?: string;
  raw?: any;
};
