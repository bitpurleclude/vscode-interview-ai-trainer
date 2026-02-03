import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { ItAnalyzeRequest } from "../../protocol/interviewTrainer";

export type ItRecordingHost = {
  recordingChild: import("child_process").ChildProcess | null;
  recordingTempDir: string | null;
  recordingStartAt: number | null;
  recordingExitInfo: {
    exitCode: number | null;
    exitSignal: string | null;
    stderr: string;
  } | null;
  detectedInput: string | null;
  availableInputs: string[] | null;
};

export async function it_findFfmpeg(): Promise<string | null> {
  const bundled = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
  if (bundled) {
    try {
      await fs.promises.access(bundled);
      return bundled;
    } catch {
      // ignore
    }
  }
  const envPath = process.env.IT_FFMPEG_PATH;
  if (envPath) {
    try {
      await fs.promises.access(envPath);
      return envPath;
    } catch {
      // ignore
    }
  }

  const candidates = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];
  for (const cmd of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, ["-version"], { windowsHide: true });
        child.on("error", (err) => reject(err));
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(String(code)));
        });
      });
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

export async function it_runFfmpegProbe(
  ffmpeg: string,
  args: string[],
): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
  return await new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    let exitCode: number | null = null;
    let exitSignal: string | null = null;
    child.on("close", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      resolve({ stderr, exitCode, exitSignal });
    });
    child.on("error", (err) => {
      resolve({
        stderr: err instanceof Error ? err.message : String(err),
        exitCode,
        exitSignal,
      });
    });
  });
}

export async function it_listInputs(
  host: ItRecordingHost,
  ffmpeg: string,
): Promise<string[]> {
  if (host.availableInputs) return host.availableInputs;
  if (process.platform === "win32") {
    const scan = await it_runFfmpegProbe(ffmpeg, [
      "-list_devices",
      "true",
      "-f",
      "dshow",
      "-i",
      "dummy",
    ]);
    const audioLines = scan.stderr
      .split(/\r?\n/)
      .filter((line) => line.includes("(audio)") && line.includes('"'));
    const parsed = audioLines
      .map((line) => {
        const match = line.match(/"([^"]+)"/);
        return match ? `audio=${match[1]}` : null;
      })
      .filter(Boolean) as string[];
    host.availableInputs = parsed;
    return parsed;
  }
  if (process.platform === "darwin") {
    const scan = await it_runFfmpegProbe(ffmpeg, [
      "-f",
      "avfoundation",
      "-list_devices",
      "true",
      "-i",
      '""',
    ]);
    const audioLines = scan.stderr
      .split(/\r?\n/)
      .filter((line) => /\[\d+\].*\(audio\)/.test(line));
    const parsed = audioLines
      .map((line) => {
        const match = line.match(/\[(\d+)\]\s+(.+?)\s+\(audio\)/);
        return match ? `:${match[1]}` : null;
      })
      .filter(Boolean) as string[];
    host.availableInputs = parsed;
    return parsed;
  }
  // Linux: 暂不枚举，直接使用默认
  host.availableInputs = [];
  return [];
}

export async function it_detectDefaultInput(
  host: ItRecordingHost,
  ffmpeg: string,
): Promise<string | null> {
  if (host.detectedInput) return host.detectedInput;
  const inputs = await it_listInputs(host, ffmpeg);
  if (inputs.length) {
    host.detectedInput = inputs[0];
    return host.detectedInput;
  }
  return null;
}

export async function it_startNativeRecording(
  host: ItRecordingHost,
  deviceOverride?: string,
): Promise<{
  tmpDir: string;
  tmpPath: string;
  startedAt: number;
}> {
  if (host.recordingChild) {
    throw new Error("recording already running");
  }
  const ffmpeg = await it_findFfmpeg();
  if (!ffmpeg) {
    throw new Error("未找到 ffmpeg，请先安装并配置环境变量或 IT_FFMPEG_PATH");
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "it-record-"));
  const tmpPath = path.join(tmpDir, "capture.pcm");
  const commonArgs = ["-y", "-ac", "1", "-ar", "16000", "-f", "s16le", tmpPath];
  let inputArgs: string[];
  const customInput = deviceOverride || process.env.IT_FFMPEG_INPUT;
  const detectedInput =
    customInput ||
    (await it_detectDefaultInput(host, ffmpeg)) ||
    (process.platform === "win32" ? null : undefined);
  if (process.platform === "win32") {
    const device = detectedInput || "audio=default";
    inputArgs = ["-f", "dshow", "-i", device.startsWith("audio=") ? device : `audio=${device}`];
  } else if (process.platform === "darwin") {
    const device = detectedInput || ":0";
    inputArgs = ["-f", "avfoundation", "-i", device];
  } else {
    inputArgs = ["-f", "pulse", "-i", detectedInput || "default"];
  }
  const args = [...inputArgs, ...commonArgs];
  const child = spawn(ffmpeg, args, { windowsHide: true });
  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += String(d);
  });
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  child.on("close", (code, signal) => {
    exitCode = code;
    exitSignal = signal;
    host.recordingExitInfo = { exitCode, exitSignal, stderr };
  });
  child.on("error", (err) => {
    host.recordingExitInfo = {
      exitCode: null,
      exitSignal: null,
      stderr: err instanceof Error ? err.message : String(err),
    };
  });
  host.recordingChild = child;
  host.recordingTempDir = tmpDir;
  host.recordingStartAt = Date.now();
  host.recordingExitInfo = null;

  // 若 ffmpeg 立即退出，短暂等待并提前报错。
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (exitCode !== null) {
    const detail = `ffmpeg 启动失败，退出码=${exitCode ?? "未知"}, 信号=${exitSignal ?? "无"}, stderr=${stderr.trim() || "无"}`;
    host.recordingChild = null;
    host.recordingTempDir = null;
    host.recordingStartAt = null;
    throw new Error(detail);
  }

  return {
    tmpDir,
    tmpPath,
    startedAt: host.recordingStartAt,
  };
}

export async function it_stopNativeRecording(
  host: ItRecordingHost,
): Promise<{
  audio: ItAnalyzeRequest["audio"];
  locked?: string[];
}> {
  const tmpRoot = host.recordingTempDir;
  const child = host.recordingChild;
  if (!tmpRoot) {
    throw new Error("录音尚未开始或已被终止，请重新开始录音");
  }
  const tmpPath = path.join(tmpRoot, "capture.pcm");
  host.recordingChild = null;
  let killed = false;
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let stderr = "";
  if (child) {
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    try {
      const exitPromise = new Promise<void>((resolve) => {
        child.on("close", (code, signal) => {
          exitCode = code;
          exitSignal = signal;
          resolve();
        });
      });
      if (child.stdin) {
        child.stdin.write("q\n");
      } else {
        child.kill("SIGTERM");
      }
      const completed = await Promise.race([
        exitPromise.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 3000),
        ),
      ]);
      if (!completed) {
        if (!child.killed) {
          child.kill("SIGTERM");
          killed = true;
        }
        await exitPromise;
      }
    } catch {
      // ignore
    }
  } else if (host.recordingExitInfo) {
    exitCode = host.recordingExitInfo.exitCode;
    exitSignal = host.recordingExitInfo.exitSignal;
    stderr = host.recordingExitInfo.stderr;
  }

  let exists = true;
  try {
    await fs.promises.access(tmpPath);
  } catch {
    exists = false;
  }
  if (!exists) {
    const detail =
      `ffmpeg 退出码=${exitCode ?? "未知"}, 信号=${exitSignal ?? "无"}, ` +
      `stderr=${stderr.trim() || "无"}`;
    throw new Error(
      `录音文件不存在${killed ? "（进程被强制结束）" : ""}，请检查麦克风设备或 ffmpeg 输入参数。${detail}`,
    );
  }
  const pcm = await fs.promises.readFile(tmpPath);
  const byteLength = pcm.byteLength;
  const durationSec = byteLength / (2 * 16000);

  // cleanup
  const locked: string[] = [];
  try {
    await fs.promises.rm(tmpRoot, {
      recursive: true,
      force: true,
      maxRetries: 2,
      retryDelay: 50,
    });
  } catch (error) {
    locked.push(
      `${tmpRoot}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  host.recordingTempDir = null;
  host.recordingStartAt = null;

  return {
    audio: {
      format: "pcm",
      sampleRate: 16000,
      byteLength,
      durationSec,
      base64: pcm.toString("base64"),
    },
    locked: locked.length ? locked : undefined,
  };
}
