import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

import { ISLAND_SCENE_RECIPE } from "/src/reconstruction/scene/island-scene-recipe.generated.js";
import { createEnvironmentComposer } from "/src/reconstruction/scene/environment-postprocessing.js";
import { generateScene } from "/src/reconstruction/scene/scene-generator.js";
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
  previewPng,
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
 *
 * The pass encodings, the frozen-camera reconstruction, and the reference's
 * classification all come from `browser-scene-pass-kit.mjs`, which the
 * calibration run imports too. A threshold is only comparable to the result it
 * gates if both were produced by the same encoding.
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

/** The candidate records its own family on the placement holder. */
function materialFamilyOf(object) {
  let node = object;
  while (node) {
    if (typeof node.userData?.materialFamily === "string") return node.userData.materialFamily;
    const id = node.userData?.semanticId;
    if (id === "environment/ocean-appearance-surface") return "ocean-surface";
    if (id === "environment/terrain") return "terrain-ground";
    if (id === "environment/sky") return null;
    node = node.parent;
  }
  return null;
}

async function main() {
  const contractResponse = await fetch(
    "/dev-tools/reference/baselines/reference-camera-set-v2.json",
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

  // The candidate's own post-processing chain, generated from its own Environment
  // Recipe. Both subjects now reach their native lit capture through a composer,
  // so the appearance comparison is between two graded frames rather than between
  // a graded frame and a raw one.
  const candidatePost = createEnvironmentComposer({
    renderer: candidateRenderer,
    scene: candidateScene,
    camera: null,
    environment,
    size: [width, height],
  });

  // One render target per renderer context. Both write raw values into a
  // NoColorSpace target with tone mapping disabled, so the two encodings match.
  const referenceTarget = createTarget(width, height);
  const candidateTarget = createTarget(width, height);
  const referenceSemantic = buildReferenceSemanticIndex(island.scene);
  const semanticMaterials = new Map(
    SEMANTIC_GROUPS.map((group, index) => [index + 1, semanticMaterial(index + 1)]),
  );
  const materialFamilyMaterials = new Map(
    MATERIAL_FAMILIES.map((family, index) => [index + 1, semanticMaterial(index + 1)]),
  );
  const unclassifiedMaterial = semanticMaterial(0);

  const views = [];
  const previews = {};
  const protocol = [];

  for (const [name, frozen] of cameraEntries(cameraSet)) {
    const { camera, up: frozenUp, protocol: cameraProtocol } = frozenCamera(
      frozen,
      width,
      height,
    );
    protocol.push({ camera: name, ...cameraProtocol });

    DEPTH_MATERIAL.uniforms.near.value = camera.near;
    DEPTH_MATERIAL.uniforms.far.value = camera.far;

    const capture = (renderer, target, scene, semanticChooser, isSky, materialChooser) => ({
      silhouette: withPassMaterials(scene, () => SILHOUETTE_MATERIAL, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
      semantic: withPassMaterials(scene, semanticChooser, () =>
        readTarget(renderer, target, scene, camera, width, height),
        isSky,
      ),
      materialFamily: withPassMaterials(scene, materialChooser, () =>
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

    const chooseReferenceSemantic = (object) => {
      const placement = referenceSemantic.get(object);
      return semanticMaterials.get(groupIndex(placement?.group)) ?? unclassifiedMaterial;
    };

    // A second semantic index over the same frame that keeps the sky shell, used
    // only for appearance region masks.
    //
    // The auxiliary geometry passes hide the backdrops, because a shell that fills
    // every frame for both subjects would make silhouette, depth, and normal
    // evidence report perfect agreement regardless of the island. But the sky is
    // present in the native lit capture, and taking the appearance regions from
    // the backdrop-free pass left `sky` with no mask at all: the atmosphere was
    // inside the global mean and attributable to nothing, so the ticket that exists
    // to fix the atmosphere had no measurement of it. Sprites stay hidden here
    // because a cloud sprite cannot take a mesh pass material, so cloud pixels
    // remain unattributed and are reported as such.
    const referenceSkyAwareSemantic = withPassMaterials(
      island.scene,
      chooseReferenceSemantic,
      () => readTarget(
        referenceRenderObjects.renderer,
        referenceTarget,
        island.scene,
        camera,
        width,
        height,
      ),
      () => false,
    );

    const referencePasses = capture(
      referenceRenderObjects.renderer,
      referenceTarget,
      island.scene,
      chooseReferenceSemantic,
      (object) => {
        const group = referenceSemantic.get(object)?.group;
        return group === "sky" || group === "cloud";
      },
      (object) => {
        const placement = referenceSemantic.get(object);
        return (
          materialFamilyMaterials.get(materialFamilyIndex(placement?.material)) ??
          unclassifiedMaterial
        );
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
      (object) =>
        materialFamilyMaterials.get(materialFamilyIndex(materialFamilyOf(object))) ??
        unclassifiedMaterial,
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

    // The candidate renders through its own Environment Recipe, including its own
    // generated post-processing chain.
    candidatePost.setCamera(camera);
    candidatePost.render();
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
        {
          referenceDepth: referencePasses.linearDepth,
          candidateDepth: candidatePasses.linearDepth,
          near: camera.near,
          far: camera.far,
        },
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
        // Regions from the sky-aware index, so the atmosphere is attributable.
        regionMasks(decodeSemantic(referenceSkyAwareSemantic)),
        // Family masks come from the reference, like the group masks: the
        // question is how the candidate renders where the authored scene put a
        // given material, not where the candidate thinks it put one.
        labelMasks(
          decodeSemantic(referencePasses.materialFamily),
          MATERIAL_FAMILY_LABELS,
        ),
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
      appearanceRegionAttribution: [
        "sky: attributed, from a second semantic index over the same frame that keeps the sky shell. The geometry passes still exclude it.",
        "cloud: not attributed. A cloud sprite cannot take a mesh pass material, so its pixels fall outside every region mask while remaining inside the global appearance mean.",
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
