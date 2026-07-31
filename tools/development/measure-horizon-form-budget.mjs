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
 * With `--families` it measures the resolution ADR-0052 declared and nobody had tested:
 * cluster the sixteen groups by measured shape, fit **one shared crest table per family**,
 * and report the worst member's error. That is a different number from the per-group bound,
 * because a shared table has to serve every member of its family.
 *
 *   node tools/development/measure-horizon-form-budget.mjs
 *   node tools/development/measure-horizon-form-budget.mjs --families
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NODE_COUNTS = [4, 6, 8, 12, 16, 24, 32, 40, 48, 64];

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

/**
 * Resamples a covered profile onto `count` points of its own normalised span, and splits
 * the shape from its scale.
 *
 * A Horizon Group's profile is an elevation per azimuth bin over whatever azimuth that
 * group happens to subtend — 33 bins for the narrowest and 127 for the widest. Comparing
 * them as shapes needs a common parameterisation, and separating shape from scale is what
 * makes a *shared* table possible at all: if the members of a family differ only in how
 * tall and how wide they are, one table plus two scalars per group describes all of them.
 */
export function normaliseProfile(values, count = 64) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low;
  const shape = new Float64Array(count);
  for (let at = 0; at < count; at += 1) {
    const position = (at / (count - 1)) * (values.length - 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, left + 1);
    const blend = position - left;
    const value = values[left] + (values[right] - values[left]) * blend;
    shape[at] = range > 0 ? (value - low) / range : 0;
  }
  return { shape, offset: low, range };
}

/** Distance between two normalised shapes, taking the better of the two orientations. */
export function shapeDistance(left, right) {
  let forward = 0;
  let mirrored = 0;
  for (let at = 0; at < left.length; at += 1) {
    forward = Math.max(forward, Math.abs(left[at] - right[at]));
    mirrored = Math.max(mirrored, Math.abs(left[at] - right[right.length - 1 - at]));
  }
  return { distance: Math.min(forward, mirrored), mirrored: mirrored < forward };
}

/**
 * Clusters shapes into `families` groups by k-medoids over that distance.
 *
 * Medoids rather than means, and a deterministic seeding — the farthest-first traversal —
 * because a family index that depends on iteration order is not a measurement. ADR-0052 is
 * explicit that the family must come from measured shape and never from the source mesh
 * identity, so nothing here reads a name.
 */
export function clusterShapes(shapes, families) {
  const size = shapes.length;
  const distance = Array.from({ length: size }, (_, row) =>
    Float64Array.from({ length: size }, (_, column) =>
      row === column ? 0 : shapeDistance(shapes[row], shapes[column]).distance,
    ),
  );
  // Farthest-first seeding: start from the pair that are least alike.
  let medoids = [0];
  for (let seeded = 1; seeded < families; seeded += 1) {
    let best = -1;
    let bestDistance = -1;
    for (let candidate = 0; candidate < size; candidate += 1) {
      if (medoids.includes(candidate)) continue;
      const nearest = Math.min(...medoids.map((medoid) => distance[candidate][medoid]));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    medoids.push(best);
  }
  let assignment = new Array(size).fill(0);
  for (let pass = 0; pass < 32; pass += 1) {
    const next = shapes.map((_, index) => {
      let best = 0;
      for (let slot = 1; slot < medoids.length; slot += 1) {
        if (distance[index][medoids[slot]] < distance[index][medoids[best]]) best = slot;
      }
      return best;
    });
    const settled = next.every((value, index) => value === assignment[index]);
    assignment = next;
    const moved = medoids.map((medoid, slot) => {
      const members = assignment.map((value, index) => (value === slot ? index : -1)).filter((v) => v >= 0);
      if (members.length === 0) return medoid;
      let best = members[0];
      let bestCost = Infinity;
      for (const candidate of members) {
        const cost = Math.max(...members.map((member) => distance[candidate][member]));
        if (cost < bestCost) {
          bestCost = cost;
          best = candidate;
        }
      }
      return best;
    });
    const stable = moved.every((value, slot) => value === medoids[slot]);
    medoids = moved;
    if (settled && stable) break;
  }
  return { assignment, medoids, distance };
}

/**
 * The best one *shared* piecewise-linear table for a family, and its worst member's error.
 *
 * This is the number ADR-0052's declared resolution path stands or falls on, and it is not
 * the per-group bound: a shared table has to serve every member, so the segment cost is the
 * worst member's deviation rather than one group's. Each member's own scale maps the
 * normalised deviation back to degrees, which is why the members' ranges are carried in.
 */
export function bestSharedPiecewise(members, segments) {
  const count = members[0].shape.length;
  const cost = Array.from({ length: count }, () => new Float64Array(count).fill(0));
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      let worst = 0;
      for (const member of members) {
        const start = member.shape[from];
        const end = member.shape[to];
        for (let at = from + 1; at < to; at += 1) {
          const along = (at - from) / (to - from);
          const error = Math.abs(start + (end - start) * along - member.shape[at]) * member.range;
          if (error > worst) worst = error;
        }
      }
      cost[from][to] = worst;
    }
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

/**
 * The shared-family resolution, measured.
 *
 * ADR-0052 recorded the skyline gate as unreachable and named the way through: the sixteen
 * groups are instances of three authored meshes, so three shared crest tables would be a
 * fraction of the numbers sixteen per-group tables cost. It also insisted the families be
 * derived by clustering **measured shape**, never from the source mesh identity — which is
 * why nothing here reads a name, and why the clustering recovering families of 3, 7 and 6
 * against the stated 6/7/3 source split is a result rather than an input.
 *
 * The conclusion changes with the node count, and that is the part ADR-0052 could not see
 * from eight forms. Per group the bound crosses the threshold between 24 nodes (0.952) and
 * 32 (0.516) — but 32 nodes per group is 96 numbers against a compactness guard of 60, so
 * per-group tables cannot take it. Shared tables can: three families at 32 nodes reach
 * 0.930 for 9.0 numbers per group, and at 40 nodes 0.680 for 10.5.
 */
export async function measureHorizonFamilyBudget({ families = [2, 3, 4], nodes = [16, 24, 32, 40, 48] } = {}) {
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
    groups.push({ bins: covered.length, covered, ...normaliseProfile(covered, 64) });
  }

  const rows = [];
  for (const familyCount of families) {
    const { assignment } = clusterShapes(
      groups.map((group) => group.shape),
      familyCount,
    );
    const sizes = [];
    for (let slot = 0; slot < familyCount; slot += 1) {
      sizes.push(assignment.filter((value) => value === slot).length);
    }
    for (const nodeCount of nodes) {
      const perFamily = [];
      for (let slot = 0; slot < familyCount; slot += 1) {
        const members = groups.filter((_, index) => assignment[index] === slot);
        if (members.length === 0) continue;
        perFamily.push(bestSharedPiecewise(members, nodeCount - 1));
      }
      const worst = Math.max(...perFamily);
      rows.push({
        families: familyCount,
        sizes,
        nodes: nodeCount,
        perFamily,
        worst,
        reachable: worst <= threshold,
        // One shared table is `nodes` normalised elevations; each group adds a family
        // index, an offset and a range on top of the placement it already carries.
        numbersPerGroup: (familyCount * nodeCount + groups.length * 3) / groups.length,
      });
    }
  }
  return { threshold, groups: groups.length, rows };
}

async function mainFamilies() {
  const result = await measureHorizonFamilyBudget();
  const degrees = (radians) => ((radians * 180) / Math.PI).toFixed(3);
  process.stdout.write(
    `${result.groups} groups, threshold ${degrees(result.threshold)} deg

` +
      `families  sizes        nodes    worst  reach  numbers/group
`,
  );
  for (const row of result.rows) {
    process.stdout.write(
      `${String(row.families).padStart(8)}  ${row.sizes.join("/").padEnd(12)} ` +
        `${String(row.nodes).padStart(5)}  ${degrees(row.worst).padStart(7)}  ` +
        `${row.reachable ? " OK  " : " no  "}  ${row.numbersPerGroup.toFixed(1).padStart(5)}
`,
    );
  }
  const best = result.rows
    .filter((row) => row.reachable)
    .sort((left, right) => left.numbersPerGroup - right.numbersPerGroup)[0];
  if (best) {
    process.stdout.write(
      `
cheapest reachable: ${best.families} families at ${best.nodes} nodes, ` +
        `worst ${degrees(best.worst)} deg for ${best.numbersPerGroup.toFixed(1)} numbers per group
`,
    );
  }
}

async function main() {
  if (process.argv.includes("--families")) {
    await mainFamilies();
    return;
  }
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
