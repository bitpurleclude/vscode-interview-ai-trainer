type ItHandlerLogPort = {
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
};

function it_safeLog(
  host: ItHandlerLogPort,
  message: string,
  detail?: Record<string, unknown>,
): void {
  try {
    host.logCorpusTrace(message, detail);
  } catch {
    // ignore logging failures to avoid interrupting handler requests
  }
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_payloadSummary(payload: unknown): Record<string, unknown> {
  if (payload === undefined) {
    return { kind: "undefined" };
  }
  if (payload === null) {
    return { kind: "null" };
  }
  if (typeof payload === "string") {
    return { kind: "string", length: payload.length };
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return { kind: typeof payload, value: payload };
  }
  if (Array.isArray(payload)) {
    return { kind: "array", length: payload.length };
  }
  if (typeof payload === "object") {
    const keys = Object.keys(payload as Record<string, unknown>);
    return {
      kind: "object",
      keys: keys.slice(0, 12),
      keyCount: keys.length,
    };
  }
  return { kind: typeof payload };
}

export async function it_runLoggedHandler<T>(
  host: ItHandlerLogPort,
  options: {
    request: string;
    event: string;
    payload?: unknown;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  it_safeLog(host, `${options.request} request`, {
    event: options.event,
    status: "request",
    payload: it_payloadSummary(options.payload),
  });

  try {
    const value = await run();
    it_safeLog(host, `${options.request} success`, {
      event: options.event,
      status: "success",
    });
    return value;
  } catch (error) {
    it_safeLog(host, `${options.request} error`, {
      event: options.event,
      status: "error",
      error: it_errorMessage(error),
    });
    throw error;
  }
}
