import {
  it_parseQuestionsFromWebview,
  it_regenerateDemoAnswerFromWebview,
  type ItQuestionUseCaseContext,
} from "../../application/useCases/it_questionActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItQuestionHandlersPort } from "./it_webviewHandlerPorts";

function it_createQuestionUseCaseContext(host: ItQuestionHandlersPort): ItQuestionUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    resolveApiConfigWithProviders: (apiConfig) => host.resolveApiConfigWithProviders(apiConfig),
    logCorpusTrace: (message, detail) => {
      host.logCorpusTrace(message, detail);
    },
    isStreamingEnabled: () => host.configSnapshot?.streaming?.enabled !== false,
    emitEvaluationStreamUpdate: (update) => {
      host.webviewProtocol.send("it/evaluationStreamUpdate", update);
    },
  };
}

export function it_registerQuestionHandlers(host: ItQuestionHandlersPort): void {
  host.webviewProtocol.on("it/parseQuestions", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/parseQuestions",
        event: "interface.question.parse",
        payload: msg.data,
      },
      async () => {
        const result = await it_parseQuestionsFromWebview({
          context: it_createQuestionUseCaseContext(host),
          payload: msg.data,
        });
        host.configBundle = result.configBundle;
        return result.parsed;
      },
    ),
  );

  host.webviewProtocol.on("it/regenerateDemoAnswer", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/regenerateDemoAnswer",
        event: "interface.question.regenerate_demo_answer",
        payload: msg.data,
      },
      async () => {
        const result = await it_regenerateDemoAnswerFromWebview({
          context: it_createQuestionUseCaseContext(host),
          payload: msg.data,
        });
        host.configBundle = result.configBundle;
        return result.revised;
      },
    ),
  );
}
