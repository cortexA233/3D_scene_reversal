/**
 * Development-only: how many crest controls the authored skyline demands.
 *
 * The evidence behind ADR-0052. A Horizon Group's skyline is controlled by its
 * crest nodes — between two of them the silhouette is whatever the form
 * interpolates — so the best any such representation can do at a given node
 * count is bounded by the optimal piecewise-linear approximation of that group's
 * own measured profile. Exact by dynamic programming over segment boundaries,
 * with no optimizer and no geometry in the loop, so the result is a property of
 * the control budget rather than of any particular fitter.
 *
 * Reads only the frozen reference evidence and the frozen baseline. Writes
 * nothing.
 *
 *   node tools/development/measure-horizon-form-budget.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NODE_COUNTS = [4, 6, 8, 12, 16, 24];

const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

/** Worst deviation of the chord from the samples it spans. */
function chordError(values, from, to) {
  if (to <= from + 1) return 0;
  const start = values[from];
  const end = values[to];
  let worst = 0;
  for (let at = from + 1; at < to; at += 1) {
    const along = (at - from) / (to - from);
    const error = Math.abs(start + (end - start) * along - values[at]);
    if (error > worst) worst = error;
  }
  return worst;
}

/** Minimax piecewise-linear fit of `values` using `segments` segments. */
export function bestPiecewise(values, segments) {
  const count = values.length;
  const cost = Array.from({ length: count }, () => new Float64Array(count).fill(Infinity));
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) cost[from][to] = chordError(values, from, to);
  }
  let best = new Float64Array(count).fill(Infinity);
  best[0] = 0;
  for (let to = 1; to < count; to += 1) best[to] = cost[0][to];
  for (let segment = 2; segment <= segments; segment += 1) {
    const next = new Float64Array(count).fill(Infinity);
    next[0] = 0;
    for (let to = 1; to < count; to += 1) {
      for (let split = 0; split < to; split += 1) {
        const value = Math.max(best[split], cost[split][to]);
        if (value < next[to]) next[to] = value;
      }
    }
    best = next;
  }
  return best[count - 1];
}

export async function measureHorizonFormBudget() {
  const [reference, baseline] = await Promise.all([
    readJson(".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json"),
    readJson("tools/acceptance/baselines/scene-quality-baseline-v1.json"),
  ]);
  const threshold = baseline.layers.worldGeometry.find(
    (metric) => metric.name === "worst azimuth horizon error",
  ).threshold;

  const groups = [];
  for (const group of reference.groups) {
    const covered = group.profile.filter((value) => value !== null);
    if (covered.length < 4) continue;
    groups.push({
      name: group.path.split("/").pop(),
      bins: covered.length,
      atNodeCount: Object.fromEntries(
        NODE_COUNTS.map((nodes) => [nodes, bestPiecewise(covered, nodes - 1)]),
      ),
    });
  }
  return {
    threshold,
    nodeCounts: NODE_COUNTS,
    groups,
    worstByNodeCount: Object.fromEntries(
      NODE_COUNTS.map((nodes) => [
        nodes,
        Math.max(...groups.map((group) => group.atNodeCount[nodes])),
      ]),
    ),
  };
}

async function main() {
  const result = await measureHorizonFormBudget();
  const degrees = (radians) => ((radians * 180) / Math.PI).toFixed(3);

  process.stdout.write(
    `group                          bins  best worst-bin error at N crest nodes (deg)\n` +
      `                                    ${result.nodeCounts.map((n) => String(n).padStart(6)).join(" ")}\n`,
  );
  for (const group of result.groups) {
    process.stdout.write(
      `${group.name.padEnd(30)} ${String(group.bins).padStart(4)} ` +
        `${result.nodeCounts.map((n) => degrees(group.atNodeCount[n]).padStart(6)).join(" ")}\n`,
    );
  }
  for (const nodes of result.nodeCounts) {
    const worst = result.worstByNodeCount[nodes];
    process.stdout.write(
      `${String(nodes).padStart(2)} nodes: worst group needs ${degrees(worst)} deg against ` +
        `${degrees(result.threshold)} deg -> ${worst <= result.threshold ? "reachable" : "NOT reachable"}\n`,
    );
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
