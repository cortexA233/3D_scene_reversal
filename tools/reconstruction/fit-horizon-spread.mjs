/**
 * Development-only Reference-guided Fitting Loop tracer.
 *
 * Reads the measured reference skyline, measures the candidate's own skyline
 * through the same metric acceptance uses, and solves one compact per-group
 * control — how broadly a Horizon Group's summits sit inside its footprint.
 *
 * The correction is persisted into the Scene Recipe and reproduced by the real
 * production generator. Nothing here writes into the evaluation path, and no
 * dense reference evidence is retained: each group gains exactly one number.
 */

import { generateSceneObject } from "../../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { deriveSceneSeed } from "../../gt_designer/src/reconstruction/scene/scene-seed.js";
import { compareHorizonProfiles, profileFromGeometry } from "../evaluation/horizon-evidence.mjs";

/** The search range and step for the single fitted control. */
export const SPREAD_RANGE = Object.freeze({ minimum: 0.3, maximum: 1.6, step: 0.05 });

/**
 * Places one generated Horizon Group exactly where the Scene Generator would,
 * so the fitted control is measured against what production will actually
 * build rather than against a stand-in.
 */
function placeGroup(THREE, entity, shape, seed) {
  const form = generateSceneObject(entity.kind, seed, shape);
  const oriented = new THREE.Group();
  oriented.add(form);
  if (entity.orientation.type !== "radial") oriented.rotation.y = entity.orientation.radians;
  oriented.updateMatrixWorld(true);
  const rotated = new THREE.Box3().setFromObject(oriented);
  const size = rotated.getSize(new THREE.Vector3());
  const centre = rotated.getCenter(new THREE.Vector3());
  oriented.position.set(-centre.x, -rotated.min.y, -centre.z);

  const scaled = new THREE.Group();
  scaled.add(oriented);
  scaled.scale.set(
    entity.extent[0] / size.x,
    entity.extent[1] / size.y,
    entity.extent[2] / size.z,
  );
  const holder = new THREE.Group();
  holder.add(scaled);
  holder.position.set(...entity.anchor);
  holder.updateMatrixWorld(true);
  return holder;
}

/**
 * @returns {{semanticId: string, spreadScale: number, before: number, after: number}[]}
 */
export function fitHorizonSpread({ THREE, recipe, referenceGroups, anchor, bins }) {
  const results = [];
  for (const entity of recipe.entities) {
    if (entity.group !== "horizon") continue;
    const reference = referenceGroups.get(entity.semanticId);
    if (!reference) continue;
    const seed = deriveSceneSeed(recipe.sceneSeed, entity.semanticId, "geometry");

    let best = null;
    for (
      let spreadScale = SPREAD_RANGE.minimum;
      spreadScale <= SPREAD_RANGE.maximum + 1e-9;
      spreadScale += SPREAD_RANGE.step
    ) {
      const rounded = Number(spreadScale.toFixed(2));
      const shape = { ...entity.shape, spreadScale: rounded };
      const measured = profileFromGeometry(placeGroup(THREE, entity, shape, seed), anchor, bins);
      const comparison = compareHorizonProfiles(reference.profile, measured.profile, bins);
      // A narrower summit can lower the angular error by simply not being
      // there, so any spread that leaves an azimuth the reference covers empty
      // is rejected. Only that direction counts: a summit that reaches slightly
      // wider than the authored one is a shape error the metric already sees,
      // not a hole in the skyline.
      let uncovered = 0;
      for (let bin = 0; bin < bins; bin += 1) {
        if (reference.profile[bin] !== null && measured.profile[bin] === null) uncovered += 1;
      }
      if (uncovered > 0) continue;
      void comparison;
      const score = comparison.angularError?.p95 ?? Number.POSITIVE_INFINITY;
      if (!best || score < best.score) best = { spreadScale: rounded, score };
    }

    const identity = profileFromGeometry(
      placeGroup(THREE, entity, { ...entity.shape, spreadScale: 1 }, seed),
      anchor,
      bins,
    );
    const before =
      compareHorizonProfiles(reference.profile, identity.profile, bins).angularError?.p95 ??
      Number.POSITIVE_INFINITY;

    // The constraint can rule out every alternative, and it can even rule out
    // the neutral value itself. A fit is only accepted when it actually beats
    // the unfitted result, so no group is ever made worse to satisfy the search.
    const accepted =
      best && best.score < before ? best : { spreadScale: 1, score: before, constrained: true };

    results.push({
      semanticId: entity.semanticId,
      spreadScale: accepted.spreadScale,
      before: Number(before.toFixed(6)),
      after: Number(accepted.score.toFixed(6)),
      ...(accepted.constrained ? { constrained: true } : {}),
    });
  }
  return results;
}
