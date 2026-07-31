import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { sceneSignature } from "../tools/acceptance/scene-signature.mjs";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const observation = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/reference-observation-v1.json",
    ),
    "utf8",
  ),
);

const contract = createReferenceObservationContract();
const DECLARED_MOMENTS = [
  contract.clock.primaryMomentMs,
  ...contract.clock.dynamicMomentsMs,
];

/**
 * Generates the island with the clock pinned to `momentMs`, exactly as the Frozen
 * Observation Clock pins it in a browser observation.
 *
 * This is the check the static audit cannot make. The audit proves no generator module
 * *mentions* a clock; this proves the generated scene does not *depend* on one, which also
 * covers a clock reached indirectly — through a dependency, through `three`, or through
 * anything the regular expressions do not spell.
 *
 * Both checks were verified red before being trusted, by wiring a real
 * `performance.now()` read into the `mound` generator. That experiment found the check's
 * one real limit, and it is a property of the contract rather than a gap: a read that only
 * scales a form *uniformly* is invisible here, because `generateSceneObject` normalises
 * every local form's AABB onto the Target AABB Extent exactly, so such a read cannot
 * change the delivered scene either. Wired into the form's roughness instead — anything
 * that moves vertices relative to each other — both this check and the static audit fail.
 */
function generateAtMoment(momentMs) {
  const realPerformanceNow = performance.now;
  const realDateNow = Date.now;
  try {
    performance.now = () => momentMs;
    Date.now = () => 1_700_000_000_000 + momentMs;
    const generated = generateScene(ISLAND_SCENE_RECIPE);
    return {
      ...sceneSignature(generated),
      // The Environment Recipe's own dynamic parameters. The ocean is the one thing on
      // this island whose authored counterpart genuinely animates, so its phase is the
      // value most likely to be quietly read from a clock instead of declared.
      environment: JSON.stringify(generated.environment?.ocean ?? null),
      populationCount: generated.report?.populationCount ?? null,
    };
  } finally {
    performance.now = realPerformanceNow;
    Date.now = realDateNow;
  }
}

test("generation is identical at every declared observation moment", () => {
  assert.ok(DECLARED_MOMENTS.length >= 3, "fewer moments than the contract declares");
  const signatures = DECLARED_MOMENTS.map((momentMs) => ({
    momentMs,
    ...generateAtMoment(momentMs),
  }));
  const [first] = signatures;
  for (const signature of signatures.slice(1)) {
    assert.equal(
      signature.digest,
      first.digest,
      `generation at ${signature.momentMs} ms differs from ${first.momentMs} ms`,
    );
    assert.equal(signature.semanticIdCount, first.semanticIdCount);
    assert.equal(
      signature.environment,
      first.environment,
      `the ocean's parameters at ${signature.momentMs} ms differ from ${first.momentMs} ms`,
    );
    assert.equal(signature.populationCount, first.populationCount);
  }
  // And the fixture is worth something only if a moment change could have been visible:
  // the three declared moments are genuinely different values.
  assert.equal(new Set(DECLARED_MOMENTS).size, DECLARED_MOMENTS.length);
});

test("the ocean's phase is declared in the recipe rather than read from a clock", () => {
  /**
   * The Frozen Observation Clock pins `performance.now()` during every measurement, so a
   * generator that read it would look perfectly stable in every stored capture and then
   * animate in delivery, where nothing pins it. No rendered evidence in this repository
   * could see that, which is why the phase has to be a recipe value and why this asserts
   * it is one.
   */
  const phase = ISLAND_SCENE_RECIPE.environment?.ocean?.phase;
  assert.ok(
    Number.isFinite(phase),
    "the Environment Recipe carries no declared ocean phase",
  );
  // Pinning the clock somewhere absurd must not move it.
  const far = generateAtMoment(9_999_999);
  const near = generateAtMoment(0);
  assert.equal(far.environment, near.environment);
  assert.equal(far.digest, near.digest);
});

test("the reference's own state at each declared moment is within its declared changes", () => {
  /**
   * The reference side. The authored scene *does* animate, and the contract declares which
   * of its summaries may change between moments — transforms and dynamic state, nothing
   * else. A moment that changed geometry, materials, or lights would mean the reference is
   * not being observed at a repeatable moment at all, and every rendered measurement taken
   * through it would be unreproducible.
   */
  const captures = observation.dynamicCaptures ?? [];
  assert.deepEqual(
    captures.map((capture) => capture.momentMs),
    contract.clock.dynamicMomentsMs,
    "the observation did not visit every declared dynamic moment",
  );
  const worst = [];
  for (const capture of captures) {
    const transition = capture.stateTransition;
    assert.equal(
      transition.withinDeclaredChanges,
      true,
      `moment ${capture.momentMs} changed something the contract does not declare: ` +
        JSON.stringify(transition.changedSummaries),
    );
    for (const summary of transition.changedSummaries) {
      assert.ok(
        transition.allowedChanges.includes(summary),
        `moment ${capture.momentMs} changed ${summary}, which is not an allowed change`,
      );
    }
    assert.equal(typeof capture.dynamic.digest, "string");
    assert.equal(capture.dynamic.momentMs, capture.momentMs);
    worst.push({ momentMs: capture.momentMs, changed: transition.changedSummaries.length });
  }
  // Per-moment evidence with the worst moment retained, which is what the ticket asks for
  // and what every other layer in this stack does.
  worst.sort((left, right) => right.changed - left.changed);
  assert.ok(worst.length > 0);
  assert.ok(
    worst[0].changed <= 2,
    `moment ${worst[0].momentMs} is the worst and changed ${worst[0].changed} summaries`,
  );
});

test("the primary moment is the one every stored measurement was taken at", () => {
  // A dynamic moment that silently became the primary one would move every frozen
  // threshold at once, so the primary is asserted rather than assumed. The stored
  // observation records the clock it was taken under, and it has to be the live one.
  assert.deepEqual(observation.contract.clock, {
    kind: "Frozen Observation Clock",
    primaryMomentMs: contract.clock.primaryMomentMs,
    dynamicMomentsMs: contract.clock.dynamicMomentsMs,
    maximumDynamicMoments: contract.clock.maximumDynamicMoments,
  });
  assert.ok(
    !contract.clock.dynamicMomentsMs.includes(contract.clock.primaryMomentMs),
    "a declared dynamic moment is also the primary moment",
  );
  assert.ok(
    contract.clock.dynamicMomentsMs.length <= contract.clock.maximumDynamicMoments,
    "more dynamic moments than the contract permits",
  );
});

test("the reference renders each declared moment repeatably, not just the primary one", () => {
  /**
   * Ticket 13's last open item. The observation visits 16,000 and 24,000 ms and recorded
   * each moment's structural digests and state transition — but never whether the moment
   * *renders* the same thing twice, which is the entire point of pinning the clock. A
   * moment that drifted between runs would make every capture taken at it unreproducible
   * and nothing would have said so.
   *
   * The envelope is the contract's own declared reference repeatability, unchanged: mean
   * channel delta 0.15, standard-deviation delta 0.2, histogram L1 0.002, difference-hash
   * distance 4.
   */
  const repeatability = observation.repeatability;
  const declared = repeatability.declared.appearance;
  const rows = repeatability.dynamicAppearanceDeltas;
  assert.ok(Array.isArray(rows), "no per-moment appearance deltas were recorded");
  assert.deepEqual(
    rows.map((row) => row.momentMs),
    contract.clock.dynamicMomentsMs,
    "the per-moment evidence does not cover every declared dynamic moment",
  );

  for (const row of rows) {
    for (const [metric, limit] of Object.entries(declared)) {
      assert.ok(
        row.deltas[metric] <= limit,
        `moment ${row.momentMs} ms: ${metric} ${row.deltas[metric]} exceeds ${limit}`,
      );
    }
  }

  // The worst moment is retained, like every other layer's worst row.
  assert.ok(repeatability.worstDynamicMoment, "no worst dynamic moment was retained");
  assert.ok(
    rows.every(
      (row) =>
        row.deltas.maximumMeanChannelDelta <=
        repeatability.worstDynamicMoment.deltas.maximumMeanChannelDelta,
    ),
    "the retained worst moment is not the worst",
  );

  // And a dynamic moment is no less repeatable than the primary one, which is the
  // assumption every threshold in the stack rests on.
  assert.ok(
    repeatability.worstDynamicMoment.deltas.maximumMeanChannelDelta <
      declared.maximumMeanChannelDelta * 0.1,
    "a dynamic moment is close enough to the envelope to be worth investigating",
  );
});
