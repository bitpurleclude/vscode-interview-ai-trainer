import type {
  ItConfigSnapshot,
  ItQuestionEvaluation,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";

export type ItStepStreamUpdate = {
  step: ItWorkflowStep;
  text: string;
  done?: boolean;
  reset?: boolean;
};

export type ItEvaluationStreamUpdate = {
  questionIndex: number;
  text?: string;
  done?: boolean;
  reset?: boolean;
  snapshot?: ItQuestionEvaluation;
};

export type ItWebviewPort = {
  send(type: "it/configUpdate", data: ItConfigSnapshot): void;
  send(type: "it/stepStreamUpdate", data: ItStepStreamUpdate): void;
  send(type: "it/evaluationStreamUpdate", data: ItEvaluationStreamUpdate): void;
};
