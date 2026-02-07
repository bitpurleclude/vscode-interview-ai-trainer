import { it_extractTokenInfo } from "../../application/services/it_tokens";
import {
  it_executeTemplate,
  it_renderTemplateRequest,
  it_resolveTemplateById,
} from "../../application/services/it_templateGateway";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";
import {
  it_buildTemplateTestDefaults,
  it_buildTemplateTestVariables,
  it_maskHeaders,
} from "./it_webviewTestHelpers";

export function it_registerTemplateTestHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testTemplateDryRun", async (msg) => {
    const payload = msg.data || {};
    const templateId = String(payload.templateId || "").trim();
    if (!templateId) {
      throw new Error("缺少模板 ID");
    }
    host.configBundle = host.configService.loadBundle();
    const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const environment =
      payload.environment ||
      host.configBundle.api?.active?.environment ||
      "prod";
    const template = it_resolveTemplateById(templatesConfig, environment, templateId);
    if (!template) {
      throw new Error("模板不存在或未加载");
    }
    const runtime = { template, environment, context: host.context };
    const defaults = it_buildTemplateTestDefaults(host, template);
    const variables = it_buildTemplateTestVariables(payload, defaults);
    const requestPreview = await it_renderTemplateRequest({
      runtime,
      variables,
      maskSecrets: true,
    });
    return {
      request: {
        ...requestPreview,
        headers: it_maskHeaders(requestPreview.headers),
      },
      missing: requestPreview.missing,
    };
  });

  host.webviewProtocol.on("it/testTemplateLive", async (msg) => {
    const payload = msg.data || {};
    const templateId = String(payload.templateId || "").trim();
    if (!templateId) {
      throw new Error("缺少模板 ID");
    }
    host.configBundle = host.configService.loadBundle();
    const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const environment =
      payload.environment ||
      host.configBundle.api?.active?.environment ||
      "prod";
    const template = it_resolveTemplateById(templatesConfig, environment, templateId);
    if (!template) {
      throw new Error("模板不存在或未加载");
    }
    const runtime = { template, environment, context: host.context };
    const defaults = it_buildTemplateTestDefaults(host, template);
    const variables = it_buildTemplateTestVariables(payload, defaults);
    const preview = await it_renderTemplateRequest({ runtime, variables });
    if (preview.missing.length) {
      throw new Error(`模板变量缺失: ${preview.missing.join(", ")}`);
    }
    const runId = String(payload.runId || "");
    const result = await it_executeTemplate({
      runtime,
      variables,
      onDelta: (delta, full) => {
        host.webviewProtocol.send("it/templateTestDelta", {
          runId,
          delta,
          full,
        });
      },
    });
    const tokenInfo =
      template.category === "token" ? it_extractTokenInfo(template, result) : undefined;
    return {
      runId,
      result,
      tokenInfo,
    };
  });
}