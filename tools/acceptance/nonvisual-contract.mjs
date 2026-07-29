export const NONVISUAL_REPORT_SCHEMA_VERSION =
  "single-mesh-nonvisual-acceptance-v1";

export const OBJECT_BUDGETS = Object.freeze({
  probe: Object.freeze({
    fixture: true,
    scalars: 32,
    recipeBytes: 1024,
    bundleGzipBytes: 5120,
    triangles: 128,
    drawCalls: 2,
    geometryMemoryBytes: 24 * 1024,
    warmGenerationP95Milliseconds: 5,
  }),
  "stone-path": Object.freeze({
    scalars: 48,
    recipeBytes: 1024,
    bundleGzipBytes: 4096,
    triangles: 96,
    drawCalls: 1,
    geometryMemoryBytes: 5 * 1024,
    warmGenerationP95Milliseconds: 5,
  }),
  stone: Object.freeze({
    scalars: 32,
    recipeBytes: 1024,
    bundleGzipBytes: 4096,
    triangles: 320,
    drawCalls: 1,
    geometryMemoryBytes: 24 * 1024,
    warmGenerationP95Milliseconds: 5,
  }),
  vase: Object.freeze({
    scalars: 48,
    recipeBytes: 1024,
    bundleGzipBytes: 5120,
    triangles: 1100,
    drawCalls: 1,
    geometryMemoryBytes: 40 * 1024,
    warmGenerationP95Milliseconds: 5,
  }),
  umbrella: Object.freeze({
    scalars: 96,
    recipeBytes: 2048,
    bundleGzipBytes: 10 * 1024,
    triangles: 5760,
    drawCalls: 2,
    geometryMemoryBytes: 256 * 1024,
    warmGenerationP95Milliseconds: 12,
  }),
});

export function evaluateObjectBudgets({
  objectId,
  sourceScalarCount,
  runtime,
  bundleGzipBytes,
}) {
  const budget = OBJECT_BUDGETS[objectId];
  if (!budget) throw new Error(`No nonvisual budget for ${objectId}`);
  const actual = {
    scalars: sourceScalarCount,
    recipeBytes: runtime.recipe.bytes,
    bundleGzipBytes,
    triangles: runtime.deterministic.snapshot.triangles,
    drawCalls: runtime.deterministic.snapshot.drawCalls,
    geometryMemoryBytes: runtime.deterministic.snapshot.geometryMemoryBytes,
    warmGenerationP95Milliseconds: runtime.benchmark.p95Milliseconds,
  };
  const checks = Object.entries(actual).map(([metric, value]) => ({
    metric,
    value,
    maximum: budget[metric],
    passed: Number.isFinite(value) && value <= budget[metric],
  }));
  checks.push({
    metric: "deterministicCpuBytes",
    value: runtime.deterministic.byteStable,
    expected: true,
    passed: runtime.deterministic.byteStable === true,
  });
  checks.push({
    metric: "runtimeTextureCount",
    value: runtime.deterministic.snapshot.runtimeTextureCount,
    maximum: 0,
    passed: runtime.deterministic.snapshot.runtimeTextureCount === 0,
  });
  const failures = checks.filter((check) => !check.passed);
  return {
    objectId,
    passed: failures.length === 0,
    budget,
    actual,
    checks,
    failures,
  };
}
