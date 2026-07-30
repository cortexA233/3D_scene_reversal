import * as THREE from "three";

import { readAuthoredPlacements } from "../reconstruction/scene-placements.mjs";
import { sampleEntitySurface } from "./surface-sampling.mjs";

/**
 * The scene-observation seam.
 *
 * Two real adapters expose equivalent facts about the Authored Reference and
 * the Procedural Replacement. The reference adapter is strictly read-only. The
 * candidate adapter exposes the actual generated production scene: it does not
 * centre, normalize, scale, reframe, fit, or relight anything, and its
 * integrity check proves that.
 */

export const SCENE_OBSERVATION_SCHEMA = "scene-observation-v1";

function boundsOf(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
  };
}

function anchorOf(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function extentOf(bounds) {
  return [0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis]);
}

export function observeAuthoredReference({ inventory, samples }) {
  const { placements, members } = readAuthoredPlacements(inventory);
  const byPath = new Map(inventory.items.map((item) => [item.path, item]));

  const entities = new Map();
  for (const placement of placements) {
    const paths = [...members.entries()]
      .filter(([, key]) => key === placement.key)
      .map(([path]) => path);
    const points = [];
    for (const path of paths) points.push(...(samples.samples[path] ?? []));
    entities.set(placement.semanticId, {
      semanticId: placement.semanticId,
      kind: placement.kind,
      group: placement.group,
      anchor: placement.anchor,
      extent: placement.extent,
      orientation: placement.orientation,
      materialFamily: placement.materialFamily,
      componentCount: paths.length,
      triangles: paths.reduce((sum, path) => sum + (byPath.get(path)?.triangles ?? 0), 0),
      overviewPixels: placement.overviewPixels,
      samples: points,
    });
  }

  // Distributed Scene Cover: instanced populations keep their own identity,
  // while the cloud sprites are one population rather than 34 anonymous ones.
  const covers = new Map();
  const sprites = [];
  for (const item of inventory.items) {
    if (members.has(item.path) || !item.bounds) continue;
    if (item.type === "Sprite") {
      sprites.push(item);
      continue;
    }
    if (item.instanceCount > 1) {
      covers.set(item.path, {
        count: item.instanceCount,
        type: item.type,
        bounds: item.bounds,
        samples: samples.samples[item.path] ?? [],
      });
    }
  }
  if (sprites.length > 0) {
    const min = [0, 1, 2].map((axis) =>
      Math.min(...sprites.map((sprite) => sprite.bounds.min[axis])),
    );
    const max = [0, 1, 2].map((axis) =>
      Math.max(...sprites.map((sprite) => sprite.bounds.max[axis])),
    );
    covers.set("sky-clouds", {
      count: sprites.length,
      type: "Sprite",
      bounds: { min, max },
      samples: sprites.flatMap((sprite) => samples.samples[sprite.path] ?? []),
    });
  }

  return {
    schemaVersion: SCENE_OBSERVATION_SCHEMA,
    subject: "authored-reference",
    entities,
    covers,
    lights: inventory.lights,
    adapterIntegrity: {
      transientCorrection: false,
      note: "read-only measurement of the Assembled Authored Scene",
    },
  };
}

/**
 * Reads the real generated production scene. Any transform on the generated
 * root, or any entity holder carrying a scale or a non-Y rotation, is an
 * evaluation-side correction and is reported rather than silently absorbed.
 */
export function observeCandidate(generated) {
  const { root, semanticIndex } = generated;
  root.updateMatrixWorld(true);

  const rootTransformClean =
    root.position.lengthSq() === 0 &&
    root.scale.x === 1 &&
    root.scale.y === 1 &&
    root.scale.z === 1 &&
    root.rotation.x === 0 &&
    root.rotation.y === 0 &&
    root.rotation.z === 0;

  const entities = new Map();
  const covers = new Map();
  const corrections = [];
  for (const [semanticId, record] of semanticIndex) {
    if (record.kind === "semantic-light") continue;
    if (record.kind === "distributed-cover") {
      covers.set(semanticId, {
        count: record.count,
        type: "InstancedMesh",
        bounds: boundsOf(record.object),
        samples: sampleEntitySurface(record.object),
      });
      continue;
    }
    if (record.kind === "terrain") continue;

    const holder = record.object;
    if (holder.rotation.x !== 0 || holder.rotation.z !== 0) {
      corrections.push(`${semanticId}: entity holder carries a non-yaw rotation`);
    }
    if (holder.scale.x !== 1 || holder.scale.y !== 1 || holder.scale.z !== 1) {
      corrections.push(`${semanticId}: entity holder carries a scale`);
    }
    let componentCount = 0;
    let triangles = 0;
    holder.traverse((child) => {
      if (!child.isMesh) return;
      componentCount += 1;
      const position = child.geometry?.attributes?.position;
      const index = child.geometry?.index;
      triangles += Math.floor((index ? index.count : (position?.count ?? 0)) / 3);
    });
    const bounds = boundsOf(holder);
    entities.set(semanticId, {
      semanticId,
      kind: record.kind,
      group: record.group,
      // Measured from the generated scene, not copied from the recipe, so a
      // generator that misses its declared contract shows up here.
      anchor: anchorOf(bounds),
      extent: extentOf(bounds),
      orientation: record.orientation,
      materialFamily: record.materialFamily,
      componentCount,
      triangles,
      samples: sampleEntitySurface(holder),
    });
  }

  return {
    schemaVersion: SCENE_OBSERVATION_SCHEMA,
    subject: "procedural-replacement",
    entities,
    covers,
    lights: [],
    adapterIntegrity: {
      rootTransformClean,
      transientCorrection: corrections.length > 0 || !rootTransformClean,
      corrections,
    },
  };
}
