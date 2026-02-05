const IT_DIMENSION_MAP: Record<string, string> = {
  content_structure: "内容完整性",
  logic_coherence: "逻辑清晰度",
  clarity_concision: "语言流畅度",
  etiquette_expression: "表达感染力",
  professionalism: "专业素养",
  policy_alignment: "政策理解",
};

const IT_DEFAULT_DIMENSIONS = [
  "内容完整性",
  "逻辑清晰度",
  "语言流畅度",
  "表达感染力",
  "专业素养",
  "政策理解",
];

function it_normalizeDimensions(dimensions: string[] | undefined): string[] {
  if (!Array.isArray(dimensions) || !dimensions.length) {
    return [...IT_DEFAULT_DIMENSIONS];
  }
  const mapped = dimensions.map((dim) => IT_DIMENSION_MAP[dim] || dim).filter(Boolean);
  const uniq = Array.from(new Set(mapped));
  return uniq.length ? uniq : [...IT_DEFAULT_DIMENSIONS];
}
function it_mapScoreKeys(scores: Record<string, number>): Record<string, number> {
  const mapped: Record<string, number> = {};
  Object.entries(scores || {}).forEach(([key, value]) => {
    const name = IT_DIMENSION_MAP[key] || key;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) {
      return;
    }
    mapped[name] = num;
  });
  return mapped;
}

function it_computeOverallScore(
  scores: Record<string, number>,
  dimensions: string[],
): number {
  const values = dimensions.map((dim) => scores[dim]).filter((v) => v !== undefined);
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
function it_isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function it_extractScoreData(parsed: any): {
  scores: Record<string, number>;
  overall?: number;
} {
  const scoreCandidates = [
    parsed?.scores,
    parsed?.dimensions,
    parsed?.各维度评分,
    parsed?.维度评分,
    parsed?.维度Scores,
    parsed?.维度,
    parsed?.评分?.维度,
    parsed?.评分?.维度评分,
    parsed?.评分?.维度分,
  ];
  let scoreBlock: Record<string, number> = {};
  for (const candidate of scoreCandidates) {
    if (it_isPlainObject(candidate)) {
      scoreBlock = candidate as Record<string, number>;
      break;
    }
  }
  const mappedScores = it_mapScoreKeys(scoreBlock);
  const values = Object.values(mappedScores).filter((v) => Number.isFinite(v));
  const averaged =
    values.length > 0
      ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
      : undefined;
  const overallRaw =
    parsed?.overallScore ??
    parsed?.overall ??
    parsed?.整体评分 ??
    parsed?.总分 ??
    parsed?.评分?.整体 ??
    parsed?.评分?.总分 ??
    parsed?.评分?.overall ??
    (typeof parsed?.评分 === "number" ? parsed.评分 : undefined);
  const overallFallback = Number.isFinite(Number(overallRaw))
    ? Number(overallRaw)
    : undefined;
  return {
    scores: mappedScores,
    overall: values.length ? averaged : overallFallback,
  };
}

export {
  it_normalizeDimensions,
  it_mapScoreKeys,
  it_computeOverallScore,
  it_extractScoreData,
};
