import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { LAB_SCENE } from "../single-mesh-lab/scene-config.js";

let authoredScenePromise = null;

function canonicalName(name) {
  return String(name).replace(/[^A-Za-z0-9_]/g, "");
}

function findUniqueMesh(root, name) {
  const target = canonicalName(name);
  const matches = [];
  root.traverse((object) => {
    if (object.isMesh && canonicalName(object.name) === target) {
      matches.push(object);
    }
  });
  if (matches.length !== 1) {
    throw new Error(`Expected one mesh named "${name}", found ${matches.length}`);
  }
  return matches[0];
}

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map(cloneMaterial);
  const clone = material.clone();
  clone.side = THREE.DoubleSide;
  clone.needsUpdate = true;
  return clone;
}

async function loadAuthoredScene() {
  if (authoredScenePromise) return authoredScenePromise;
  authoredScenePromise = (async () => {
    const draco = new DRACOLoader();
    draco.setDecoderPath("../assets/draco/");
    draco.setDecoderConfig({ type: "wasm" });
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    try {
      return await loader.loadAsync("../data/island-village.glb");
    } finally {
      draco.dispose();
    }
  })();
  return authoredScenePromise;
}

export async function loadAuthoredReference(id) {
  const spec = LAB_SCENE.objects.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unknown Reconstruction Unit: ${id}`);
  const asset = await loadAuthoredScene();
  const source = findUniqueMesh(asset.scene, spec.sourceNode);
  source.updateWorldMatrix(true, false);

  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const bounds = geometry.boundingBox;
  const root = new THREE.Mesh(geometry, cloneMaterial(source.material));
  root.name = `Authored Reference · ${spec.label}`;
  root.userData.semanticId = `reference.${spec.id}`;
  root.userData.reconstructionUnitId = spec.id;

  return {
    id: spec.id,
    label: spec.label,
    developmentSourceNode: spec.sourceNode,
    root,
    worldBounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    },
  };
}
