/**
 * The Production Runtime's frozen non-visual budgets for the whole island.
 *
 * Separate from `OBJECT_BUDGETS`, which are per Reconstruction Unit in Single Mesh Lab
 * and are two to three orders of magnitude smaller. This is the scene-level equivalent
 * and it is measured from the *isolated production package* — the certification's
 * temporary root with the Authored Reference, its data, and every development tool
 * absent — rather than from the development page, because a budget measured on a page
 * that can reach the reference is not a budget on what ships.
 *
 * Every value below is a declared requirement with a reason, not the current
 * measurement rounded up. Each reason names what the ceiling forbids, because a budget
 * that only says "a bit more than today" cannot be violated by anything except growth
 * and therefore does not constrain a design choice.
 *
 * `generationMs` is the reason this module exists at all. It is a wall-clock value, so
 * `run-foundation-certification.mjs --check` could never pass while it was inside a
 * byte-for-byte comparison of the report: three consecutive runs against a stored 538.5
 * produced 540.4, 524.5 and 529.5. A noisy measurement is exactly what a budget is for,
 * and exactly what an equality check is not for.
 */

export const SCENE_RUNTIME_BUDGET_VERSION = "scene-runtime-budget-v1";

export const SCENE_RUNTIME_BUDGET = Object.freeze({
  /**
   * One second of generation on the normative host. Generation reached 3.2 s earlier in
   * this milestone when vegetation canopies landed as layered blade geometry, and fell
   * back when the authored bamboo triangle allocation was matched. A one-second ceiling
   * forbids returning to multi-second generation while sitting comfortably above the
   * host's own run-to-run spread, which is tens of milliseconds on a measurement in the
   * hundreds.
   */
  generationMs: 1000,
  /**
   * 64 KiB gzip for the entire island, excluding Three.js. The Foundation certified at
   * 32,825 B across 11 production modules; two accepted representations have since been
   * added and it is 13 modules. The ceiling has to leave room for the tickets that are
   * still open — materials, lights, the remaining village forms — without leaving room
   * for a serialized asset, and 64 KiB is far too small for one: the authored scene's
   * geometry alone is 3.2 million triangles.
   */
  bundleGzipBytes: 64 * 1024,
  /**
   * 1,000,000 triangles, raised from 700,000.
   *
   * The original ceiling was set above the highest count the milestone had needed and an
   * order of magnitude below the authored scene's 3,211,043, so that a generator could not
   * buy silhouette agreement with unbounded tessellation. That principle is unchanged and
   * the new ceiling is still under a third of the authored count; what changed is that the
   * ceiling had started deciding the shape work rather than bounding it.
   *
   * The sizing fact: the sixteen horizon groups spend **8,316 triangles, 1.30 per cent of
   * the scene, while carrying 37.9 per cent of its surface residual** — and after the
   * ADR-0066 sampling repair 70 per cent of that residual is real shape error rather than
   * measurement noise, where it had been 20. Enlarging the ridge control budget is the
   * largest single lever left on the island and the old ceiling left 60,427 triangles for
   * it, which is not enough to try anything.
   *
   * 1,000,000 leaves 360,427 — room to give the mountains forty times the geometry they
   * have and still not reach it. If a change needs more than that, the case should be
   * measured and made rather than accommodated in advance.
   */
  triangles: 1_000_000,
  /**
   * 2,048 draw calls. The candidate drew 3,389 before canopies were merged into one
   * semantic part each, and 1,766 now. A power-of-two ceiling under the pre-merge figure
   * forbids returning to a mesh per blade, which is the specific regression this number
   * exists to prevent.
   */
  drawCalls: 2048,
  /**
   * 40 MiB of retained geometry: every generated attribute and index array, plus each
   * instanced mesh's own matrix and colour arrays, counted once per geometry. A
   * Code-only Production Runtime retains no texture, so geometry is what it holds. The
   * ceiling is set against the 678,000-triangle state, which would have retained about
   * 31 MiB, so it forbids that without forbidding the remaining work.
   */
  // Raised with the triangle ceiling and in the same proportion, because they measure the
  // same thing through different units and leaving this one behind would have made it the
  // binding constraint instead — 32,451,332 of 41,943,040 today, which the mountains would
  // pass through long before they reached a million triangles.
  geometryBytes: 60 * 1024 * 1024,
});

/** Which budgets are wall-clock and therefore may not be compared for equality. */
export const WALL_CLOCK_BUDGET_METRICS = Object.freeze(["generationMs"]);

/**
 * Evaluates one isolated production measurement against the frozen budgets.
 *
 * Reports headroom per metric rather than only pass or fail, because "inside the budget"
 * and "inside the budget by one part in a thousand" are different engineering positions
 * and the ticket asks for the second one.
 */
export function evaluateSceneRuntimeBudget(measured) {
  const checks = Object.entries(SCENE_RUNTIME_BUDGET).map(([metric, maximum]) => {
    const value = measured?.[metric];
    const finite = Number.isFinite(value);
    return {
      metric,
      value: finite ? value : null,
      maximum,
      // Null rather than a number when nothing was measured: a missing measurement is
      // not headroom, and the gate stack's own lesson is that a null read as a value is
      // how a metric that should fail passes.
      headroomFraction: finite ? Number((1 - value / maximum).toFixed(6)) : null,
      passed: finite && value <= maximum,
      wallClock: WALL_CLOCK_BUDGET_METRICS.includes(metric),
    };
  });
  const failures = checks
    .filter((check) => !check.passed)
    .map((check) =>
      check.value === null
        ? `${check.metric} was not measured`
        : `${check.metric} ${check.value} exceeds ${check.maximum}`,
    );
  return {
    version: SCENE_RUNTIME_BUDGET_VERSION,
    passed: failures.length === 0,
    checks,
    failures,
  };
}
