import {
  it_testTemplateDryRun,
  it_testTemplateLive,
  type ItTemplateTestUseCaseContext,
} from "../../application/useCases/it_templateTestActions";
import type { ItTemplateTestHandlersPort } from "./it_webviewHandlerPorts";

function it_createTemplateTestUseCaseContext(
  host: ItTemplateTestHandlersPort,
): ItTemplateTestUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    configSnapshot: host.configSnapshot,
    emitTemplateTestDelta: ({ runId, delta, full }) => {
      host.webviewProtocol.send("it/templateTestDelta", {
        runId,
        delta,
        full,
      });
    },
  };
}

export function it_registerTemplateTestHandlers(host: ItTemplateTestHandlersPort): void {
  host.webviewProtocol.on("it/testTemplateDryRun", async (msg) =>
    it_testTemplateDryRun({
      context: it_createTemplateTestUseCaseContext(host),
      payload: msg.data,
    }),
  );

  host.webviewProtocol.on("it/testTemplateLive", async (msg) =>
    it_testTemplateLive({
      context: it_createTemplateTestUseCaseContext(host),
      payload: msg.data,
    }),
  );
}
