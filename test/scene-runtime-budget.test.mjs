import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCENE_RUNTIME_BUDGET,
  SCENE_RUNTIME_BUDGET_VERSION,
  WALL_CLOCK_BUDGET_METRICS,
  evaluateSceneRuntimeBudget,
} from "../tools/acceptance/scene-runtime-budget.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certification = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/foundation-certification-v1.json",
    ),
    "utf8",
  ),
);

const BUDGETED = Object.keys(SCENE_RUNTIME_BUDGET);

test("the isolated production package is inside every frozen budget", () => {
  const recorded = certification.foundation.productionBudget;
  assert.equal(recorded.version, SCENE_RUNTIME_BUDGET_VERSION);
  assert.deepEqual(
    recorded.checks.map((check) => check.metric).sort(),
    BUDGETED.slice().sort(),
    "the certification did not evaluate every declared budget",
  );
  assert.deepEqual(recorded.failures, [], "a declared budget is exceeded");

  // Measured from the isolated production package, which is the only measurement that
  // describes what ships: the development page can reach the Authored Reference.
  const isolation = certification.foundation.productionIsolation;
  assert.equal(isolation.externalRequests, 0);
  assert.equal(isolation.thirdPartyInputs, 0);
  for (const check of recorded.checks) {
    assert.equal(
      check.value,
      isolation[check.metric],
      `${check.metric} was budgeted against something other than the isolated run`,
    );
  }
});

test("every budget reports headroom, and none of it is marginal", () => {
  // "Inside the budget" and "inside the budget by one part in a thousand" are different
  // engineering positions, and the ticket asks for the second. A budget at less than five
  // per cent headroom is one accepted representation away from being a boundary result and
  // should be recorded as one rather than discovered later.
  for (const check of certification.foundation.productionBudget.checks) {
    assert.ok(
      Number.isFinite(check.headroomFraction),
      `${check.metric} reported no headroom`,
    );
    assert.ok(
      check.headroomFraction >= 0.05,
      `${check.metric} has only ${(check.headroomFraction * 100).toFixed(1)} per cent headroom ` +
        `at ${check.value} against ${check.maximum}`,
    );
  }
});

test("a budget violation fails, and a missing measurement is not headroom", () => {
  // The evaluator has to be able to say no. Every metric, one at a time, over budget.
  for (const metric of BUDGETED) {
    const measured = Object.fromEntries(
      BUDGETED.map((name) => [name, SCENE_RUNTIME_BUDGET[name] / 2]),
    );
    measured[metric] = SCENE_RUNTIME_BUDGET[metric] + 1;
    const result = evaluateSceneRuntimeBudget(measured);
    assert.equal(result.passed, false, `${metric} over budget was accepted`);
    assert.deepEqual(result.failures, [
      `${metric} ${SCENE_RUNTIME_BUDGET[metric] + 1} exceeds ${SCENE_RUNTIME_BUDGET[metric]}`,
    ]);
  }

  // Exactly on the budget passes; a budget is a ceiling, not a strict bound.
  const exact = evaluateSceneRuntimeBudget({ ...SCENE_RUNTIME_BUDGET });
  assert.equal(exact.passed, true);
  for (const check of exact.checks) assert.equal(check.headroomFraction, 0);

  // A missing measurement is a failure rather than free headroom. This is the gate
  // stack's own recurring lesson: a null read as a value is how a metric that should
  // fail passes instead.
  const absent = evaluateSceneRuntimeBudget({});
  assert.equal(absent.passed, false);
  assert.equal(absent.failures.length, BUDGETED.length);
  for (const check of absent.checks) {
    assert.equal(check.value, null);
    assert.equal(check.headroomFraction, null);
  }
  assert.equal(evaluateSceneRuntimeBudget(undefined).passed, false);
});

test("the wall-clock budget is declared as such and is the only one", () => {
  /**
   * `check:scene-parity-foundation` regenerates the certification report and compared it
   * byte for byte with the stored one, while the report carries `generationMs` — a
   * measurement of how long the machine took. Three consecutive runs against a stored
   * 538.5 produced 540.4, 524.5 and 529.5, so the check could never pass. It is now
   * excluded from the comparison and gated by this budget instead.
   *
   * The list is asserted rather than trusted, because excluding a field from a
   * byte-for-byte comparison is one keystroke from excluding a field that should be
   * compared.
   */
  assert.deepEqual(WALL_CLOCK_BUDGET_METRICS, ["generationMs"]);
  const recorded = certification.foundation.productionBudget.checks;
  const flagged = recorded.filter((check) => check.wallClock).map((check) => check.metric);
  assert.deepEqual(flagged, ["generationMs"]);
  // Everything else in the report is still compared exactly, which is what makes the
  // exclusion safe: counts, digests, thresholds, and gate results are all deterministic.
  assert.equal(certification.foundation.determinism.identical, true);
  assert.equal(typeof certification.foundation.determinism.sceneDigest, "string");
  for (const check of recorded) {
    if (check.wallClock) continue;
    assert.ok(
      Number.isInteger(check.value),
      `${check.metric} is gated for equality but is not an integer count`,
    );
  }
});
