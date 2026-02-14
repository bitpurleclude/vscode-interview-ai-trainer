import {
  it_testTemplateDryRun,
  it_testTemplateLive,
  type ItTemplateTestUseCaseContext,
} from "../../application/useCases/it_templateTestActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
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
    logTrace: (message, detail) => {
      host.logCorpusTrace(message, detail);
    },
  };
}

export function it_registerTemplateTestHandlers(host: ItTemplateTestHandlersPort): void {
  host.webviewProtocol.on("it/testTemplateDryRun", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/testTemplateDryRun",
        event: "interface.template_test.dry_run",
        payload: msg.data,
      },
      () =>
        it_testTemplateDryRun({
          context: it_createTemplateTestUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/testTemplateLive", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/testTemplateLive",
        event: "interface.template_test.live",
        payload: msg.data,
      },
      () =>
        it_testTemplateLive({
          context: it_createTemplateTestUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );
}
