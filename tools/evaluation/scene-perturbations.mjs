/**
 * Declared reference-only perturbation controls.
 *
 * Each control takes the measured reference and returns a perturbed copy of it,
 * which is then compared against the unperturbed reference through the very
 * same metric implementations acceptance uses. Mild controls are variations an
 * Exact-ish Reconstruction should tolerate; severe controls are damage it must
 * reject.
 *
 * The controls never see the candidate.
 */

export const PERTURBATION_SCHEMA = "scene-perturbations-v1";

function cloneObservation(observation) {
  return {
    ...observation,
    subject: "perturbed-reference",
    entities: new Map(
      [...observation.entities.entries()].map(([id, entity]) => [
        id,
        { ...entity, anchor: [...entity.anchor], extent: [...entity.extent], samples: [...entity.samples] },
      ]),
    ),
    covers: new Map(
      [...observation.covers.entries()].map(([id, cover]) => [
        id,
        { ...cover, bounds: { min: [...cover.bounds.min], max: [...cover.bounds.max] }, samples: [...cover.samples] },
      ]),
    ),
  };
}

function translateEntities(observation, delta, filter = () => true) {
  const result = cloneObservation(observation);
  for (const entity of result.entities.values()) {
    if (!filter(entity)) continue;
    for (let axis = 0; axis < 3; axis += 1) entity.anchor[axis] += delta[axis];
    for (let index = 0; index < entity.samples.length; index += 3) {
      entity.samples[index] += delta[0];
      entity.samples[index + 1] += delta[1];
      entity.samples[index + 2] += delta[2];
    }
  }
  return result;
}

function scaleEntities(observation, factor, filter = () => true) {
  const result = cloneObservation(observation);
  for (const entity of result.entities.values()) {
    if (!filter(entity)) continue;
    const centre = [entity.anchor[0], entity.anchor[1] + entity.extent[1] / 2, entity.anchor[2]];
    for (let axis = 0; axis < 3; axis += 1) entity.extent[axis] *= factor;
    entity.anchor[1] = centre[1] - entity.extent[1] / 2;
    for (let index = 0; index < entity.samples.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        entity.samples[index + axis] =
          centre[axis] + (entity.samples[index + axis] - centre[axis]) * factor;
      }
    }
  }
  return result;
}

function rotateEntities(observation, radians, filter = () => true) {
  const result = cloneObservation(observation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  for (const entity of result.entities.values()) {
    if (!filter(entity) || entity.orientation.type === "radial") continue;
    entity.orientation = { ...entity.orientation, radians: entity.orientation.radians + radians };
    const centre = [entity.anchor[0], entity.anchor[2]];
    for (let index = 0; index < entity.samples.length; index += 3) {
      const x = entity.samples[index] - centre[0];
      const z = entity.samples[index + 2] - centre[1];
      entity.samples[index] = centre[0] + x * cos - z * sin;
      entity.samples[index + 2] = centre[1] + x * sin + z * cos;
    }
  }
  return result;
}

function deleteEntities(observation, filter) {
  const result = cloneObservation(observation);
  for (const [id, entity] of [...result.entities.entries()]) {
    if (filter(entity)) result.entities.delete(id);
  }
  return result;
}

function duplicateEntity(observation, filter) {
  const result = cloneObservation(observation);
  const victim = [...result.entities.values()].find(filter);
  if (victim) {
    result.entities.set(`${victim.semanticId}-duplicate`, {
      ...victim,
      semanticId: `${victim.semanticId}-duplicate`,
    });
  }
  return result;
}

/**
 * Swaps two entities' world placements, carrying their surfaces with them.
 * Moving only the anchors would leave the surface evidence unchanged and the
 * control would silently fail to be damage at all.
 */
function swapEntities(observation, filter) {
  const result = cloneObservation(observation);
  const victims = [...result.entities.values()].filter(filter).slice(0, 2);
  if (victims.length === 2) {
    const [left, right] = victims;
    const delta = [0, 1, 2].map((axis) => right.anchor[axis] - left.anchor[axis]);
    const shift = (entity, sign) => {
      for (let axis = 0; axis < 3; axis += 1) entity.anchor[axis] += delta[axis] * sign;
      for (let index = 0; index < entity.samples.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          entity.samples[index + axis] += delta[axis] * sign;
        }
      }
    };
    shift(left, 1);
    shift(right, -1);
  }
  return result;
}

const isStructure = (entity) => entity.group === "structures";
const isVegetation = (entity) => entity.group === "vegetation";

/**
 * Structural and world-geometry controls. Mild values are chosen from what a
 * different-but-faithful reconstruction plausibly produces; severe values are
 * damage a reviewer would call out immediately.
 */
export const SCENE_CONTROLS = Object.freeze([
  { id: "identity", class: "identity", apply: (observation) => cloneObservation(observation) },
  {
    id: "translate-0.15",
    class: "mild",
    apply: (observation) => translateEntities(observation, [0.15, 0, 0.1]),
  },
  {
    id: "extent-1pct",
    class: "mild",
    apply: (observation) => scaleEntities(observation, 1.01),
  },
  {
    id: "yaw-0.02",
    class: "mild",
    apply: (observation) => rotateEntities(observation, 0.02),
  },
  {
    id: "translate-1.2",
    class: "intermediate",
    apply: (observation) => translateEntities(observation, [1.2, 0, -0.8]),
  },
  {
    id: "extent-8pct",
    class: "intermediate",
    apply: (observation) => scaleEntities(observation, 1.08),
  },
  {
    id: "delete-structures",
    class: "severe",
    detects: ["missing entities"],
    apply: (observation) => deleteEntities(observation, isStructure),
  },
  {
    id: "duplicate-structure",
    class: "severe",
    detects: ["extra entities"],
    apply: (observation) => duplicateEntity(observation, isStructure),
  },
  {
    id: "swap-structures",
    class: "severe",
    detects: [
      "worst entity anchor error",
      "worst neighbourhood distance error",
      "worst entity surface p95",
    ],
    apply: (observation) => swapEntities(observation, isStructure),
  },
  {
    id: "translate-12",
    class: "severe",
    detects: [
      "anchor error p95",
      "worst entity anchor error",
      "surface p95",
      "worst entity surface p95",
      "over-tolerance surface fraction",
      "worst zone occupancy delta",
    ],
    apply: (observation) => translateEntities(observation, [12, 0, -9]),
  },
  {
    id: "extent-45pct",
    class: "severe",
    detects: [
      "worst entity extent error",
      "surface p95",
      "worst entity surface p95",
      "over-tolerance surface fraction",
    ],
    apply: (observation) => scaleEntities(observation, 1.45),
  },
  {
    id: "yaw-0.9",
    class: "severe",
    detects: ["worst entity orientation error"],
    apply: (observation) => rotateEntities(observation, 0.9, isStructure),
  },
  {
    id: "vegetation-collapse",
    class: "severe",
    detects: [
      "worst entity extent error",
      "over-tolerance surface fraction",
    ],
    apply: (observation) => scaleEntities(observation, 0.4, isVegetation),
  },
  {
    id: "strip-components",
    class: "severe",
    detects: ["worst component delta"],
    apply: (observation) => {
      const result = cloneObservation(observation);
      for (const entity of result.entities.values()) {
        // A multi-part authored object replaced by one undifferentiated mass.
        // Targeting whatever actually has parts, rather than a group that
        // happens to be single-mesh, is what makes this control bite.
        if (entity.componentCount <= 1) continue;
        entity.componentCount = 1;
      }
      return result;
    },
  },
]);

/** Geography controls operate on the measured reference elevation field. */
export const GEOGRAPHY_CONTROLS = Object.freeze([
  { id: "identity", class: "identity", elevation: (at) => at },
  { id: "raise-0.3", class: "mild", elevation: (at) => (x, z) => at(x, z) + 0.3 },
  { id: "coast-1pct", class: "mild", elevation: (at) => (x, z) => at(x * 0.99, z * 0.99) },
  { id: "raise-2", class: "intermediate", elevation: (at) => (x, z) => at(x, z) + 2 },
  {
    id: "raise-12",
    class: "severe",
    detects: ["terrain height p95", "shore height p95", "land and sea agreement"],
    elevation: (at) => (x, z) => at(x, z) + 12,
  },
  {
    id: "coast-20pct",
    class: "severe",
    detects: [
      "coastline symmetric p95",
      "coastline area error",
      "land and sea agreement",
    ],
    elevation: (at) => (x, z) => at(x * 1.25, z * 1.25),
  },
  {
    id: "flatten-relief",
    class: "severe",
    detects: ["terrain height p95", "shore height p95"],
    elevation: (at) => (x, z) => Math.max(at(x, z), 16) * 0.4 + 15,
  },
]);

/** Horizon controls operate on the measured per-group profiles. */
export const HORIZON_CONTROLS = Object.freeze([
  { id: "identity", class: "identity", profile: (values) => values },
  {
    id: "elevation-0.002",
    class: "mild",
    profile: (values) => values.map((value) => (value === null ? null : value + 0.002)),
  },
  {
    id: "elevation-0.01",
    class: "intermediate",
    profile: (values) => values.map((value) => (value === null ? null : value + 0.01)),
  },
  {
    id: "elevation-0.06",
    class: "severe",
    detects: ["horizon profile p95", "worst azimuth horizon error"],
    profile: (values) => values.map((value) => (value === null ? null : value + 0.06)),
  },
  {
    id: "flatten-peaks",
    class: "severe",
    detects: ["horizon profile p95", "worst azimuth horizon error"],
    profile: (values) => values.map((value) => (value === null ? null : value * 0.45)),
  },
]);
