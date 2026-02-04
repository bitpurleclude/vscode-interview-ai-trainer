import type { ItTemplateRuntime } from "../../api/it_templateExecutor";
import { it_executeTemplate } from "../../api/it_templateExecutor";

export async function it_requestAsrTemplate(
  runtime: ItTemplateRuntime,
  variables: Record<string, unknown>,
  options: { maxRetries: number; timeoutSec: number },
): Promise<string> {
  const result = await it_executeTemplate({
    runtime,
    variables,
    maxRetries: options.maxRetries,
    timeoutSec: options.timeoutSec,
    stream: false,
  });
  if (typeof result.text === "string") {
    return result.text;
  }
  if (typeof result.value === "string") {
    return result.value;
  }
  return "";
}
