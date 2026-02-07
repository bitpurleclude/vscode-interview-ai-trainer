import path from "path";
import * as vscode from "vscode";
import { it_getUserProviderDir } from "../../application/services/it_infraBridge";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerProviderHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/createProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
      throw new Error("providerId 只能包含字母、数字、_、-");
    }
    host.configBundle = host.configService.loadBundle();
    if (host.configBundle.providers?.[providerId]) {
      throw new Error("Provider 已存在");
    }
    const displayName = String(msg.data?.displayName || "").trim();
    const payload = {
      provider: providerId,
      display_name: displayName || providerId,
      llm: {
        provider: providerId,
        base_url: "",
        model: "",
        api_key: "",
        temperature: 0.8,
        top_p: 0.8,
        timeout_sec: 60,
        max_retries: 1,
      },
      embedding: {
        provider: providerId,
        base_url: "",
        model: "",
        api_key: "",
        timeout_sec: 30,
        max_retries: 1,
      },
      asr: {
        provider: "",
        base_url: "",
        api_key: "",
        secret_key: "",
        language: "zh",
        dev_pid: 1537,
        timeout_sec: 120,
        max_retries: 1,
      },
    };
    host.configService.saveProviderConfig(providerId, payload);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId) {
      throw new Error("missing providerId");
    }
    const incoming = msg.data?.profile || {};
    host.configBundle = host.configService.loadBundle();
    const existing = host.configBundle.providers?.[providerId] || { provider: providerId };
    const next = {
      ...existing,
      ...incoming,
      provider: providerId,
      llm: {
        ...(existing.llm || {}),
        ...(incoming.llm || {}),
      },
      embedding: {
        ...(existing.embedding || {}),
        ...(incoming.embedding || {}),
      },
      asr: {
        ...(existing.asr || {}),
        ...(incoming.asr || {}),
      },
    };
    host.configService.saveProviderConfig(providerId, next);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/openProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId) {
      return;
    }
    const providerDir = it_getUserProviderDir(host.context);
    const target = path.join(providerDir, `${providerId}.yaml`);
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
  });
}
