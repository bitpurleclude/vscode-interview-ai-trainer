import type {
  ItAcousticMetrics,
  ItAudioSegment,
  ItAnalyzeRequest,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../../protocol/interviewTrainer";
import type { ItTemplateRuntime } from "../../../infra/api/it_templateExecutor";
import {
  it_summarizeAudioMetrics,
  it_buildDetailedTranscript,
} from "../../../infra/utils/it_audio";
import { it_transcribeAudio } from "../../services/it_asrTranscription";
import type { ItAnalyzeDeps } from "./flow_types";

type AudioStageInput = {
  deps: ItAnalyzeDeps;
  request: ItAnalyzeRequest;
  asrCfg: Record<string, any>;
  asrRuntime: ItTemplateRuntime;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
};

export type AudioStageResult = {
  transcript: string;
  acoustic: ItAcousticMetrics;
  detailedTranscript?: string;
  audioSegments?: ItAudioSegment[];
};

export async function it_runAudioStage({
  deps,
  request,
  asrCfg,
  asrRuntime,
  reportProgress,
}: AudioStageInput): Promise<AudioStageResult> {
  const transcript = await it_transcribeAudio(
    request,
    asrCfg,
    asrRuntime,
    reportProgress,
    deps.onCorpusTrace,
  );
  if (deps.abortSignal?.aborted) {
    throw new Error("分析已停止");
  }
  deps.onPartial?.({ transcript });

  reportProgress("acoustic", 20, "声学分析 20% · 本地", "running");
  const acoustic: ItAcousticMetrics =
    request.audio.format === "pcm"
      ? it_summarizeAudioMetrics(
          request.audio.base64,
          request.audio.sampleRate,
          transcript,
        )
      : {
          durationSec: request.audio.durationSec || 0,
          speechDurationSec: request.audio.durationSec || 0,
          speechRateWpm: undefined,
          pauseCount: 0,
          pauseAvgSec: 0,
          pauseMaxSec: 0,
          rmsDbMean: 0,
          rmsDbStd: 0,
          snrDb: undefined,
        };
  reportProgress("acoustic", 100, "声学分析 100% · 本地", "success");
  deps.onPartial?.({ acoustic });

  let detailedTranscript: string | undefined = undefined;
  let audioSegments: ItAudioSegment[] | undefined = undefined;
  if (request.audio.format === "pcm") {
    const detailed = it_buildDetailedTranscript(
      request.audio.base64,
      request.audio.sampleRate,
      transcript,
    );
    detailedTranscript = detailed.detailedTranscript;
    audioSegments = detailed.segments;
    if (detailedTranscript) {
      deps.onPartial?.({ detailedTranscript });
    }
  }

  return { transcript, acoustic, detailedTranscript, audioSegments };
}
