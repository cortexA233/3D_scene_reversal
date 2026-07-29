import assert from "node:assert/strict";
import test from "node:test";

import {
  auditSourceText,
  numericLiteralEvidence,
  objectSpecificLiteralEvidence,
} from "../tools/acceptance/static-audit.mjs";

test("numeric literal evidence ignores comments and strings", () => {
  const result = numericLiteralEvidence(`
    const width = 2.5;
    const hex = 0xff;
    const label = "contains 99";
    // 123 is documentation
    /* 456 is also documentation */
  `);
  assert.deepEqual(
    result.literals.map((entry) => entry.literal),
    ["2.5", "0xff"],
  );
});

test("object-specific literal evidence scans generated shader templates", () => {
  const result = objectSpecificLiteralEvidence(`
    for (let index = 0; index < values.length; index += 1) {
      shader += \`float branch = 0.18 * sin(x * 1.7);\`;
    }
    const radius = 0.032;
  `);
  assert.deepEqual(
    result.objectSpecific.map((entry) => entry.value),
    [0.18, 1.7, 0.032],
  );
  assert.deepEqual(result.universalValues, [0, 0.01, 0.5, 1, 2, 3, 4]);
});

test("static audit rejects authored, random, WASM, and dense payload patterns", () => {
  const dense = Array.from({ length: 129 }, (_, index) => index).join(",");
  const result = auditSourceText(`
    const source = "island.glb";
    const value = Math.random();
    const module = WebAssembly;
    const payload = [${dense},];
  `);
  assert.equal(result.passed, false);
  assert.deepEqual(
    new Set(result.failures.map((failure) => failure.rule)),
    new Set([
      "authored-model-extension",
      "ambient-randomness",
      "wasm-runtime",
      "oversized-inline-numeric-array",
    ]),
  );
});

test("static audit accepts compact procedural source", () => {
  const result = auditSourceText(`
    export function make(width, height) {
      return { width, height, radialSegments: 12 };
    }
  `);
  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});
