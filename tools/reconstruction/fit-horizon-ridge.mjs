/**
 * Development-only Reference-guided Fitting Loop for the Horizon Groups.
 *
 * Reads each group's own measured skyline, measures the candidate's skyline
 * through the same metric acceptance uses, and solves the group's bounded ridge
 * controls against it: which way its crest runs, how far it runs out past its
 * end summits, how broad it is, how steeply its flanks fall, how deeply it dips
 * between summits, and how tall and broad each of its summits is.
 *
 * The corrections are persisted into the Scene Recipe and reproduced by the real
 * production generator. Nothing here writes into the evaluation path. No dense
 * reference evidence is retained: a group gains five numbers plus two per
 * measured summit, against the 720 bins of the profile it is fitted to.
 */

import { generateSceneObject } from "../../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { deriveSceneSeed } from "../../gt_designer/src/reconstruction/scene/scene-seed.js";
import { compareHorizonProfiles, profileFromGeometry } from "../evaluation/horizon-evidence.mjs";

/** The bounded search space, declared so a fit can be read against its limits. */
export const GROUP_CONTROLS = Object.freeze([
  Object.freeze({ name: "ridgeDirection", minimum: -Math.PI, maximum: Math.PI, step: 0.15 }),
  Object.freeze({ name: "ridgeElongation", minimum: 1, maximum: 6, step: 0.3 }),
  Object.freeze({ name: "flankFalloff", minimum: 0.5, maximum: 6, step: 0.25 }),
  Object.freeze({ name: "saddleDepth", minimum: 0, maximum: 1, step: 0.08 }),
  Object.freeze({ name: "spreadScale", minimum: 0.3, maximum: 2.4, step: 0.1 }),
  Object.freeze({ name: "ridgeApron", minimum: 0, maximum: 3, step: 0.2 }),
]);
export const SUMMIT_CONTROLS = Object.freeze([
  Object.freeze({ name: "height", minimum: 0.08, maximum: 1, step: 0.03 }),
  Object.freeze({ name: "radius", minimum: 0.02, maximum: 0.45, step: 0.015 }),
]);
export const FIT_PASSES = 5;
/** How far a line search reaches either side of the current value, in steps. */
export const LINE_SEARCH_REACH = 5;
/** How hard a depth-interval error counts against an angular gain. */
export const DEPTH_WEIGHT = 1;

/** The generator's own defaults, so an unfitted group is the neutral start. */
const NEUTRAL = Object.freeze({
  ridgeDirection: 0,
  ridgeElongation: 1.5,
  flankFalloff: 1.5,
  saddleDepth: 0.3,
  spreadScale: 1,
  ridgeApron: 0,
});
const neutralRadius = (height) => 0.09 + height * 0.07;

/**
 * Places one generated Horizon Group exactly where the Scene Generator would, so
 * the fitted controls are measured against what production will actually build
 * rather than against a stand-in.
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

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value) => Number(value.toFixed(4));

function cloneShape(shape) {
  return {
    ...shape,
    peaks: shape.peaks.map((form) => ({ ...form, offset: [...form.offset] })),
    foothills: shape.foothills.map((form) => ({ ...form, offset: [...form.offset] })),
  };
}

/**
 * Both skyline gates are frozen, so the fit answers to both: the aggregate and
 * the single worst azimuth. A narrowed summit lowers either one by simply not
 * being there, so any azimuth the reference covers and the candidate does not is
 * penalised far beyond what the angular terms can win back.
 *
 * Depth is in the score for the same reason. An elevation angle is a height over
 * a distance, so a ridge can reach the authored angle by standing at the wrong
 * distance, and the first fit that ignored this improved the profile's p95 by
 * half while pushing the worst group's depth interval from 171 to 239 units.
 *
 * What is penalised is the regression, not the error. Some of this residual is
 * not the candidate's to win: the seven square-footprint groups carry a low
 * authored apron out to their own bounding-box corners, which sets their depth
 * interval and contributes nothing to their skyline. Charging the fit for that
 * would distort the ridge to chase a foot it cannot reach; charging it for
 * making depth worse than it found it is exactly the rule that keeps one piece
 * of evidence from buying another. The term converts world units into the
 * elevation angle they would move a summit of this group's height through, so
 * the trade happens in one unit rather than through a weight chosen to taste.
 */
export function scoreShape({
  THREE,
  entity,
  shape,
  seed,
  reference,
  anchor,
  bins,
  depthWeight = DEPTH_WEIGHT,
  depthFloor = Infinity,
}) {
  const measured = profileFromGeometry(placeGroup(THREE, entity, shape, seed), anchor, bins);
  let uncovered = 0;
  let covered = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    if (reference.profile[bin] === null) continue;
    covered += 1;
    if (measured.profile[bin] === null) uncovered += 1;
  }
  const comparison = compareHorizonProfiles(reference.profile, measured.profile, bins);
  const p95 = comparison.angularError?.p95 ?? Number.POSITIVE_INFINITY;
  const max = comparison.angularError?.max ?? Number.POSITIVE_INFINITY;

  const middle = (interval) => (interval[0] + interval[1]) / 2;
  const depthError =
    reference.depthInterval && measured.depthInterval
      ? Math.abs(middle(reference.depthInterval) - middle(measured.depthInterval))
      : 0;
  const distance = reference.depthInterval ? middle(reference.depthInterval) : 1;
  const regression = Math.max(0, depthError - depthFloor);
  const depthAsAngle = (entity.extent[1] * regression) / (distance * distance);

  return {
    score: (p95 + 0.6 * max) / 1.6 + depthWeight * depthAsAngle + (uncovered / covered) * 0.5,
    p95,
    max,
    depthError,
    uncovered,
    covered,
  };
}

/**
 * @returns {{semanticId: string, controls: object, summits: object[],
 *   before: object, after: object}[]}
 */
export function fitHorizonRidges({
  THREE,
  recipe,
  referenceGroups,
  anchor,
  bins,
  depthWeight = DEPTH_WEIGHT,
}) {
  const results = [];
  for (const entity of recipe.entities) {
    if (entity.group !== "horizon") continue;
    const reference = referenceGroups.get(entity.semanticId);
    if (!reference) continue;
    const seed = deriveSceneSeed(recipe.sceneSeed, entity.semanticId, "geometry");

    // The unfitted group, measured first, because it is both the bar the fit has
    // to clear and the depth the fit is not allowed to give away.
    const unfitted = {
      ...entity.shape,
      peaks: entity.shape.peaks,
      foothills: entity.shape.foothills,
    };
    const before = scoreShape({ THREE, entity, shape: unfitted, seed, reference, anchor, bins });
    const evaluate = (shape) =>
      scoreShape({
        THREE,
        entity,
        shape,
        seed,
        reference,
        anchor,
        bins,
        depthWeight,
        depthFloor: before.depthError,
      });

    const seeded = (list) =>
      list.map((form) => ({
        offset: [...form.offset],
        height: form.height,
        radius: round(neutralRadius(form.height)),
      }));
    let shape = {
      ...NEUTRAL,
      peaks: seeded(entity.shape.peaks),
      foothills: seeded(entity.shape.foothills),
    };
    let best = evaluate(shape);

    for (let pass = 0; pass < FIT_PASSES; pass += 1) {
      const improved = (trial) => {
        const result = evaluate(trial);
        if (result.score < best.score) {
          best = result;
          shape = trial;
          return true;
        }
        return false;
      };
      for (const control of GROUP_CONTROLS) {
        for (let delta = -LINE_SEARCH_REACH; delta <= LINE_SEARCH_REACH; delta += 1) {
          if (delta === 0) continue;
          const next = clamp(
            shape[control.name] + delta * control.step,
            control.minimum,
            control.maximum,
          );
          if (next === shape[control.name]) continue;
          const trial = cloneShape(shape);
          trial[control.name] = round(next);
          improved(trial);
        }
      }
      for (const family of ["peaks", "foothills"]) {
        for (let index = 0; index < shape[family].length; index += 1) {
          for (const control of SUMMIT_CONTROLS) {
            for (let delta = -LINE_SEARCH_REACH; delta <= LINE_SEARCH_REACH; delta += 1) {
              if (delta === 0) continue;
              const current = shape[family][index][control.name];
              const next = clamp(
                current + delta * control.step,
                control.minimum,
                control.maximum,
              );
              if (next === current) continue;
              const trial = cloneShape(shape);
              trial[family][index][control.name] = round(next);
              improved(trial);
            }
          }
        }
      }
    }

    // A fit is only accepted when it beats the unfitted result and covers every
    // azimuth the unfitted form covered, so the loop can never make a group worse
    // or buy an angle by shrinking a summit out of the skyline. A rejected group
    // is left unfitted rather than given a different set of unfitted controls.
    const accepted =
      best.score < before.score && best.uncovered <= before.uncovered
        ? { shape, best }
        : null;
    const chosen = accepted ?? { shape: unfitted, best: before };

    const summits = (family) =>
      chosen.shape[family].map((form) => ({ height: form.height, radius: form.radius }));
    results.push({
      semanticId: entity.semanticId,
      // A rejected group carries nothing: the Scene Recipe leaves it to the
      // generator's own defaults rather than recording an unfitted value as if
      // the loop had chosen it.
      controls: accepted
        ? Object.fromEntries(
            GROUP_CONTROLS.map((control) => [control.name, chosen.shape[control.name]]),
          )
        : null,
      summits: accepted ? { peaks: summits("peaks"), foothills: summits("foothills") } : null,
      before: {
        p95: round(before.p95),
        max: round(before.max),
        depthError: round(before.depthError),
        uncovered: before.uncovered,
      },
      after: {
        p95: round(chosen.best.p95),
        max: round(chosen.best.max),
        depthError: round(chosen.best.depthError),
        uncovered: chosen.best.uncovered,
      },
      ...(accepted ? {} : { constrained: true }),
    });
  }
  return results;
}
