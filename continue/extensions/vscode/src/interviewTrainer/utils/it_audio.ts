import { ItAcousticMetrics } from "core/protocol/interviewTrainer";

const EPS = 1e-12;

export function it_decodePcm16(base64: string): Int16Array {
  const buffer = Buffer.from(base64, "base64");
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
}

export function it_int16ToFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = samples[i] / 32768;
  }
  return out;
}

function it_countWords(text: string): number {
  if (!text) {
    return 0;
  }
  const chinese = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const alnum = text.match(/[A-Za-z0-9]+/g) ?? [];
  return chinese.length + alnum.length;
}

function it_computeRmsDb(
  samples: Float32Array,
  frameSize: number,
  hopSize: number,
): Float32Array {
  if (!samples.length) {
    return new Float32Array([0]);
  }
  const count = Math.max(1, Math.floor((samples.length - frameSize) / hopSize) + 1);
  const rmsDb = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const start = i * hopSize;
    let sum = 0;
    for (let j = 0; j < frameSize; j += 1) {
      const val = samples[start + j] ?? 0;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / frameSize + EPS);
    rmsDb[i] = 20 * Math.log10(rms + 1e-6);
  }
  return rmsDb;
}

function it_deriveSpeechSegments(
  rmsDb: Float32Array,
  hopSec: number,
  thresholdDb: number,
  minSilenceSec: number,
  minSpeechSec: number,
): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  let start: number | null = null;
  for (let idx = 0; idx < rmsDb.length; idx += 1) {
    const active = rmsDb[idx] > thresholdDb;
    const timePos = idx * hopSec;
    if (active && start === null) {
      start = timePos;
    } else if (!active && start !== null) {
      const end = timePos;
      if (end - start >= minSpeechSec) {
        segments.push([start, end]);
      }
      start = null;
    }
  }
  if (start !== null) {
    const end = rmsDb.length * hopSec;
    if (end - start >= minSpeechSec) {
      segments.push([start, end]);
    }
  }

  const merged: Array<[number, number]> = [];
  for (const seg of segments) {
    if (!merged.length) {
      merged.push(seg);
      continue;
    }
    const prev = merged[merged.length - 1];
    const gap = seg[0] - prev[1];
    if (gap <= minSilenceSec) {
      prev[1] = seg[1];
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

export function it_summarizeAudioMetrics(
  pcmBase64: string,
  sampleRate: number,
  transcript: string,
): ItAcousticMetrics {
  const pcm = it_decodePcm16(pcmBase64);
  const samples = it_int16ToFloat(pcm);
  const durationSec = samples.length / sampleRate;
  const frameLengthSec = 0.03;
  const hopLengthSec = 0.01;
  const frameSize = Math.max(1, Math.floor(sampleRate * frameLengthSec));
  const hopSize = Math.max(1, Math.floor(sampleRate * hopLengthSec));

  const rmsDb = it_computeRmsDb(samples, frameSize, hopSize);
  const sorted = Array.from(rmsDb).sort((a, b) => a - b);
  const thresholdDb = sorted[Math.floor(sorted.length * 0.25)] + 6;

  const speechSegments = it_deriveSpeechSegments(
    rmsDb,
    hopLengthSec,
    thresholdDb,
    0.6,
    0.3,
  );
  const speechDurationSec = speechSegments.reduce(
    (total, seg) => total + (seg[1] - seg[0]),
    0,
  );

  const pauses: number[] = [];
  for (let i = 1; i < speechSegments.length; i += 1) {
    const pause = speechSegments[i][0] - speechSegments[i - 1][1];
    if (pause > 0) {
      pauses.push(pause);
    }
  }

  const rmsMean =
    rmsDb.length > 0
      ? rmsDb.reduce((sum, val) => sum + val, 0) / rmsDb.length
      : 0;
  const rmsStd =
    rmsDb.length > 0
      ? Math.sqrt(
          rmsDb.reduce((sum, val) => sum + (val - rmsMean) ** 2, 0) / rmsDb.length,
        )
      : 0;

  const speechRateWpm =
    transcript && speechDurationSec > 0
      ? (it_countWords(transcript) / (speechDurationSec / 60))
      : undefined;

  let snrDb: number | undefined = undefined;
  if (rmsDb.length) {
    const silence = rmsDb.filter((val) => val <= thresholdDb);
    if (silence.length) {
      const speechMedian = rmsDb[Math.floor(rmsDb.length / 2)];
      const silenceMedian = silence.sort((a, b) => a - b)[
        Math.floor(silence.length / 2)
      ];
      snrDb = speechMedian - silenceMedian;
    }
  }

  return {
    durationSec,
    speechDurationSec,
    speechRateWpm: speechRateWpm ? Number(speechRateWpm.toFixed(2)) : undefined,
    pauseCount: pauses.length,
    pauseAvgSec: pauses.length
      ? Number((pauses.reduce((sum, v) => sum + v, 0) / pauses.length).toFixed(2))
      : 0,
    pauseMaxSec: pauses.length ? Number(Math.max(...pauses).toFixed(2)) : 0,
    rmsDbMean: Number(rmsMean.toFixed(2)),
    rmsDbStd: Number(rmsStd.toFixed(2)),
    snrDb: snrDb !== undefined ? Number(snrDb.toFixed(2)) : undefined,
  };
}
