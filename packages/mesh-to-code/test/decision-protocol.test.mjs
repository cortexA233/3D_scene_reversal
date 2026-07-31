import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { writeFile } from "node:fs/promises";

import { EXIT } from "../src/kernel/exit-codes.mjs";
import { artifactPaths } from "../src/kernel/paths.mjs";
import {
  meshReverse,
  readJson,
  readTextIfPresent,
  withTemporaryDirectory,
  writeFixture,
} from "../testing/harness.mjs";

const ARTIFACT_FILES = [
  "runtime/recipe.js",
  "runtime/generator.js",
  "evidence/structure-manifest.json",
  "evidence/evidence.json",
];

test("a mock run emits a recipe, a generator, a manifest, and tiered evidence", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    const result = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--decider",
      "mock",
    ]);
    assert.equal(result.code, EXIT.SUCCESS, result.stderr);

    for (const relative of ARTIFACT_FILES) {
      assert.notEqual(
        await readTextIfPresent(path.join(out, relative)),
        null,
        `${relative} should exist`,
      );
    }

    const evidence = await readJson(path.join(out, "evidence/evidence.json"));
    assert.equal(evidence.productionUse, "prohibited");
    assert.match(evidence.artifactRole, /^development-only/);
    assert.ok(
      ["accepted", "below-gate", "coarse", "rejected"].includes(
        evidence.reconstructionTier,
      ),
      `unexpected tier ${evidence.reconstructionTier}`,
    );
    assert.equal(
      evidence.admittedToReferenceLayoutDelivery,
      evidence.reconstructionTier === "accepted",
      "only an accepted unit is admitted to the Reference-layout Delivery",
    );
  });
});

test("a suspension publishes numeric evidence, a response schema, and optional imagery", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "two-component");
    const out = path.join(directory, "out");
    const result = await meshReverse(["run", "--input", input, "--out", out]);

    assert.equal(result.code, EXIT.SUSPENDED_AT_DECISION_POINT);
    assert.notEqual(result.code, EXIT.SUCCESS);
    assert.notEqual(result.code, EXIT.ERROR);

    const pending = await readJson(artifactPaths(out).pendingDecision);
    assert.equal(pending.productionUse, "prohibited");
    assert.equal(typeof pending.question, "string");
    assert.ok(pending.question.length > 0);

    assert.ok(Array.isArray(pending.imagery), "imagery is an optional array field");
    assert.equal(pending.imagery.length, 0, "imagery is not required to answer");

    assert.equal(typeof pending.evidence.componentCount, "number");
    assert.equal(typeof pending.evidence.separationRatio, "number");
    assert.ok(Array.isArray(pending.evidence.components));
    for (const component of pending.evidence.components) {
      assert.equal(typeof component.triangleCount, "number");
      assert.equal(typeof component.surfaceArea, "number");
      assert.equal(component.bounds.min.length, 3);
      assert.ok(component.bounds.min.every((value) => Number.isFinite(value)));
    }

    assert.equal(pending.responseSchema.type, "object");
    assert.ok(pending.responseSchema.required.includes("units"));
    assert.equal(pending.responseSchemaRef, "schemas/response.unit-division.schema.json");
  });
});

test("a written decision resumes to the same artifact as an uninterrupted mock run", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const uninterrupted = path.join(directory, "uninterrupted");
    const suspended = path.join(directory, "suspended");

    assert.equal(
      (
        await meshReverse([
          "run",
          "--input",
          input,
          "--out",
          uninterrupted,
          "--decider",
          "mock",
          "--inline",
        ])
      ).code,
      EXIT.SUCCESS,
    );

    assert.equal(
      (await meshReverse(["run", "--input", input, "--out", suspended, "--inline"])).code,
      EXIT.SUSPENDED_AT_DECISION_POINT,
    );
    assert.equal((await meshReverse(["decide", "--out", suspended])).code, EXIT.SUCCESS);
    assert.equal(
      (
        await meshReverse([
          "run",
          "--input",
          input,
          "--out",
          suspended,
          "--resume",
          "--inline",
        ])
      ).code,
      EXIT.SUCCESS,
    );

    for (const relative of [...ARTIFACT_FILES, "runtime/generator.inline.js"]) {
      assert.equal(
        await readTextIfPresent(path.join(suspended, relative)),
        await readTextIfPresent(path.join(uninterrupted, relative)),
        `${relative} should match the uninterrupted run byte for byte`,
      );
    }
  });
});

test("a schema-invalid decision is rejected without advancing the loop", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    const paths = artifactPaths(out);

    assert.equal(
      (await meshReverse(["run", "--input", input, "--out", out])).code,
      EXIT.SUSPENDED_AT_DECISION_POINT,
    );
    const pendingBefore = await readTextIfPresent(paths.pendingDecision);
    const stateBefore = await readTextIfPresent(paths.runState);

    await writeFile(
      paths.decision,
      JSON.stringify({
        schemaVersion: "mesh-to-code-decision-v1",
        runId: JSON.parse(pendingBefore).runId,
        round: 0,
        decisionPoint: "unit-division",
        response: { units: [{ unitId: "Not A Slug", components: "everything" }] },
        decider: { kind: "deliberately-invalid" },
      }),
    );

    const rejected = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--resume",
    ]);
    assert.equal(rejected.code, EXIT.DECISION_SCHEMA_INVALID);
    assert.notEqual(rejected.code, EXIT.SUCCESS);

    assert.equal(
      await readTextIfPresent(paths.pendingDecision),
      pendingBefore,
      "the pending decision is unchanged, so the loop did not advance",
    );
    assert.equal(
      await readTextIfPresent(paths.runState),
      stateBefore,
      "the recorded decision trace is unchanged",
    );
    assert.equal(
      await readTextIfPresent(paths.recipe),
      null,
      "no runtime code is emitted while a decision is outstanding",
    );
  });
});

test("an envelope that answers a different Decision Point is rejected", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    const paths = artifactPaths(out);
    await meshReverse(["run", "--input", input, "--out", out]);
    const pending = await readJson(paths.pendingDecision);

    await writeFile(
      paths.decision,
      JSON.stringify({
        schemaVersion: "mesh-to-code-decision-v1",
        runId: pending.runId,
        round: 0,
        decisionPoint: "structure-proposal",
        response: { candidates: [] },
        decider: { kind: "wrong-decision-point" },
      }),
    );

    const rejected = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--resume",
    ]);
    assert.equal(rejected.code, EXIT.DECISION_SCHEMA_INVALID);
  });
});
