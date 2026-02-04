export async function decodeToPcm16(
  arrayBuffer: ArrayBuffer,
  targetRate: number,
): Promise<{ pcm: Int16Array; durationSec: number; sampleRate: number }> {
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decoded.getChannelData(0);
    const sourceRate = decoded.sampleRate;
    const ratio = sourceRate / targetRate;
    const length = Math.floor(channelData.length / ratio);
    const resampled = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(channelData.length - 1, left + 1);
      const interp = pos - left;
      resampled[i] =
        channelData[left] * (1 - interp) + channelData[right] * interp;
    }
    const pcm = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i += 1) {
      pcm[i] = Math.max(-1, Math.min(1, resampled[i])) * 32767;
    }
    return {
      pcm,
      durationSec: resampled.length / targetRate,
      sampleRate: targetRate,
    };
  } finally {
    void audioCtx.close();
  }
}

export function pcmToBase64(pcm: Int16Array): string {
  const buffer = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return bytesToBase64(buffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
