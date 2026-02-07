import {
  it_parseQuestionsFromWebview,
  it_regenerateDemoAnswerFromWebview,
  type ItQuestionUseCaseContext,
} from "../../application/useCases/it_questionActions";
import type { ItQuestionHandlersPort } from "./it_webviewHandlerPorts";

function it_createQuestionUseCaseContext(host: ItQuestionHandlersPort): ItQuestionUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    resolveApiConfigWithProviders: host.resolveApiConfigWithProviders,
    logCorpusTrace: host.logCorpusTrace,
    isStreamingEnabled: () => host.configSnapshot?.streaming?.enabled !== false,
    emitEvaluationStreamUpdate: (update) => {
      host.webviewProtocol.send("it/evaluationStreamUpdate", update);
    },
  };
}

export function it_registerQuestionHandlers(host: ItQuestionHandlersPort): void {
  host.webviewProtocol.on("it/parseQuestions", async (msg) => {
    const result = await it_parseQuestionsFromWebview({
      context: it_createQuestionUseCaseContext(host),
      payload: msg.data,
    });
    host.configBundle = result.configBundle;
    return result.parsed;
  });

  host.webviewProtocol.on("it/regenerateDemoAnswer", async (msg) => {
    const result = await it_regenerateDemoAnswerFromWebview({
      context: it_createQuestionUseCaseContext(host),
      payload: msg.data,
    });
    host.configBundle = result.configBundle;
    return result.revised;
  });
}
