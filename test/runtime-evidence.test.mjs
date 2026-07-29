import assert from "node:assert/strict";
import test from "node:test";

import { generateObject } from "../gt_designer/src/reconstruction/core/object-generator.js";
import {
  generateProbe,
  PROBE_RECIPE,
} from "../gt_designer/src/reconstruction/testing/probe-generator.js";
import {
  benchmarkGeneration,
  benchmarkSequentialGeneration,
  canonicalRecipeEvidence,
  compareCrossEngineSignatures,
  crossEngineSignature,
  deterministicGenerationEvidence,
  recipeScalarEvidence,
} from "../tools/acceptance/runtime-evidence.mjs";

const makeProbe = () => generateObject(PROBE_RECIPE, generateProbe);

test("runtime evidence captures deterministic bytes and render budgets", () => {
  const result = deterministicGenerationEvidence(makeProbe, 3);
  assert.equal(result.byteStable, true);
  assert.equal(result.snapshot.drawCalls, 2);
  assert.equal(result.snapshot.runtimeTextureCount, 0);
  assert.ok(result.snapshot.geometryMemoryBytes > 0);
  assert.ok(result.snapshot.triangles > 0);
});

test("recipe evidence uses minified UTF-8 JSON and numeric leaves", () => {
  const evidence = canonicalRecipeEvidence(PROBE_RECIPE);
  assert.equal(evidence.serialized, JSON.stringify(PROBE_RECIPE));
  assert.equal(evidence.bytes, Buffer.byteLength(evidence.serialized));
  assert.equal(recipeScalarEvidence(PROBE_RECIPE).count, 11);
});

test("benchmark enforces the normative warmup and repetition floor", () => {
  assert.throws(
    () => benchmarkGeneration(makeProbe, { warmups: 9, repetitions: 100 }),
    /at least 10 warmups/,
  );
  const result = benchmarkGeneration(makeProbe);
  assert.equal(result.warmups, 10);
  assert.equal(result.repetitions, 100);
  assert.ok(result.p95Milliseconds >= 0);
});

test("sequential benchmark measures an ordered object set", () => {
  const result = benchmarkSequentialGeneration([makeProbe, makeProbe]);
  assert.equal(result.objectCount, 2);
  assert.equal(result.warmups, 10);
  assert.equal(result.repetitions, 100);
  assert.ok(result.p95Milliseconds >= 0);
});

test("cross-engine comparison ignores byte hashes but enforces structure and bounds", () => {
  const snapshot = deterministicGenerationEvidence(makeProbe).snapshot;
  const first = crossEngineSignature(snapshot);
  const second = structuredClone(first);
  second.bounds.max[0] += 0.000006;
  assert.equal(compareCrossEngineSignatures(first, second, 0.000007).passed, true);
  second.triangles += 1;
  assert.equal(compareCrossEngineSignatures(first, second, 0.000007).passed, false);
});
