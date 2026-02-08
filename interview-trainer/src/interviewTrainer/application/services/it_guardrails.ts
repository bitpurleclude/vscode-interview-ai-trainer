import type { ItConfigBundle, ItGuardrailsConfig } from "./it_configGateway";

export type ItNumericRange = {
  min: number;
  max: number;
};

export type ItRetrievalGuardrails = {
  topK: ItNumericRange;
  maxConcurrency: ItNumericRange;
  embeddingMaxConcurrency: ItNumericRange;
  warmupConcurrency: ItNumericRange;
  minScore: ItNumericRange;
  vectorBatchSize: ItNumericRange;
  vectorQueryMaxChars: ItNumericRange;
  queryWindowSize: ItNumericRange;
  questionMaxConcurrency: ItNumericRange;
  kindMaxConcurrency: ItNumericRange;
  defaults: {
    queryWindowSize: number;
    questionMaxConcurrency: number;
    kindMaxConcurrency: number;
  };
  embeddingRequestSplitThreshold: number;
};

export type ItLoggingGuardrails = {
  limits: {
    messageMaxChars: number;
    detailMaxChars: number;
    detailMaxDepth: number;
    detailMaxKeysPerObject: number;
    detailMaxItemsPerArray: number;
  };
  policy: {
    emitErrorWhenTraceDisabled: boolean;
  };
};

const IT_RETRIEVAL_GUARDRAILS_DEFAULTS: ItRetrievalGuardrails = {
  topK: { min: 1, max: 50 },
  maxConcurrency: { min: 1, max: 1024 },
  embeddingMaxConcurrency: { min: 1, max: 256 },
  warmupConcurrency: { min: 1, max: 256 },
  minScore: { min: 0, max: 1 },
  vectorBatchSize: { min: 1, max: 256 },
  vectorQueryMaxChars: { min: 64, max: 4000 },
  queryWindowSize: { min: 1, max: 64 },
  questionMaxConcurrency: { min: 1, max: 16 },
  kindMaxConcurrency: { min: 1, max: 4 },
  defaults: {
    queryWindowSize: 8,
    questionMaxConcurrency: 3,
    kindMaxConcurrency: 2,
  },
  embeddingRequestSplitThreshold: 64,
};

const IT_LOGGING_GUARDRAILS_DEFAULTS: ItLoggingGuardrails = {
  limits: {
    messageMaxChars: 4000,
    detailMaxChars: 12000,
    detailMaxDepth: 6,
    detailMaxKeysPerObject: 128,
    detailMaxItemsPerArray: 64,
  },
  policy: {
    emitErrorWhenTraceDisabled: true,
  },
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function it_toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function it_normalizeRange(raw: unknown, fallback: ItNumericRange): ItNumericRange {
  const record = it_asRecord(raw);
  const min = it_toNumber(record.min, fallback.min);
  const max = it_toNumber(record.max, fallback.max);
  if (max < min) {
    return {
      min,
      max: min,
    };
  }
  return { min, max };
}

export function it_clampInteger(
  value: unknown,
  fallback: number,
  range: ItNumericRange,
): number {
  const parsed = Math.floor(it_toNumber(value, fallback));
  return Math.floor(Math.min(range.max, Math.max(range.min, parsed)));
}

export function it_clampFloat(
  value: unknown,
  fallback: number,
  range: ItNumericRange,
): number {
  const parsed = it_toNumber(value, fallback);
  return Math.min(range.max, Math.max(range.min, parsed));
}

export function it_getRetrievalGuardrailsFromConfig(
  guardrailsConfig: ItGuardrailsConfig | undefined,
): ItRetrievalGuardrails {
  const guardrails = it_asRecord(guardrailsConfig);
  const retrieval = it_asRecord(guardrails.retrieval);
  const limits = it_asRecord(retrieval.limits);
  const defaults = it_asRecord(retrieval.defaults);

  const vectorBatchSize = it_normalizeRange(
    limits.vector_batch_size,
    IT_RETRIEVAL_GUARDRAILS_DEFAULTS.vectorBatchSize,
  );

  const queryWindowSize = it_normalizeRange(
    limits.query_window_size,
    IT_RETRIEVAL_GUARDRAILS_DEFAULTS.queryWindowSize,
  );

  const questionMaxConcurrency = it_normalizeRange(
    limits.question_max_concurrency,
    IT_RETRIEVAL_GUARDRAILS_DEFAULTS.questionMaxConcurrency,
  );

  const kindMaxConcurrency = it_normalizeRange(
    limits.kind_max_concurrency,
    IT_RETRIEVAL_GUARDRAILS_DEFAULTS.kindMaxConcurrency,
  );

  const splitThreshold = Math.floor(
    it_clampInteger(
      retrieval.embedding_request_split_threshold,
      IT_RETRIEVAL_GUARDRAILS_DEFAULTS.embeddingRequestSplitThreshold,
      {
        min: 1,
        max: vectorBatchSize.max,
      },
    ),
  );

  return {
    topK: it_normalizeRange(limits.top_k, IT_RETRIEVAL_GUARDRAILS_DEFAULTS.topK),
    maxConcurrency: it_normalizeRange(
      limits.max_concurrency,
      IT_RETRIEVAL_GUARDRAILS_DEFAULTS.maxConcurrency,
    ),
    embeddingMaxConcurrency: it_normalizeRange(
      limits.embedding_max_concurrency,
      IT_RETRIEVAL_GUARDRAILS_DEFAULTS.embeddingMaxConcurrency,
    ),
    warmupConcurrency: it_normalizeRange(
      limits.warmup_concurrency,
      IT_RETRIEVAL_GUARDRAILS_DEFAULTS.warmupConcurrency,
    ),
    minScore: it_normalizeRange(limits.min_score, IT_RETRIEVAL_GUARDRAILS_DEFAULTS.minScore),
    vectorBatchSize,
    vectorQueryMaxChars: it_normalizeRange(
      limits.vector_query_max_chars,
      IT_RETRIEVAL_GUARDRAILS_DEFAULTS.vectorQueryMaxChars,
    ),
    queryWindowSize,
    questionMaxConcurrency,
    kindMaxConcurrency,
    defaults: {
      queryWindowSize: it_clampInteger(
        defaults.query_window_size,
        IT_RETRIEVAL_GUARDRAILS_DEFAULTS.defaults.queryWindowSize,
        queryWindowSize,
      ),
      questionMaxConcurrency: it_clampInteger(
        defaults.question_max_concurrency,
        IT_RETRIEVAL_GUARDRAILS_DEFAULTS.defaults.questionMaxConcurrency,
        questionMaxConcurrency,
      ),
      kindMaxConcurrency: it_clampInteger(
        defaults.kind_max_concurrency,
        IT_RETRIEVAL_GUARDRAILS_DEFAULTS.defaults.kindMaxConcurrency,
        kindMaxConcurrency,
      ),
    },
    embeddingRequestSplitThreshold: splitThreshold,
  };
}

export function it_getLoggingGuardrailsFromConfig(
  guardrailsConfig: ItGuardrailsConfig | undefined,
): ItLoggingGuardrails {
  const guardrails = it_asRecord(guardrailsConfig);
  const logging = it_asRecord(guardrails.logging);
  const limits = it_asRecord(logging.limits);
  const policy = it_asRecord(logging.policy);

  return {
    limits: {
      messageMaxChars: it_clampInteger(
        limits.message_max_chars,
        IT_LOGGING_GUARDRAILS_DEFAULTS.limits.messageMaxChars,
        { min: 128, max: 100_000 },
      ),
      detailMaxChars: it_clampInteger(
        limits.detail_max_chars,
        IT_LOGGING_GUARDRAILS_DEFAULTS.limits.detailMaxChars,
        { min: 256, max: 200_000 },
      ),
      detailMaxDepth: it_clampInteger(
        limits.detail_max_depth,
        IT_LOGGING_GUARDRAILS_DEFAULTS.limits.detailMaxDepth,
        { min: 1, max: 16 },
      ),
      detailMaxKeysPerObject: it_clampInteger(
        limits.detail_max_keys_per_object,
        IT_LOGGING_GUARDRAILS_DEFAULTS.limits.detailMaxKeysPerObject,
        { min: 4, max: 1024 },
      ),
      detailMaxItemsPerArray: it_clampInteger(
        limits.detail_max_items_per_array,
        IT_LOGGING_GUARDRAILS_DEFAULTS.limits.detailMaxItemsPerArray,
        { min: 4, max: 2048 },
      ),
    },
    policy: {
      emitErrorWhenTraceDisabled: it_toBoolean(
        policy.emit_error_when_trace_disabled,
        IT_LOGGING_GUARDRAILS_DEFAULTS.policy.emitErrorWhenTraceDisabled,
      ),
    },
  };
}

export function it_getRetrievalGuardrails(
  configBundle: Pick<ItConfigBundle, "guardrails">,
): ItRetrievalGuardrails {
  return it_getRetrievalGuardrailsFromConfig(configBundle.guardrails);
}

export function it_getLoggingGuardrails(
  configBundle: Pick<ItConfigBundle, "guardrails">,
): ItLoggingGuardrails {
  return it_getLoggingGuardrailsFromConfig(configBundle.guardrails);
}
