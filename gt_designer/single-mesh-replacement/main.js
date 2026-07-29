import * as THREE from "three";

import { generateObject } from "../src/reconstruction/core/object-generator.js";
import { getObjectDefinition } from "../src/reconstruction/objects/object-registry.js";

const objectId = new URLSearchParams(window.location.search).get("object") ?? "probe";
const definition = getObjectDefinition(objectId);

const stateElement = document.querySelector("#state");
const replacement = {
  ready: false,
  error: null,
  definitionId: definition.id,
  recipe: definition.recipe,
  root: null,
};
window.singleMeshReplacement = replacement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x13212b);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(6.5, 4.8, 8.5);
camera.lookAt(0, 1.4, 0);

scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x6e5940, 2.2));
const key = new THREE.DirectionalLight(0xffebc7, 3.2);
key.position.set(5, 9, 7);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({
    color: 0x243844,
    roughness: 0.92,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
scene.add(floor);

function render() {
  renderer.render(scene, camera);
}

function showError(error) {
  replacement.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  stateElement.textContent = replacement.error;
  console.error(error);
}

try {
  replacement.root = generateObject(definition.recipe, definition.generator);
  scene.add(replacement.root);
  render();
  replacement.ready = true;
  document.body.dataset.state = "ready";
  document.body.dataset.objectId = replacement.root.userData.semanticId;
  stateElement.textContent = `${definition.recipe.id} · seed ${definition.recipe.seed}`;
} catch (error) {
  showError(error);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
});
