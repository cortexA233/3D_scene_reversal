import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { EXIT } from "../src/kernel/exit-codes.mjs";
import { findAssetDependencies } from "../src/audit/asset-freedom.mjs";
import { checkOperatorContract, listOperators, PROFILE_LATHE } from "../src/operators/library.mjs";
import {
  decideAndResumeUntilDone,
  meshReverse,
  readJson,
  readTextIfPresent,
  withTemporaryDirectory,
  writeFixture,
} from "../testing/harness.mjs";

/**
 * These assert on externally observable output only — emitted files, manifest and
 * evidence content, exit codes. Never on the chosen operator or on a fitted
 * parameter value: those are exactly what the pipeline is permitted to change as the
 * Operator Library grows, and a test that pinned them would fail every time the
 * library improved.
 */

function geometryHash(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part.semanticId);
    hash.update(Buffer.from(Float32Array.from(part.positions).buffer));
    hash.update(Buffer.from(Uint32Array.from(part.indices).buffer));
  }
  return hash.digest("hex");
}

async function loadEmitted(file, cacheBust = "") {
  return import(`${pathToFileURL(file).href}${cacheBust}`);
}

test("one profile-lathe Contract Operator is pure, deterministic, and scalar-counted", () => {
  const sample = {
    profile: [
      [0.9, 0],
      [1.1, 0.5],
      [0.6, 1.4],
    ],
    radialSegments: 12,
  };
  const conformance = checkOperatorContract(PROFILE_LATHE, sample);
  assert.equal(conformance.conformant, true, JSON.stringify(conformance.findings));
  assert.equal(conformance.determinism, true);
  assert.equal(conformance.declaredScalarCount, sample.profile.length * 2 + 1);

  assert.deepEqual(
    PROFILE_LATHE.parameterSignature.map((entry) => [entry.name, entry.kind]),
    [
      ["profile", "scalarPairArray"],
      ["radialSegments", "integer"],
    ],
  );
  assert.deepEqual(findAssetDependencies(PROFILE_LATHE.builderSource), []);
  // The library holds exactly one operator; it grows only under a recorded
  // coverage failure.
  assert.equal(listOperators().length, 1);
});

test("running on a generated fixture emits asset-free code with a tier from geometry evidence", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    // The one case that pays the complete twelve-view protocol, so the milestone is
    // measured under the real evaluation conditions rather than a cheap stage.
    const result = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--decider",
      "mock",
      "--inline",
      "--baseline-stage",
      "final",
    ]);
    assert.equal(result.code, EXIT.SUCCESS, result.stderr);

    for (const relative of [
      "runtime/recipe.js",
      "runtime/generator.js",
      "runtime/generator.inline.js",
      "evidence/structure-manifest.json",
      "evidence/evidence.json",
      "evidence/decision-trace.json",
    ]) {
      assert.notEqual(await readTextIfPresent(path.join(out, relative)), null, relative);
    }

    for (const relative of ["runtime/recipe.js", "runtime/generator.js"]) {
      assert.deepEqual(
        findAssetDependencies(await readTextIfPresent(path.join(out, relative))),
        [],
        relative,
      );
    }

    const evidence = await readJson(path.join(out, "evidence/evidence.json"));

    // The tier is earned from measured geometry, and appearance is recorded as not
    // evaluated rather than silently passing.
    assert.equal(evidence.quality.geometry.evaluated, true);
    assert.equal(typeof evidence.quality.geometry.baselineVersion, "string");
    assert.equal(typeof evidence.quality.geometry.aggregate.silhouette.meanIou, "number");
    assert.equal(evidence.quality.appearance.evaluated, false);
    assert.equal(evidence.quality.appearance.passed, null);
    assert.match(evidence.quality.appearance.reason, /shader/);
    assert.equal(evidence.quality.compactness.evaluated, true);

    assert.ok(
      ["accepted", "below-gate", "coarse"].includes(evidence.reconstructionTier),
      `emitting output means the tier is not rejected, got ${evidence.reconstructionTier}`,
    );
    assert.equal(evidence.emitted, true);
    assert.equal(
      evidence.reconstructionTier === "accepted",
      evidence.admittedToReferenceLayoutDelivery,
    );
    assert.ok(
      evidence.tierRationale.some((line) => /appearance: not evaluated/.test(line)),
      "an unevaluated axis must be named in the rationale",
    );
  });
});

test("the contract audit covers every declared constraint plus the scalar count", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    await meshReverse(["run", "--input", input, "--out", out, "--decider", "mock"]);
    const evidence = await readJson(path.join(out, "evidence/evidence.json"));

    const byId = new Map(
      evidence.contractAudit.constraints.map((constraint) => [constraint.id, constraint]),
    );
    for (const id of [
      "asset-dependency",
      "determinism",
      "executability",
      "global-complexity-ceiling",
      "object-specific-scalar-audit",
    ]) {
      assert.equal(byId.get(id)?.status, "pass", `${id}: ${byId.get(id)?.detail}`);
    }
    // A constraint this build cannot measure is not-applicable with a reason, never
    // a silent pass.
    const multiScale = byId.get("multi-scale-material-consistency");
    assert.equal(multiScale.status, "not-applicable");
    assert.ok(multiScale.detail.length > 0);

    const scalars = byId.get("object-specific-scalar-audit");
    assert.ok(scalars.measured.count > 0, "the audit must count something");
    assert.ok(scalars.measured.count <= scalars.measured.maximum);
    assert.match(scalars.measured.definition, /recipe leaves/);
    assert.ok(
      scalars.measured.sourceCount >= 0 && scalars.measured.recipeCount > 0,
      "the count covers the recipe and the operator source it carries",
    );
  });
});

test("the emitted code executes and produces identical geometry across two runs", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    await meshReverse(["run", "--input", input, "--out", out, "--decider", "mock"]);

    const generator = path.join(out, "runtime/generator.js");
    const first = await loadEmitted(generator);
    const second = await loadEmitted(generator, "?second=1");
    const a = geometryHash(first.buildParts());
    const b = geometryHash(second.buildParts());
    assert.equal(a, b, "two fresh module instances must produce identical geometry");
    assert.equal(geometryHash(first.buildParts()), a, "and so must two calls");
    assert.ok(first.buildParts().length > 0);
    assert.ok(first.buildParts()[0].indices.length % 3 === 0);
  });
});

test("the inline output is self-contained and matches the library-importing output", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--decider",
      "mock",
      "--inline",
    ]);

    const library = await loadEmitted(path.join(out, "runtime/generator.js"), "?mode=library");
    const inline = await loadEmitted(
      path.join(out, "runtime/generator.inline.js"),
      "?mode=inline",
    );
    assert.equal(
      geometryHash(inline.buildParts()),
      geometryHash(library.buildParts()),
      "inline geometry must match the library-importing output",
    );

    const inlineSource = await readTextIfPresent(path.join(out, "runtime/generator.inline.js"));
    assert.equal(
      /^\s*import\s/m.test(inlineSource),
      false,
      "a self-contained single file carries no import at all",
    );
    assert.deepEqual(
      findAssetDependencies(inlineSource, { allowRelativeImports: false }),
      [],
    );
  });
});

test("a contract-violating authored operator withholds emission with a classified diagnosis", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "two-component");
    const out = path.join(directory, "out");
    const result = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--decider",
      "mock",
      "--policy",
      "contract-violating-operator",
    ]);

    assert.equal(result.code, EXIT.EMISSION_WITHHELD);
    assert.notEqual(result.code, EXIT.SUCCESS);

    const evidence = await readJson(path.join(out, "evidence/evidence.json"));
    assert.equal(evidence.reconstructionTier, "rejected");
    assert.equal(evidence.emitted, false);
    assert.equal(evidence.failureClassification, "contract-violation");
    assert.equal(evidence.admittedToReferenceLayoutDelivery, false);
    assert.equal(
      evidence.contractAudit.constraints.find(
        (constraint) => constraint.id === "asset-dependency",
      ).status,
      "fail",
    );
    assert.ok(
      evidence.tierRationale.some((line) => /contract violation/.test(line)),
      "the diagnosis names the violated constraint",
    );

    // No runtime code survives a contract violation.
    assert.equal(await readTextIfPresent(path.join(out, "runtime/recipe.js")), null);
    assert.equal(await readTextIfPresent(path.join(out, "runtime/generator.js")), null);

    // Authoring unlocked only after a recorded coverage failure, and the
    // non-conformance is recorded rather than swallowed.
    const trace = await readJson(path.join(out, "evidence/decision-trace.json"));
    assert.deepEqual(
      trace.decisions.map((decision) => decision.decisionPoint),
      ["unit-division", "semantic-grouping", "structure-proposal", "operator-authoring"],
    );
    assert.ok(trace.operatorAuthoring.coverageFailure.failures.length > 0);
    assert.equal(trace.operatorAuthoring.admission.admitted, false);

    const manifest = await readJson(path.join(out, "evidence/structure-manifest.json"));
    assert.equal(manifest.authoredOperators.length, 1);
    assert.equal(manifest.authoredOperators[0].conformant, false);
    assert.ok(manifest.authoredOperators[0].findings.length > 0);
  });
});

test("the fitting loop is recorded with its bound, and the baseline froze before it", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    await meshReverse(["run", "--input", input, "--out", out, "--decider", "mock"]);
    const trace = await readJson(path.join(out, "evidence/decision-trace.json"));

    assert.equal(trace.baseline.calibratedBeforeFitting, true);
    assert.ok(trace.baseline.hardMetricCount + trace.baseline.diagnosticMetricCount === 8);

    const fits = Object.values(trace.fitting);
    assert.ok(fits.length > 0);
    for (const fit of fits) {
      assert.ok(fit.iterations > 0, "L1 refinement must have run");
      assert.ok(fit.iterations <= fit.iterationCap, "the iteration cap must hold");
      // L0 then L1 then a refinement pass then the full protocol.
      const stages = fit.trace.map((entry) => entry.stage);
      assert.equal(stages[0], "l0");
      assert.ok(stages.includes("l1-ring-pass"));
      assert.ok(stages.includes("l1-refine"));
      assert.equal(stages.at(-1), "final");
    }
  });
});

test("the artifact reproduces bit-for-bit from the frozen manifest", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      first,
      "--decider",
      "mock",
      "--inline",
    ]);

    const reemitted = await meshReverse([
      "emit",
      "--manifest",
      path.join(first, "evidence/structure-manifest.json"),
      "--input",
      input,
      "--out",
      second,
      "--inline",
    ]);
    assert.equal(reemitted.code, EXIT.SUCCESS, reemitted.stderr);
    for (const relative of [
      "runtime/recipe.js",
      "runtime/generator.js",
      "runtime/generator.inline.js",
    ]) {
      assert.equal(
        await readTextIfPresent(path.join(second, relative)),
        await readTextIfPresent(path.join(first, relative)),
        `${relative} must reproduce bit-for-bit from the manifest`,
      );
    }
  });
});

test("an external decider drives the whole pipeline to the same artifact", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const mock = path.join(directory, "mock");
    const external = path.join(directory, "external");

    await meshReverse(["run", "--input", input, "--out", mock, "--decider", "mock"]);
    assert.equal(
      (await meshReverse(["run", "--input", input, "--out", external])).code,
      EXIT.SUSPENDED_AT_DECISION_POINT,
    );
    const driven = await decideAndResumeUntilDone({ input, out: external });
    assert.equal(driven.code, EXIT.SUCCESS, driven.stderr);

    for (const relative of ["runtime/recipe.js", "runtime/generator.js"]) {
      assert.equal(
        await readTextIfPresent(path.join(external, relative)),
        await readTextIfPresent(path.join(mock, relative)),
        relative,
      );
    }
  });
});
