import { LAB_SCENE } from "../single-mesh-lab/scene-config.js";
import {
  createStage15Assembly,
  STAGE_1_5_LAYOUT_VERSION,
} from "../src/reconstruction/stage-1-5-layout.js";

const STAGE_1_5_OBJECT_IDS = Object.freeze([
  "stone-path",
  "stone",
  "vase",
  "umbrella",
]);

function canonicalName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9._]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
}

function findUniqueSourceMesh(authoredVillage, sourceNode) {
  const matches = [];
  const expectedName = canonicalName(sourceNode);
  authoredVillage.traverse((object) => {
    if (object.isMesh && canonicalName(object.name) === expectedName) {
      matches.push(object);
    }
  });
  if (matches.length !== 1) {
    throw new Error(
      `Stage 1.5 expected exactly one authored mesh for ${sourceNode}; found ${matches.length}.`,
    );
  }
  return matches[0];
}

export function mountStage15Composite({ scene, authoredVillage }) {
  if (!scene || !authoredVillage) {
    throw new Error("Stage 1.5 requires the loaded authored reference scene.");
  }

  const sourceSpecs = STAGE_1_5_OBJECT_IDS.map((objectId) => {
    const spec = LAB_SCENE.objects.find((candidate) => candidate.id === objectId);
    if (!spec) throw new Error(`Missing Stage 1.5 source spec for ${objectId}.`);
    return spec;
  });
  const hiddenSourceMeshes = sourceSpecs.map((spec) => {
    const sourceMesh = findUniqueSourceMesh(authoredVillage, spec.sourceNode);
    sourceMesh.visible = false;
    return Object.freeze({
      objectId: spec.id,
      sourceNode: spec.sourceNode,
      mesh: sourceMesh,
    });
  });

  const assembly = createStage15Assembly();
  assembly.root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(assembly.root);

  return Object.freeze({
    assembly,
    hiddenSourceMeshes: Object.freeze(hiddenSourceMeshes),
    layoutVersion: STAGE_1_5_LAYOUT_VERSION,
  });
}
