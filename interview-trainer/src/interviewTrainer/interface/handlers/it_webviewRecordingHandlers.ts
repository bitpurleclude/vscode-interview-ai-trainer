import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerRecordingHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/startNativeRecording", async (msg) => {
    const device = msg.data?.device ? String(msg.data.device) : undefined;
    return await host.it_startNativeRecording(device);
  });
  host.webviewProtocol.on("it/stopNativeRecording", async () => {
    return await host.it_stopNativeRecording();
  });
  host.webviewProtocol.on("it/listNativeInputs", async (msg) => {
    if (msg?.data?.refresh) {
      host.availableInputs = null;
      host.detectedInput = null;
    }
    const ffmpeg = await host.it_findFfmpeg();
    if (!ffmpeg) {
      throw new Error("未找到 ffmpeg，无法列出输入设备");
    }
    const inputs = await host.it_listInputs(ffmpeg);
    return { inputs };
  });
  host.webviewProtocol.on("it/convertAudioToPcm", async (msg) => {
    const base64 = String(msg.data?.base64 || "");
    const ext = String(msg.data?.ext || "m4a").replace(/[^a-z0-9]/gi, "");
    if (!base64) {
      throw new Error("missing audio bytes");
    }

    const ffmpeg = await host.it_findFfmpeg();
    if (!ffmpeg) {
      throw new Error(
        "未检测到 ffmpeg：请安装 ffmpeg 或将音频先转为 WAV(16kHz 单声道) 后再导入。",
      );
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "it-audio-"));
    const inPath = path.join(tmpDir, `input.${ext || "m4a"}`);
    const outPath = path.join(tmpDir, "output.pcm");
    await fs.promises.writeFile(inPath, Buffer.from(base64, "base64"));

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-i",
        inPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        outPath,
      ];
      const child = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = "";
      child.stderr.on("data", (d: Buffer | string) => {
        stderr += String(d);
      });
      child.on("error", (err: Error) => reject(err));
      child.on("close", (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg 转换失败: ${stderr || `code=${code}`}`));
          return;
        }
        fs.promises
          .access(outPath)
          .then(() => resolve())
          .catch(() => reject(new Error("ffmpeg 转换失败：未生成输出文件")));
      });
    });

    const pcm = await fs.promises.readFile(outPath);
    const byteLength = pcm.byteLength;
    const durationSec = byteLength / (2 * 16000);

    // cleanup best-effort
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}

    return {
      base64: pcm.toString("base64"),
      byteLength,
      durationSec,
    };
  });
}
