import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

import {
  DEPTH_MATERIAL,
  MATERIAL_FAMILIES,
  MATERIAL_FAMILY_LABELS,
  NORMAL_MATERIAL,
  SEMANTIC_GROUPS,
  SEMANTIC_LABELS,
  SILHOUETTE_MATERIAL,
  buildReferenceSemanticIndex,
  cameraEntries,
  createTarget,
  decodeSemantic,
  frozenCamera,
  groupIndex,
  labelMasks,
  materialFamilyIndex,
  matrixDelta,
  readCanvas,
  readTarget,
  regionMasks,
  round,
  semanticMaterial,
  withPassMaterials,
} from "./browser-scene-pass-kit.mjs";
import {
  aggregateCameras,
  appearanceEvidence,
  binaryMask,
  depthEvidence,
  groupGeometryEvidence,
  semanticEvidence,
  silhouetteEvidence,
  worldNormalEvidence,
} from "./scene-pass-metrics.mjs";
import {
  SCENE_GRAPH_PERTURBATION_SCHEMA,
  applyControl,
  findControl,
} from "./scene-graph-perturbations.mjs";

/**
 * Fixed-camera and native-appearance calibration.
 *
 * Renders the reference against declared perturbed clones of itself through the
 * same six frozen cameras, at the same Normative Scene Capture size, through the
 * same pass encodings acceptance uses. The undamaged capture is the "reference"
 * side and the damaged capture is the "candidate" side of exactly the metric
 * functions the gate stack reads, which is what makes the resulting thresholds
 * comparable to a real candidate result.
 *
 * Damage is scene-space: placement roots move, scale, turn, or disappear, the
 * terrain rises, materials change. Nothing is approximated by editing pixels.
 *
 * This module never imports the Scene Generation Module. The candidate does not
 * exist on this page, and the driver proves it from the page's own request log
 * rather than from this comment.
 */

const calibration = { status: "loading", error: null, complete: null };
window.sceneCalibration = calibration;
Object.defineProperty(window, "__scenePassTypes", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({ WebGLRenderer: THREE.WebGLRenderer, EffectComposer }),
});

let referenceRenderObjects = null;
calibration.attachReferenceRenderer = ({ renderer, composer }) => {
  referenceRenderObjects = { renderer, composer };
  return { attached: true };
};

const compose = (restores) => () => {
  for (let index = restores.length - 1; index >= 0; index -= 1) restores[index]();
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The scene-space operations the declared controls are written against.
 *
 * Translation converts a world-space delta into the placement root's parent
 * space, so a transformed parent cannot silently rescale declared damage: "12
 * units" has to mean 12 world units for every root or the bracket is not the
 * bracket the world-space layers use.
 */
function createOperations(pivotOffsets) {
  const basis = new THREE.Matrix3();
  const local = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const rotated = new THREE.Vector3();
  const spin = new THREE.Quaternion();

  /** Adds a world-space delta to an object's position, in its parent's space. */
  const shiftWorld = (object, dx, dy, dz) => {
    local.set(dx, dy, dz);
    if (object.parent) {
      basis.setFromMatrix4(object.parent.matrixWorld).invert();
      local.applyMatrix3(basis);
    }
    object.position.add(local);
  };

  return {
    translateWorld(objects, delta) {
      const restores = [];
      for (const object of objects) {
        const before = object.position.clone();
        shiftWorld(object, delta[0], delta[1], delta[2]);
        restores.push(() => object.position.copy(before));
      }
      return compose(restores);
    },

    /**
     * Scales about the root's own bounding-box centre, matching the world-space
     * bracket's `scaleEntities`.
     *
     * `object.scale` alone pivots on the root's transform origin, and an authored
     * placement's origin is not its geometry: scaling a horizon ridge whose
     * geometry sits 1400 units from its origin by one per cent displaces it by 14
     * units. Measured, that made `extent-1pct` report a per-group IoU of 0.685 and
     * up to 47 degrees of normal error on the ridges — severe damage wearing a
     * mild control's name. Because scaling by `f` about the origin maps a world
     * point `p` to `o + f(p - o)`, the correcting shift is exactly
     * `-(f - 1)(centre - o)`, and the offsets are captured once from the
     * undamaged scene rather than re-measured per camera.
     */
    scaleBy(objects, factor) {
      const restores = [];
      for (const object of objects) {
        const scaleBefore = object.scale.clone();
        const positionBefore = object.position.clone();
        object.scale.multiplyScalar(factor);
        const offset = pivotOffsets.get(object);
        if (offset) {
          shiftWorld(
            object,
            -(factor - 1) * offset[0],
            -(factor - 1) * offset[1],
            -(factor - 1) * offset[2],
          );
        }
        restores.push(() => {
          object.scale.copy(scaleBefore);
          object.position.copy(positionBefore);
        });
      }
      return compose(restores);
    },

    /**
     * Yaws about the root's own bounding-box centre, matching the world-space
     * bracket's `rotateEntities`, which turns each entity about its own anchor.
     *
     * Pivoting on the transform origin has the same defect as scaling did, and
     * worse: 0.02 radians swings a horizon ridge whose geometry sits 1400 units
     * from its origin through 28 units. Measured, that made the mild `yaw-0.02`
     * control report a per-group depth p95 of 12.26 world units, five times the
     * frozen `surface p95` limit, which is damage no reconstruction should be
     * asked to tolerate. Rotating about the origin maps `p` to `o + R(p - o)`
     * while rotating about the centre maps it to `c + R(p - c)`, so the
     * correcting shift is `(c - o) - R(c - o)`.
     */
    rotateY(objects, radians) {
      const restores = [];
      spin.setFromAxisAngle(WORLD_UP, radians);
      for (const object of objects) {
        const quaternionBefore = object.quaternion.clone();
        const positionBefore = object.position.clone();
        // Pre-multiplying turns the root about its parent's up rather than about
        // its own authored axes, so the damage is a yaw for every root whatever
        // orientation it was authored with.
        object.quaternion.premultiply(spin);
        const offset = pivotOffsets.get(object);
        if (offset) {
          pivot.set(offset[0], offset[1], offset[2]);
          rotated.copy(pivot).applyQuaternion(spin);
          shiftWorld(
            object,
            pivot.x - rotated.x,
            pivot.y - rotated.y,
            pivot.z - rotated.z,
          );
        }
        restores.push(() => {
          object.quaternion.copy(quaternionBefore);
          object.position.copy(positionBefore);
        });
      }
      return compose(restores);
    },

    hide(objects) {
      const restores = [];
      for (const object of objects) {
        if (!object.visible) continue;
        object.visible = false;
        restores.push(() => {
          object.visible = true;
        });
      }
      return compose(restores);
    },

    scaleMaterialColour(materials, factor) {
      const restores = [];
      for (const material of materials) {
        if (!material.color) continue;
        const before = material.color.clone();
        material.color.multiplyScalar(factor);
        restores.push(() => material.color.copy(before));
      }
      return compose(restores);
    },

    /**
     * A per-channel cast on the base colour. Because a base colour multiplies its
     * texture map, this reaches every surface while leaving the pattern intact —
     * which a uniform scale also does, and which replacing a colour with its own
     * luminance does not, since these materials are textured and their base
     * colours are white.
     */
    castMaterialColour(materials, factors) {
      const restores = [];
      for (const material of materials) {
        if (!material.color) continue;
        const before = material.color.clone();
        material.color.r *= factors[0];
        material.color.g *= factors[1];
        material.color.b *= factors[2];
        restores.push(() => material.color.copy(before));
      }
      return compose(restores);
    },

    setMaterialColour(materials, hex) {
      const restores = [];
      for (const material of materials) {
        if (!material.color) continue;
        const before = material.color.clone();
        material.color.setHex(hex);
        restores.push(() => material.color.copy(before));
      }
      return compose(restores);
    },
  };
}

/**
 * Placement roots and materials, indexed by the same classification the
 * measurement uses.
 *
 * Deriving the damage targets from `buildReferenceSemanticIndex` rather than
 * from a second traversal is deliberate: if the two disagreed, a control would
 * damage one set of objects while the metric reported on another, and the
 * threshold would be calibrated against damage nothing measured.
 */
function buildDamageTargets(semanticIndex) {
  const rootsByGroup = new Map();
  const materialsByFamily = new Map();
  const allMaterials = new Set();
  const terrainRoots = new Set();
  const familyOfMaterial = new Map();

  const materialsOf = (object) =>
    Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];

  for (const [mesh, entry] of semanticIndex) {
    if (entry.root && entry.group) {
      if (!rootsByGroup.has(entry.group)) rootsByGroup.set(entry.group, new Set());
      rootsByGroup.get(entry.group).add(entry.root);
    }
    // The terrain and the Ocean Appearance Surface share the `geography` group;
    // only the relief-carrying plane is the terrain. Both conditions are needed:
    // eleven authored village placements also resolve to the `terrain-ground`
    // Material Family, and selecting on the family alone would make a control
    // named for the terrain raise a handful of village slabs with it.
    if (entry.root && entry.group === "geography" && entry.material === "terrain-ground") {
      terrainRoots.add(entry.root);
    }

    for (const material of materialsOf(mesh)) {
      allMaterials.add(material);
      if (!entry.material) continue;
      if (!materialsByFamily.has(entry.material)) materialsByFamily.set(entry.material, new Set());
      materialsByFamily.get(entry.material).add(material);
      if (!familyOfMaterial.has(material)) familyOfMaterial.set(material, new Set());
      familyOfMaterial.get(material).add(entry.material);
    }
  }

  // A material object shared by two Material Families cannot be recoloured for
  // one without changing the other. That is a property of the authored scene,
  // not of the harness, so it is reported rather than worked around.
  const sharedMaterials = [...familyOfMaterial]
    .filter(([, families]) => families.size > 1)
    .map(([, families]) => [...families].sort().join("+"));

  // Where each root's geometry sits relative to its transform origin, measured
  // once from the undamaged scene. This is what lets a scale pivot on the
  // geometry instead of on the origin.
  const pivotOffsets = new Map();
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  const origin = new THREE.Vector3();
  for (const roots of rootsByGroup.values()) {
    for (const root of roots) {
      if (pivotOffsets.has(root)) continue;
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      if (box.isEmpty() || !Number.isFinite(box.min.x)) continue;
      box.getCenter(centre);
      origin.setFromMatrixPosition(root.matrixWorld);
      pivotOffsets.set(root, [centre.x - origin.x, centre.y - origin.y, centre.z - origin.z]);
    }
  }

  return {
    rootsIn: (group) => [...(rootsByGroup.get(group) ?? [])],
    terrainRoots: () => [...terrainRoots],
    materialsIn: (family) => [...(materialsByFamily.get(family) ?? [])],
    allMaterials: () => [...allMaterials],
    ops: createOperations(pivotOffsets),
    inventory: {
      rootsByGroup: Object.fromEntries(
        [...rootsByGroup].map(([group, roots]) => [group, roots.size]).sort(),
      ),
      terrainRoots: terrainRoots.size,
      materials: allMaterials.size,
      materialsByFamily: Object.fromEntries(
        [...materialsByFamily].map(([family, set]) => [family, set.size]).sort(),
      ),
      familiesSharingAMaterial: [...new Set(sharedMaterials)].sort(),
    },
  };
}

/**
 * A numeric snapshot of everything a control is allowed to touch, so the restore
 * can be checked rather than trusted.
 */
function snapshotTargets(targets, scene) {
  // One recursive update for the whole scene, not one per root. Forcing the
  // update from each of 616 roots re-walks that root's entire subtree every time,
  // which on this scene costs more than the renders the snapshot exists to guard.
  scene.updateMatrixWorld(true);
  const rows = [];
  const seen = new Set();
  for (const group of SEMANTIC_GROUPS) {
    for (const root of targets.rootsIn(group)) {
      if (seen.has(root)) continue;
      seen.add(root);
      rows.push({ object: root, matrix: root.matrixWorld.elements.slice(), visible: root.visible });
    }
  }
  const colours = targets
    .allMaterials()
    .filter((material) => material.color)
    .map((material) => ({ material, rgb: [material.color.r, material.color.g, material.color.b] }));
  return { rows, colours };
}

function auditRestore(snapshot, scene) {
  scene.updateMatrixWorld(true);
  const failures = [];
  for (const row of snapshot.rows) {
    const delta = matrixDelta(row.object.matrixWorld.elements, row.matrix);
    if (!(delta <= 1e-9)) {
      failures.push(`${row.object.name || "unnamed root"} world matrix off by ${delta}`);
    }
    if (row.object.visible !== row.visible) {
      failures.push(`${row.object.name || "unnamed root"} visibility was not restored`);
    }
  }
  for (const entry of snapshot.colours) {
    const { r, g, b } = entry.material.color;
    const delta = Math.max(
      Math.abs(r - entry.rgb[0]),
      Math.abs(g - entry.rgb[1]),
      Math.abs(b - entry.rgb[2]),
    );
    if (!(delta <= 1e-9)) {
      failures.push(`${entry.material.name || "unnamed material"} colour off by ${delta}`);
    }
  }
  return failures;
}

function identicalBuffers(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function main() {
  const query = new URLSearchParams(location.search);
  const requested = (query.get("controls") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (requested.length === 0) throw new Error("no controls were requested");
  const controls = requested.map(findControl);

  const cameraSet = await fetch(
    "/dev-tools/reference/baselines/reference-camera-set-v2.json",
  ).then((response) => response.json());
  const width = 1440;
  const height = 810;

  const needsGeometry = controls.some((control) => control.needs.includes("geometry"));
  const needsAppearance = controls.some((control) => control.needs.includes("appearance"));

  const island = await new Promise((resolve, reject) => {
    const poll = () => {
      if (window.island?.error) {
        reject(new Error(window.island.error));
        return;
      }
      if (window.island?.ready && window.island.scene && window.island.camera) {
        resolve(window.island);
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });

  calibration.status = "awaiting-reference-renderer";
  await new Promise((resolve) => {
    const poll = () => {
      if (referenceRenderObjects?.renderer && referenceRenderObjects?.composer) resolve();
      else requestAnimationFrame(poll);
    };
    poll();
  });
  calibration.status = "capturing";

  const renderer = referenceRenderObjects.renderer;
  const target = createTarget(width, height);
  const semanticIndex = buildReferenceSemanticIndex(island.scene);
  const targets = buildDamageTargets(semanticIndex);
  const semanticMaterials = new Map(
    SEMANTIC_GROUPS.map((group, index) => [index + 1, semanticMaterial(index + 1)]),
  );
  const materialFamilyMaterials = new Map(
    MATERIAL_FAMILIES.map((family, index) => [index + 1, semanticMaterial(index + 1)]),
  );
  const unclassifiedMaterial = semanticMaterial(0);

  const isBackdrop = (object) => {
    const group = semanticIndex.get(object)?.group;
    return group === "sky" || group === "cloud";
  };
  const chooseSemantic = (object) =>
    semanticMaterials.get(groupIndex(semanticIndex.get(object)?.group)) ?? unclassifiedMaterial;
  const chooseFamily = (object) =>
    materialFamilyMaterials.get(materialFamilyIndex(semanticIndex.get(object)?.material)) ??
    unclassifiedMaterial;

  const protocol = [];
  const viewsByControl = new Map(controls.map((control) => [control.id, []]));
  const restoreFailures = [];
  let restoredFrameIdentical = true;

  for (const [name, frozen] of cameraEntries(cameraSet)) {
    const { camera, up: frozenUp, protocol: cameraProtocol } = frozenCamera(
      frozen,
      width,
      height,
    );
    DEPTH_MATERIAL.uniforms.near.value = camera.near;
    DEPTH_MATERIAL.uniforms.far.value = camera.far;

    const auxiliary = (pass) =>
      withPassMaterials(
        island.scene,
        pass === "silhouette"
          ? () => SILHOUETTE_MATERIAL
          : pass === "semantic"
            ? chooseSemantic
            : pass === "materialFamily"
              ? chooseFamily
              : pass === "linearDepth"
                ? () => DEPTH_MATERIAL
                : () => NORMAL_MATERIAL,
        () => readTarget(renderer, target, island.scene, camera, width, height),
        isBackdrop,
      );

    // The native lit capture goes through the reference's own composer, driven
    // only by its existing public camera control, exactly as acceptance does it.
    const referenceUp = island.camera.up.clone();
    const lit = () => {
      island.camera.up.fromArray(frozenUp);
      island.setCamera(...frozen.position, ...frozen.target);
      island.camera.updateMatrixWorld(true);
      const delta = frozen.viewMatrix
        ? round(matrixDelta(island.camera.matrixWorldInverse.elements, frozen.viewMatrix), 9)
        : 0;
      referenceRenderObjects.composer.render();
      const pixels = readCanvas(renderer.domElement, width, height);
      island.camera.up.copy(referenceUp);
      return { pixels, delta };
    };

    const geometryPasses = ["silhouette", "semantic", "linearDepth", "worldNormal"];
    const undamaged = {};
    if (needsGeometry) {
      for (const pass of geometryPasses) undamaged[pass] = auxiliary(pass);
    }
    if (needsAppearance) {
      // Region and family masks come from the undamaged reference, like the group
      // masks in acceptance: the question is how the damaged scene renders where
      // the authored one put a given group or material.
      undamaged.semantic ??= auxiliary("semantic");
      undamaged.materialFamily = auxiliary("materialFamily");
    }
    const undamagedLit = needsAppearance ? lit() : null;
    protocol.push({
      camera: name,
      ...cameraProtocol,
      ...(undamagedLit ? { referenceViewMatrixDelta: undamagedLit.delta } : {}),
    });

    const regions = needsAppearance ? regionMasks(decodeSemantic(undamaged.semantic)) : null;
    const families = needsAppearance
      ? labelMasks(decodeSemantic(undamaged.materialFamily), MATERIAL_FAMILY_LABELS)
      : null;
    const undamagedIds = needsGeometry ? decodeSemantic(undamaged.semantic) : null;
    const undamagedMask = needsGeometry ? binaryMask(undamaged.silhouette) : null;

    for (const control of controls) {
      const snapshot = snapshotTargets(targets, island.scene);
      const restore = applyControl(control, targets);
      island.scene.updateMatrixWorld(true);

      const view = { camera: name };
      if (control.needs.includes("geometry")) {
        const damaged = {};
        for (const pass of geometryPasses) damaged[pass] = auxiliary(pass);
        const damagedIds = decodeSemantic(damaged.semantic);
        const damagedMask = binaryMask(damaged.silhouette);
        const sharedMask = new Uint8Array(undamagedMask.length);
        for (let index = 0; index < sharedMask.length; index += 1) {
          sharedMask[index] = undamagedMask[index] && damagedMask[index] ? 1 : 0;
        }
        view.sharedPixels = sharedMask.reduce((sum, value) => sum + value, 0);
        view.silhouette = silhouetteEvidence(
          undamaged.silhouette,
          damaged.silhouette,
          width,
          height,
        );
        view.depth = depthEvidence(
          undamaged.linearDepth,
          damaged.linearDepth,
          width,
          height,
          camera.near,
          camera.far,
          sharedMask,
        );
        view.worldNormal = worldNormalEvidence(
          undamaged.worldNormal,
          damaged.worldNormal,
          width,
          height,
          sharedMask,
          {
            referenceDepth: undamaged.linearDepth,
            candidateDepth: damaged.linearDepth,
            near: camera.near,
            far: camera.far,
          },
        );
        view.semantic = semanticEvidence(undamagedIds, damagedIds, SEMANTIC_LABELS);
        view.byGroup = groupGeometryEvidence({
          referenceIds: undamagedIds,
          candidateIds: damagedIds,
          referenceDepth: undamaged.linearDepth,
          candidateDepth: damaged.linearDepth,
          referenceNormal: undamaged.worldNormal,
          candidateNormal: damaged.worldNormal,
          width,
          height,
          near: camera.near,
          far: camera.far,
          labels: SEMANTIC_LABELS,
        });
      }
      if (control.needs.includes("appearance")) {
        view.appearance = appearanceEvidence(
          undamagedLit.pixels,
          lit().pixels,
          width,
          height,
          regions,
          families,
        );
      }

      restore();
      for (const failure of auditRestore(snapshot, island.scene)) {
        restoreFailures.push(`${name}/${control.id}: ${failure}`);
      }
      viewsByControl.get(control.id).push(view);
      calibration.progress = `${name} ${control.id}`;
    }

    // Proving the restore put the pixels back, not just the numbers. Without
    // this every control after the first would be measured against whatever the
    // previous control left behind.
    if (needsGeometry) {
      if (!identicalBuffers(undamaged.silhouette, auxiliary("silhouette"))) {
        restoredFrameIdentical = false;
        restoreFailures.push(`${name}: the re-captured silhouette differs after restoring`);
      }
    } else if (needsAppearance) {
      if (!identicalBuffers(undamagedLit.pixels, lit().pixels)) {
        restoredFrameIdentical = false;
        restoreFailures.push(`${name}: the re-captured lit frame differs after restoring`);
      }
    }
  }

  target.dispose();

  calibration.report = {
    schemaVersion: "fixed-camera-calibration-v1",
    perturbationSchema: SCENE_GRAPH_PERTURBATION_SCHEMA,
    capture: {
      cssViewport: [width, height],
      framebuffer: [width, height],
      deviceScaleFactor: window.devicePixelRatio,
      momentMs: window.__frozenObservationClock?.momentMs ?? null,
    },
    protocol,
    mutation: {
      declared: true,
      subject: "the reference's own scene graph, damaged by declared reference-only controls",
      restored: true,
      restoreVerified: restoreFailures.length === 0,
      restoredFrameIdentical,
      restoreFailures,
    },
    subjects: {
      candidateBuilt: false,
      candidateModulesLoaded: [],
      referenceRenderer: "authored composer",
      note: "Both sides of every comparison are the reference. The undamaged capture stands in for the reference and the damaged capture for a candidate, so the metrics are the acceptance metrics unchanged.",
    },
    inventory: targets.inventory,
    controls: controls.map((control) => ({
      id: control.id,
      class: control.class,
      needs: control.needs,
      detects: control.detects ?? [],
      note: control.note ?? null,
      views: viewsByControl.get(control.id),
      aggregate: aggregateCameras(viewsByControl.get(control.id)),
    })),
  };
  calibration.status = "ready";
}

calibration.complete = () => ({
  status: calibration.status,
  report: calibration.report ?? null,
  error: calibration.error,
});

main().catch((error) => {
  calibration.status = "error";
  calibration.error = String(error?.stack ?? error);
});
