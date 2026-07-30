import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

import { ISLAND_SCENE_RECIPE } from "/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "/src/reconstruction/scene/scene-generator.js";
import { familyKey, resolveFamily } from "/dev-tools/reconstruction/scene-families.mjs";
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

/**
 * Fixed scene passes and native appearance.
 *
 * Hosts the Assembled Authored Scene and the real generated candidate in one
 * context so every pass is pixel-aligned by construction, then renders both
 * through the exact frozen camera matrices at the Normative Scene Capture size.
 *
 * The reference's native lit RGB comes from its own renderer and composer,
 * driven only through its existing public camera control, so post-processing,
 * atmosphere, and materials stay authored. The candidate's native lit RGB comes
 * from its own independently generated Environment Recipe. Neither subject ever
 * receives the other's lighting.
 *
 * The auxiliary semantic, silhouette, depth, and normal passes are a Reference
 * Analysis Projection: an independent off-screen render of the same scene
 * graph, never presented as an authored rendering.
 */

const passes = { status: "loading", error: null, complete: null };
window.scenePasses = passes;
Object.defineProperty(window, "__scenePassTypes", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({ WebGLRenderer: THREE.WebGLRenderer, EffectComposer }),
});

/**
 * The reference's own renderer and composer, handed in by the development
 * harness.
 *
 * Rendering the assembled scene through a second WebGL context would re-upload
 * every authored geometry and texture, so the auxiliary passes reuse the
 * renderer that already holds them, and the native capture goes through the
 * authored composer. Neither is reconfigured.
 */
let referenceRenderObjects = null;
passes.attachReferenceRenderer = ({ renderer, composer }) => {
  referenceRenderObjects = { renderer, composer };
  return { attached: true };
};

const SEMANTIC_GROUPS = [
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
];
const SEMANTIC_LABELS = Object.fromEntries(
  SEMANTIC_GROUPS.map((group, index) => [index + 1, group]),
);

function groupIndex(group) {
  const index = SEMANTIC_GROUPS.indexOf(group);
  return index < 0 ? 0 : index + 1;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return String(value);
  const result = Number(value.toFixed(digits));
  return Object.is(result, -0) ? 0 : result;
}

function createTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
}

const SILHOUETTE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  fog: false,
  toneMapped: false,
});

function semanticMaterial(index) {
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  // A coarse lattice so decoding survives any colour-space rounding.
  material.color.setRGB((index * 20) / 255, 0, 0, THREE.LinearSRGBColorSpace);
  return material;
}

const DEPTH_MATERIAL = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { near: { value: 0.5 }, far: { value: 30000 } },
  vertexShader: `
    varying float vViewDepth;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
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

const NORMAL_MATERIAL = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec3 vWorldNormal;
    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vWorldNormal;
    void main() {
      gl_FragColor = vec4(normalize(vWorldNormal) * 0.5 + 0.5, 1.0);
    }
  `,
});

function readTarget(renderer, target, scene, camera, width, height) {
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  return flipVertically(pixels, width, height);
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

/**
 * Swaps in a pass material for every mesh and restores the exact original
 * references afterwards, so no authored material is modified.
 *
 * The sky shell is hidden for the auxiliary passes. It is a backdrop that fills
 * every frame for both subjects, so leaving it in would make silhouette,
 * depth, and normal evidence say the two scenes agree perfectly no matter what
 * the island looks like. It stays fully present in the native lit capture.
 */
function withPassMaterials(scene, chooser, run, isBackdrop) {
  const restore = [];
  const hidden = [];
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
  });
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = null;
  scene.fog = null;
  try {
    return run();
  } finally {
    for (const [object, material] of restore) object.material = material;
    for (const object of hidden) object.visible = true;
    scene.background = previousBackground;
    scene.fog = previousFog;
  }
}

function readCanvas(canvas, width, height) {
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const context = copy.getContext("2d", { willReadFrequently: true });
  context.drawImage(canvas, 0, 0, width, height);
  return new Uint8Array(context.getImageData(0, 0, width, height).data);
}

/**
 * Environment layers are named for what they are, not for which module built
 * them: the generated sea surface is geography just like the reference's, and
 * the sky shell is the sky backdrop for both.
 */
const CANDIDATE_ENVIRONMENT_GROUPS = {
  "environment/ocean-appearance-surface": "geography",
  "environment/sky": "sky",
};

function semanticGroupOf(object) {
  let node = object;
  while (node) {
    const id = node.userData?.semanticId;
    if (typeof id === "string" && CANDIDATE_ENVIRONMENT_GROUPS[id]) {
      return CANDIDATE_ENVIRONMENT_GROUPS[id];
    }
    if (node.userData?.semanticGroup) return node.userData.semanticGroup;
    if (typeof id === "string" && id.includes("/")) return id.split("/")[0];
    node = node.parent;
  }
  return null;
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
 */
function buildReferenceSemanticIndex(scene) {
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

  scene.traverse((object) => {
    if (!object.isMesh && !object.isPoints && !object.isLine && !object.isSprite) return;
    const placement = placementRootOf(object);
    if (placement?.wildlife) {
      byMesh.set(object, "wildlife");
      return;
    }
    if (placement?.village) {
      bounds.setFromObject(placement.root);
      bounds.getSize(size);
      try {
        // familyKey reads a full "index:type:name" evidence segment.
        const family = familyKey(`::${stable(placement.root.name)}`);
        byMesh.set(object, resolveFamily(family, [size.x, size.y, size.z]).group);
      } catch {
        byMesh.set(object, null);
      }
      return;
    }
    // Root-level layers, classified by measured extent exactly as coverage does.
    if (object.isSprite) {
      byMesh.set(object, "cloud");
      return;
    }
    if (object.isInstancedMesh) {
      byMesh.set(object, "cover");
      return;
    }
    bounds.setFromObject(object);
    if (!Number.isFinite(bounds.min.x)) {
      byMesh.set(object, null);
      return;
    }
    bounds.getSize(size);
    if (size.x >= 10000 && size.z >= 10000 && size.y > 1) byMesh.set(object, "sky");
    else if (size.x > 700 && size.z > 700) byMesh.set(object, "geography");
    else byMesh.set(object, null);
  });
  return byMesh;
}

function decodeSemantic(rgba) {
  const ids = new Uint8Array(rgba.length / 4);
  for (let index = 0; index < ids.length; index += 1) {
    ids[index] = Math.round(rgba[index * 4] / 20);
  }
  return ids;
}

function regionMasks(semanticIds) {
  const masks = {};
  for (const [id, label] of Object.entries(SEMANTIC_LABELS)) {
    const numeric = Number(id);
    const mask = new Uint8Array(semanticIds.length);
    let any = false;
    for (let index = 0; index < semanticIds.length; index += 1) {
      if (semanticIds[index] === numeric) {
        mask[index] = 1;
        any = true;
      }
    }
    if (any) masks[label] = mask;
  }
  return masks;
}

async function previewPng(rgba, width, height, scale = 4) {
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

function matrixDelta(actual, expected) {
  return Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
}

async function main() {
  const contractResponse = await fetch(
    "/dev-tools/reference/baselines/reference-camera-set-v1.json",
  );
  const cameraSet = await contractResponse.json();
  const width = 1440;
  const height = 810;

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

  // Only once the reference has built its renderer and composer can the harness
  // hand them over; asking earlier would find nothing to attach.
  passes.status = "awaiting-reference-renderer";
  await new Promise((resolve) => {
    const poll = () => {
      if (referenceRenderObjects?.renderer && referenceRenderObjects?.composer) resolve();
      else requestAnimationFrame(poll);
    };
    poll();
  });
  passes.status = "capturing";

  const generated = generateScene(ISLAND_SCENE_RECIPE);
  const candidateScene = new THREE.Scene();
  candidateScene.add(generated.root);
  const environment = generated.environment;
  candidateScene.fog = new THREE.Fog(
    environment.fog.color,
    environment.fog.near,
    environment.fog.far,
  );

  // The candidate renders through its own Environment Recipe. It never borrows
  // the reference's renderer state, materials, or lights.
  const candidateRenderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  candidateRenderer.setPixelRatio(1);
  candidateRenderer.setSize(width, height);
  candidateRenderer.outputColorSpace = THREE.SRGBColorSpace;
  candidateRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  candidateRenderer.toneMappingExposure = environment.renderer.exposure;
  candidateRenderer.shadowMap.enabled = true;
  candidateRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // One render target per renderer context. Both write raw values into a
  // NoColorSpace target with tone mapping disabled, so the two encodings match.
  const referenceTarget = createTarget(width, height);
  const candidateTarget = createTarget(width, height);
  const referenceSemantic = buildReferenceSemanticIndex(island.scene);
  const semanticMaterials = new Map(
    SEMANTIC_GROUPS.map((group, index) => [index + 1, semanticMaterial(index + 1)]),
  );
  const unclassifiedMaterial = semanticMaterial(0);

  const cameraEntries = [
    ["authoredOverview", cameraSet.authoredOverview],
    ["topDown", cameraSet.topDown],
    ...Object.entries(cameraSet.obliques).map(([name, camera]) => [`oblique-${name}`, camera]),
  ];

  const views = [];
  const previews = {};
  const protocol = [];

  for (const [name, frozen] of cameraEntries) {
    const camera = new THREE.PerspectiveCamera(
      frozen.verticalFovDegrees ?? frozen.fov,
      frozen.aspect ?? width / height,
      frozen.near,
      frozen.far,
    );
    // The frozen top-down camera declares a non-default up, because looking
    // straight down leaves the roll undefined against world up. Honouring the
    // frozen up is what makes the reproduced view matrix exact.
    const frozenUp = frozen.up ?? [0, 1, 0];
    camera.up.fromArray(frozenUp);
    camera.position.fromArray(frozen.position);
    camera.lookAt(...frozen.target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    // Protocol: the camera we render with must reproduce the frozen matrices.
    const viewDelta = frozen.viewMatrix
      ? matrixDelta(camera.matrixWorldInverse.elements, frozen.viewMatrix)
      : 0;
    const projectionDelta = frozen.projectionMatrix
      ? matrixDelta(camera.projectionMatrix.elements, frozen.projectionMatrix)
      : 0;
    protocol.push({
      camera: name,
      viewMatrixDelta: round(viewDelta, 9),
      projectionMatrixDelta: round(projectionDelta, 9),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: round(camera.aspect, 9),
      framebuffer: [width, height],
    });

    DEPTH_MATERIAL.uniforms.near.value = camera.near;
    DEPTH_MATERIAL.uniforms.far.value = camera.far;

    const capture = (renderer, target, scene, semanticChooser, isSky) => ({
      silhouette: withPassMaterials(scene, () => SILHOUETTE_MATERIAL, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
      semantic: withPassMaterials(scene, semanticChooser, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
      linearDepth: withPassMaterials(scene, () => DEPTH_MATERIAL, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
      worldNormal: withPassMaterials(scene, () => NORMAL_MATERIAL, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
    });

    const referencePasses = capture(
      referenceRenderObjects.renderer,
      referenceTarget,
      island.scene,
      (object) => {
        const placement = referenceSemantic.get(object);
        return semanticMaterials.get(groupIndex(placement)) ?? unclassifiedMaterial;
      },
      (object) => {
        const group = referenceSemantic.get(object);
        return group === "sky" || group === "cloud";
      },
    );
    const candidatePasses = capture(
      candidateRenderer,
      candidateTarget,
      candidateScene,
      (object) => {
        const group = semanticGroupOf(object);
        return semanticMaterials.get(groupIndex(group)) ?? unclassifiedMaterial;
      },
      (object) => {
        const id = object.userData?.semanticId;
        if (id === "environment/sky") return true;
        let node = object;
        while (node) {
          if (typeof node.userData?.semanticId === "string" && node.userData.semanticId.includes("cloud")) {
            return true;
          }
          node = node.parent;
        }
        return false;
      },
    );

    // Native lit RGB: the reference through its own renderer and composer, so
    // its bloom, grading, vignette, atmosphere, and materials stay authored, and
    // it is driven only by the existing public camera control.
    const referenceUp = island.camera.up.clone();
    island.camera.up.fromArray(frozenUp);
    island.setCamera(...frozen.position, ...frozen.target);
    island.camera.updateMatrixWorld(true);
    // The subject that produces the native capture must reproduce the frozen
    // view too, otherwise the appearance comparison is between two framings.
    protocol.at(-1).referenceViewMatrixDelta = frozen.viewMatrix
      ? round(matrixDelta(island.camera.matrixWorldInverse.elements, frozen.viewMatrix), 9)
      : 0;
    referenceRenderObjects.composer.render();
    const referenceLit = readCanvas(
      referenceRenderObjects.renderer.domElement,
      width,
      height,
    );

    // The candidate renders through its own Environment Recipe.
    candidateRenderer.render(candidateScene, camera);
    const candidateLit = readCanvas(candidateRenderer.domElement, width, height);
    island.camera.up.copy(referenceUp);

    const referenceIds = decodeSemantic(referencePasses.semantic);
    const candidateIds = decodeSemantic(candidatePasses.semantic);
    const referenceMask = binaryMask(referencePasses.silhouette);
    const candidateMask = binaryMask(candidatePasses.silhouette);
    const sharedMask = new Uint8Array(referenceMask.length);
    for (let index = 0; index < sharedMask.length; index += 1) {
      sharedMask[index] = referenceMask[index] && candidateMask[index] ? 1 : 0;
    }

    views.push({
      camera: name,
      sharedPixels: sharedMask.reduce((sum, value) => sum + value, 0),
      silhouette: silhouetteEvidence(
        referencePasses.silhouette,
        candidatePasses.silhouette,
        width,
        height,
      ),
      depth: depthEvidence(
        referencePasses.linearDepth,
        candidatePasses.linearDepth,
        width,
        height,
        camera.near,
        camera.far,
        sharedMask,
      ),
      worldNormal: worldNormalEvidence(
        referencePasses.worldNormal,
        candidatePasses.worldNormal,
        width,
        height,
        sharedMask,
      ),
      semantic: semanticEvidence(referenceIds, candidateIds, SEMANTIC_LABELS),
      byGroup: groupGeometryEvidence({
        referenceIds,
        candidateIds,
        referenceDepth: referencePasses.linearDepth,
        candidateDepth: candidatePasses.linearDepth,
        referenceNormal: referencePasses.worldNormal,
        candidateNormal: candidatePasses.worldNormal,
        width,
        height,
        near: camera.near,
        far: camera.far,
        labels: SEMANTIC_LABELS,
      }),
      appearance: appearanceEvidence(
        referenceLit,
        candidateLit,
        width,
        height,
        regionMasks(referenceIds),
      ),
    });

    previews[name] = {
      referenceLitRgb: await previewPng(referenceLit, width, height),
      candidateLitRgb: await previewPng(candidateLit, width, height),
      referenceSilhouette: await previewPng(referencePasses.silhouette, width, height),
      candidateSilhouette: await previewPng(candidatePasses.silhouette, width, height),
      referenceSemantic: await previewPng(referencePasses.semantic, width, height),
      candidateSemantic: await previewPng(candidatePasses.semantic, width, height),
      referenceWorldNormal: await previewPng(referencePasses.worldNormal, width, height),
      candidateWorldNormal: await previewPng(candidatePasses.worldNormal, width, height),
    };
  }

  candidateRenderer.dispose();
  referenceTarget.dispose();
  candidateTarget.dispose();

  passes.report = {
    schemaVersion: "scene-pass-evidence-v1",
    capture: {
      cssViewport: [width, height],
      framebuffer: [width, height],
      deviceScaleFactor: window.devicePixelRatio,
      momentMs: window.__frozenObservationClock?.momentMs ?? null,
    },
    protocol,
    subjects: {
      // Each subject renders through its own materials, lights, and
      // post-processing, and each camera comes from the frozen set.
      sharedLighting: false,
      referenceMutated: false,
      candidateReframed: false,
      referenceRenderer: "authored composer",
      candidateRenderer: "generated Environment Recipe",
      auxiliaryPassExclusions: [
        "sky shell and cloud sprites: atmospheric backdrops that fill every frame for both subjects, so leaving them in would report perfect agreement regardless of the island. Both are fully present in the native lit capture.",
      ],
    },
    views,
    aggregate: aggregateCameras(views),
  };
  passes.previews = previews;
  passes.status = "ready";
}

passes.complete = () => ({
  status: passes.status,
  report: passes.report ?? null,
  error: passes.error,
});
passes.takePreviews = () => passes.previews ?? null;

main().catch((error) => {
  passes.status = "error";
  passes.error = String(error?.stack ?? error);
});
