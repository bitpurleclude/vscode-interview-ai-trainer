import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerTemplateHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/saveTemplate", async (msg) => {
    const payload = msg.data || {};
    const template = payload.template;
    if (!template || !template.id) {
      throw new Error("missing template id");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.upsertTemplate(templatesConfig, env, template);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/deleteTemplate", async (msg) => {
    const templateId = String(msg.data?.templateId || "").trim();
    if (!templateId) {
      throw new Error("missing templateId");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.removeTemplate(templatesConfig, env, templateId);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateBindings", async (msg) => {
    const bindings = msg.data?.bindings || {};
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTemplateBindings(templatesConfig, env, bindings);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateParamOptions", async (msg) => {
    const options = msg.data?.options || {};
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTemplateParamOptions(
      templatesConfig,
      env,
      options,
    );
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateSecret", async (msg) => {
    const payload = msg.data || {};
    const name = String(payload.name || "").trim();
    if (!name) {
      throw new Error("missing secret name");
    }
    const hasValue = Object.prototype.hasOwnProperty.call(payload, "value");
    const value = hasValue ? String(payload.value ?? "") : "";
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const envConfig = templatesConfig.environments?.[env] || {};
    const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
    templatesConfig = host.configService.saveTemplateSecrets(templatesConfig, env, [
      ...existing,
      name,
    ]);
    host.configService.saveTemplatesConfig(templatesConfig);
    if (hasValue) {
      await host.context.secrets.store(
        `interviewTrainer.${env}.secret.${name}`,
        value,
      );
    }
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/deleteTemplateSecret", async (msg) => {
    const name = String(msg.data?.name || "").trim();
    if (!name) {
      throw new Error("missing secret name");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const envConfig = templatesConfig.environments?.[env] || {};
    const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
    const nextSecrets = existing.filter((item: string) => item !== name);
    templatesConfig = host.configService.saveTemplateSecrets(
      templatesConfig,
      env,
      nextSecrets,
    );
    host.configService.saveTemplatesConfig(templatesConfig);
    await host.context.secrets.delete(`interviewTrainer.${env}.secret.${name}`);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/refreshToken", async (msg) => {
    const name = String(msg.data?.name || "").trim();
    if (!name) {
      throw new Error("missing token name");
    }
    await host.tokenService.refreshTokenByName(name);
    return { ok: true };
  });

  host.webviewProtocol.on("it/refreshAllTokens", async () => {
    await host.tokenService.refreshAll();
    return { ok: true };
  });

  host.webviewProtocol.on("it/setTokenAutoRefresh", async (msg) => {
    const enabled = msg.data?.enabled !== false;
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTokenOptions(templatesConfig, env, {
      auto_refresh: Boolean(enabled),
    });
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
}
