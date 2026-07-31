import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "/src/reconstruction/scene/island-scene-recipe.generated.js";
import { familyKey, resolveFamily } from "/dev-tools/reconstruction/scene-families.mjs";
// The pass encodings live in a module the checks can import without a GPU, so a
// defect in them is caught by a fixture rather than by a candidate result that
// looks merely disappointing. Re-exported here because both capture harnesses
// already import this kit as their single entry point.
export {
  DEPTH_MATERIAL,
  NORMAL_MATERIAL,
  PASS_IDENTITY_CAPACITY,
  PASS_IDENTITY_STEP,
  SEMANTIC_GROUPS,
  SEMANTIC_LABELS,
  SILHOUETTE_MATERIAL,
  decodeSemantic,
  groupIndex,
  labelMasks,
  regionMasks,
  semanticMaterial,
  tintedInstancedMeshes,
  withPassMaterials,
} from "/dev-tools/evaluation/scene-pass-encoding.mjs";

/**
 * The shared machinery behind every fixed-camera capture: the pass encodings,
 * the frozen-camera reconstruction, and the reference's own semantic and
 * Material Family classification.
 *
 * Both the acceptance capture and the calibration run import this module rather
 * than each carrying a copy. That is the point: a threshold is only comparable
 * to an acceptance result if both were produced by the same encoding, and two
 * copies of a depth shader drift apart silently.
 *
 * Nothing here builds, imports, or reads the candidate.
 */

/**
 * Material Families come from the Scene Recipe rather than a second hand-written
 * list, so a family added to the recipe cannot be silently left unmeasured.
 */
export const MATERIAL_FAMILIES = Object.freeze(
  [...ISLAND_SCENE_RECIPE.materialFamilies.map((family) => family.id)].sort(),
);

export const MATERIAL_FAMILY_LABELS = Object.freeze(
  Object.fromEntries(MATERIAL_FAMILIES.map((family, index) => [index + 1, family])),
);

export function materialFamilyIndex(family) {
  const index = MATERIAL_FAMILIES.indexOf(family);
  return index < 0 ? 0 : index + 1;
}

export function round(value, digits = 6) {
  if (!Number.isFinite(value)) return String(value);
  const result = Number(value.toFixed(digits));
  return Object.is(result, -0) ? 0 : result;
}

export function createTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
}

/** WebGL reads bottom-up; every pass is stored top-down so they align. */
function flipVertically(pixels, width, height) {
  const flipped = new Uint8Array(pixels.length);
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    flipped.set(
      pixels.subarray((height - 1 - row) * stride, (height - row) * stride),
      row * stride,
    );
  }
  return flipped;
}

export function readTarget(renderer, target, scene, camera, width, height) {
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  return flipVertically(pixels, width, height);
}

export function readCanvas(canvas, width, height) {
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const context = copy.getContext("2d", { willReadFrequently: true });
  context.drawImage(canvas, 0, 0, width, height);
  return new Uint8Array(context.getImageData(0, 0, width, height).data);
}

const VILLAGE_MARKER = "Authored_Village";
const WILDLIFE_MARKER = "_Rig";

/**
 * Classifies the reference's own scene graph with the same measured rules the
 * Semantic Coverage Manifest uses.
 *
 * This reads the live scene rather than a precomputed map keyed by traversal
 * path. The reference builds its animated rigs asynchronously, so child indices
 * are not stable between runs, and a path-keyed map silently relabels most of
 * the island when they shift.
 *
 * Each entry also names the placement root the mesh belongs to. Scene-space
 * damage acts on those roots, so they have to come from the same classification
 * the measurement uses rather than from a second traversal that could disagree
 * with it.
 */
export function buildReferenceSemanticIndex(scene) {
  const byMesh = new Map();
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3();

  // Live object names contain spaces ("Authored Village", "Hua Hua Rig") while
  // the measured evidence slugs them. Normalizing both sides is what makes the
  // two readings of the same scene agree.
  const stable = (value) => String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");

  const placementRootOf = (object) => {
    let node = object;
    let previous = object;
    while (node) {
      const name = stable(node.name);
      if (name.includes(VILLAGE_MARKER)) return { root: previous, village: true };
      // Suffix, not substring: a limb mesh named "..._Right" contains "_Rig".
      if (name.endsWith(WILDLIFE_MARKER)) return { root: node, wildlife: true };
      previous = node;
      node = node.parent;
    }
    return null;
  };

  // Material Families for the reference's own layers. The family table covers
  // every authored placement; these are the layers it does not describe, taken
  // from the same populations and Environment Recipe the candidate builds from.
  const SEA_LEVEL = ISLAND_SCENE_RECIPE.terrain.seaLevel;
  const set = (object, group, material, root) =>
    byMesh.set(object, { group, material, root: root ?? null });

  scene.traverse((object) => {
    if (!object.isMesh && !object.isPoints && !object.isLine && !object.isSprite) return;
    const placement = placementRootOf(object);
    if (placement?.wildlife) {
      set(object, "wildlife", "creature-fur", placement.root);
      return;
    }
    if (placement?.village) {
      bounds.setFromObject(placement.root);
      bounds.getSize(size);
      try {
        // familyKey reads a full "index:type:name" evidence segment.
        const family = familyKey(`::${stable(placement.root.name)}`);
        const resolved = resolveFamily(family, [size.x, size.y, size.z]);
        set(object, resolved.group, resolved.material, placement.root);
      } catch {
        set(object, null, null, placement.root);
      }
      return;
    }
    // Root-level layers, classified by measured extent exactly as coverage does.
    if (object.isSprite) {
      set(object, "cloud", "ocean-surface", object);
      return;
    }
    if (object.isInstancedMesh) {
      set(object, "cover", "shore-rock", object);
      return;
    }
    bounds.setFromObject(object);
    if (!Number.isFinite(bounds.min.x)) {
      set(object, null, null, object);
      return;
    }
    bounds.getSize(size);
    if (size.x >= 10000 && size.z >= 10000 && size.y > 1) set(object, "sky", null, object);
    else if (size.x > 700 && size.z > 700) {
      // Both the terrain and the Ocean Appearance Surface are world-spanning
      // planes in this group. The ocean is the flat one sitting on the Semantic
      // Sea Level; the terrain carries relief.
      const flatAtSeaLevel = size.y < 0.5 && Math.abs(bounds.min.y - SEA_LEVEL) < 1;
      set(object, "geography", flatAtSeaLevel ? "ocean-surface" : "terrain-ground", object);
    } else set(object, null, null, object);
  });
  return byMesh;
}

export async function previewPng(rgba, width, height, scale = 4) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d");
  const image = context.createImageData(width, height);
  image.data.set(rgba);
  context.putImageData(image, 0, 0);

  const preview = document.createElement("canvas");
  preview.width = Math.round(width / scale);
  preview.height = Math.round(height / scale);
  preview.getContext("2d").drawImage(source, 0, 0, preview.width, preview.height);
  return preview.toDataURL("image/png");
}

/**
 * A difference preview: where the two subjects disagree, and which way.
 *
 * Human Parity Review has to be able to see *where* a number comes from, and a pair of
 * side-by-side images does not show that — an eye cannot subtract two 1440x810 frames.
 * Red is reference-only, blue is candidate-only, and grey is agreement, so a group the
 * candidate over-draws and one it misses are different colours rather than both "wrong".
 *
 * Built from the same RGBA buffers the metrics read, in the same frame, so a reviewer's
 * observation and the measurement cannot be about different pictures.
 */
export async function differencePng(reference, candidate, width, height, scale = 4) {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    const left = reference[index] | reference[index + 1] | reference[index + 2];
    const right = candidate[index] | candidate[index + 1] | candidate[index + 2];
    const inLeft = left !== 0;
    const inRight = right !== 0;
    if (inLeft && inRight) {
      // Agreement, dimmed, so the disagreement is what the eye lands on.
      const shade = 40 + Math.round(Math.abs(left - right) / 8);
      rgba[index] = shade;
      rgba[index + 1] = shade;
      rgba[index + 2] = shade;
    } else if (inLeft) {
      rgba[index] = 220;
      rgba[index + 1] = 40;
      rgba[index + 2] = 60;
    } else if (inRight) {
      rgba[index] = 50;
      rgba[index + 1] = 120;
      rgba[index + 2] = 235;
    }
    rgba[index + 3] = 255;
  }
  return previewPng(rgba, width, height, scale);
}

export function matrixDelta(actual, expected) {
  return Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
}

export function cameraEntries(cameraSet) {
  return [
    ["authoredOverview", cameraSet.authoredOverview],
    ["topDown", cameraSet.topDown],
    ...Object.entries(cameraSet.obliques).map(([name, camera]) => [
      `oblique-${name}`,
      camera,
    ]),
  ];
}

/**
 * Rebuilds one frozen camera and reports how far the reconstruction is from the
 * frozen matrices, so a capture through a drifted camera is visible rather than
 * silently comparing two framings.
 */
export function frozenCamera(frozen, width, height) {
  const camera = new THREE.PerspectiveCamera(
    frozen.verticalFovDegrees ?? frozen.fov,
    frozen.aspect ?? width / height,
    frozen.near,
    frozen.far,
  );
  // The frozen top-down camera declares a non-default up, because looking
  // straight down leaves the roll undefined against world up. Honouring the
  // frozen up is what makes the reproduced view matrix exact.
  const up = frozen.up ?? [0, 1, 0];
  camera.up.fromArray(up);
  camera.position.fromArray(frozen.position);
  camera.lookAt(...frozen.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return {
    camera,
    up,
    protocol: {
      viewMatrixDelta: round(
        frozen.viewMatrix
          ? matrixDelta(camera.matrixWorldInverse.elements, frozen.viewMatrix)
          : 0,
        9,
      ),
      projectionMatrixDelta: round(
        frozen.projectionMatrix
          ? matrixDelta(camera.projectionMatrix.elements, frozen.projectionMatrix)
          : 0,
        9,
      ),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: round(camera.aspect, 9),
      framebuffer: [width, height],
    },
  };
}
