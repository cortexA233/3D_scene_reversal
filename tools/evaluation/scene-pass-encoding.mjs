/**
 * The fixed-camera pass encodings, separated from the browser harness so they
 * can be checked without a GPU.
 *
 * Every rendered gate metric is read back out of one of these passes, so an
 * encoding defect is indistinguishable from a candidate defect until something
 * tests the encoding itself. Three such defects were shipped in the harness's
 * first cut, all of them invisible in the numbers:
 *
 * 1. **Per-instance colour tinted every identity.** three.js multiplies a
 *    material's colour by an InstancedMesh's `instanceColor` whenever one is
 *    present, whatever the material is. Swapping in a pass material therefore
 *    did not produce the pass material's colour: it produced that colour times
 *    the authored per-instance tint. The reference's two large ground-rock
 *    populations call `setColorAt` and its three grass populations do not, so
 *    5,100 authored instances decoded as five other semantic groups while the
 *    grass decoded correctly. Measured on the authored overview, the `cover`
 *    group's reference mask held 128 pixels where the scene draws 5,299, and
 *    ticket 09 spent a round fitting a candidate against the wrong number by a
 *    factor of forty-one.
 * 2. **The depth and world-normal shaders ignored `instanceMatrix`.** They are
 *    ShaderMaterials, so no chunk applied it for them, and every instance of
 *    every population rendered stacked on its mesh's own origin. Depth and
 *    orientation evidence for an instanced group measured whatever stood behind
 *    it.
 * 3. **The identity lattice overflowed.** A step of 20 puts the fourteenth group
 *    at 280 of 255, so `environment` clamped onto `cover`'s value and `cover`
 *    itself sat exactly on the clamp. A step of 16 keeps every declared identity
 *    inside the channel with margin.
 *
 * Nothing here reads the candidate, and nothing here imports the browser: it is
 * `three` and arithmetic, so `test/scene-pass-encoding.test.mjs` can hold it to
 * an analytical fixture the way the metric functions already are.
 */

import * as THREE from "three";

export const SEMANTIC_GROUPS = Object.freeze([
  "sky",
  "cloud",
  "geography",
  "horizon",
  "structures",
  "bridges",
  "plazas",
  "paths",
  "rocks",
  "decorations",
  "vegetation",
  "wildlife",
  "cover",
  "environment",
]);

export const SEMANTIC_LABELS = Object.freeze(
  Object.fromEntries(SEMANTIC_GROUPS.map((group, index) => [index + 1, group])),
);

export function groupIndex(group) {
  const index = SEMANTIC_GROUPS.indexOf(group);
  return index < 0 ? 0 : index + 1;
}

/**
 * The identity lattice. Coarse so decoding survives colour-space rounding, and
 * small enough that the highest declared identity still fits in one byte: the
 * fourteenth group needs 224 of 255 at this step and 280 at the previous one.
 */
export const PASS_IDENTITY_STEP = 16;

/**
 * The largest identity the red channel can carry. Asserted rather than assumed,
 * because the failure mode is silent: an overflowing index clamps onto a
 * different group's value and its pixels are counted as that group's.
 */
export const PASS_IDENTITY_CAPACITY = Math.floor(255 / PASS_IDENTITY_STEP);

export function semanticMaterial(index) {
  if (!Number.isInteger(index) || index < 0 || index > PASS_IDENTITY_CAPACITY) {
    throw new RangeError(
      `pass identity ${index} is outside the ${PASS_IDENTITY_CAPACITY} values the red channel carries at step ${PASS_IDENTITY_STEP}`,
    );
  }
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  material.color.setRGB(
    (index * PASS_IDENTITY_STEP) / 255,
    0,
    0,
    THREE.LinearSRGBColorSpace,
  );
  return material;
}

export function decodeSemantic(rgba) {
  const ids = new Uint8Array(rgba.length / 4);
  for (let index = 0; index < ids.length; index += 1) {
    ids[index] = Math.round(rgba[index * 4] / PASS_IDENTITY_STEP);
  }
  return ids;
}

export const SILHOUETTE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  fog: false,
  toneMapped: false,
});

/**
 * `instanceMatrix` is applied under the same `USE_INSTANCING` guard three.js
 * declares the attribute under, and the normal is turned by the instance's own
 * basis exactly as `defaultnormal_vertex` does, so an instanced surface is
 * measured where it actually stands rather than at its mesh's origin.
 */
export const DEPTH_MATERIAL = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { near: { value: 0.5 }, far: { value: 30000 } },
  vertexShader: `
    varying float vViewDepth;
    void main() {
      vec4 local = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        local = instanceMatrix * local;
      #endif
      vec4 view = modelViewMatrix * local;
      vViewDepth = -view.z;
      gl_Position = projectionMatrix * view;
    }
  `,
  fragmentShader: `
    uniform float near;
    uniform float far;
    varying float vViewDepth;
    void main() {
      float normalized = clamp((vViewDepth - near) / (far - near), 0.0, 1.0);
      float scaled = normalized * 16777215.0;
      float r = floor(scaled / 65536.0);
      float g = floor(mod(scaled, 65536.0) / 256.0);
      float b = floor(mod(scaled, 256.0));
      gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
    }
  `,
});

export const NORMAL_MATERIAL = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec3 vWorldNormal;
    void main() {
      vec3 objectNormal = normal;
      vec4 local = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        objectNormal = mat3(instanceMatrix) * objectNormal;
        local = instanceMatrix * local;
      #endif
      vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      gl_Position = projectionMatrix * modelViewMatrix * local;
    }
  `,
  fragmentShader: `
    varying vec3 vWorldNormal;
    void main() {
      gl_FragColor = vec4(normalize(vWorldNormal) * 0.5 + 0.5, 1.0);
    }
  `,
});

/**
 * Every InstancedMesh in the subtree that carries a per-instance colour.
 *
 * Exported so the check can name the condition rather than infer it, and so the
 * inventory's own identity pass can suppress the same thing the gate passes do.
 */
export function tintedInstancedMeshes(scene) {
  const tinted = [];
  scene.traverse((object) => {
    if (object.isInstancedMesh && object.instanceColor) tinted.push(object);
  });
  return tinted;
}

/**
 * Swaps in a pass material for every mesh and restores the exact original
 * references afterwards, so no authored material is modified.
 *
 * Per-instance colour is suppressed for the duration and put back, because
 * three.js multiplies it into whatever material is bound: without this, a pass
 * material's colour is not what reaches the framebuffer for any InstancedMesh
 * that carries one, and the identity it encodes decodes as a different one.
 *
 * The sky shell is hidden for the auxiliary passes. It is a backdrop that fills
 * every frame for both subjects, so leaving it in would make silhouette, depth,
 * and normal evidence report near-perfect agreement regardless of the island.
 */
export function withPassMaterials(scene, chooser, run, isBackdrop) {
  const restore = [];
  const hidden = [];
  const tinted = [];
  scene.traverse((object) => {
    if (!object.isMesh && !object.isPoints && !object.isLine && !object.isSprite) return;
    if (object.isSprite || isBackdrop?.(object)) {
      if (object.visible) {
        hidden.push(object);
        object.visible = false;
      }
      return;
    }
    const material = chooser(object);
    if (!material) return;
    restore.push([object, object.material]);
    object.material = material;
    if (object.isInstancedMesh && object.instanceColor) {
      tinted.push([object, object.instanceColor]);
      object.instanceColor = null;
    }
  });
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = null;
  scene.fog = null;
  try {
    return run();
  } finally {
    for (const [object, material] of restore) object.material = material;
    for (const [object, instanceColor] of tinted) object.instanceColor = instanceColor;
    for (const object of hidden) object.visible = true;
    scene.background = previousBackground;
    scene.fog = previousFog;
  }
}

export function labelMasks(ids, labels) {
  const masks = {};
  for (const [id, label] of Object.entries(labels)) {
    const numeric = Number(id);
    const mask = new Uint8Array(ids.length);
    let any = false;
    for (let index = 0; index < ids.length; index += 1) {
      if (ids[index] === numeric) {
        mask[index] = 1;
        any = true;
      }
    }
    if (any) masks[label] = mask;
  }
  return masks;
}

export function regionMasks(semanticIds) {
  return labelMasks(semanticIds, SEMANTIC_LABELS);
}
