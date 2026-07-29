import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  createStage15Assembly,
  STAGE_1_5_LAYOUT_VERSION,
} from "../src/reconstruction/stage-1-5-layout.js";

const stateElement = document.querySelector("#state");
const focusControls = document.querySelector("#focus-controls");
const state = {
  ready: false,
  error: null,
  layoutVersion: STAGE_1_5_LAYOUT_VERSION,
  objectCount: 0,
  placements: [],
  focus: "overview",
};
window.stage15Scene = state;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ebdca);
scene.fog = new THREE.Fog(0x9ebdca, 420, 900);

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
  1800,
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxDistance = 900;

scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x665a43, 2.1));
const key = new THREE.DirectionalLight(0xffe2ad, 3.4);
key.position.set(-90, 180, 130);
scene.add(key);

const grid = new THREE.GridHelper(600, 60, 0x476b73, 0x78949a);
grid.material.transparent = true;
grid.material.opacity = 0.32;
scene.add(grid);

function fitCamera(object, direction = new THREE.Vector3(1, 0.72, 1)) {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 2);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const distance = (radius / Math.tan(halfFov)) * 1.18;
  controls.target.copy(center);
  camera.position.copy(center).add(direction.clone().normalize().multiplyScalar(distance));
  camera.near = Math.max(0.1, distance / 1000);
  camera.far = Math.max(1800, distance * 5);
  camera.updateProjectionMatrix();
  controls.update();
}

function updatePressedButton(id) {
  for (const button of focusControls.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.focus === id));
  }
}

function addFocusButton(label, id, focus) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.focus = id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    state.focus = id;
    fitCamera(focus);
    updatePressedButton(id);
  });
  focusControls.append(button);
}

function showError(error) {
  state.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  stateElement.textContent = state.error;
  console.error(error);
}

try {
  const assembly = createStage15Assembly();
  scene.add(assembly.root);
  addFocusButton("Overview · reference layout", "overview", assembly.root);
  for (const entry of assembly.entries) {
    addFocusButton(entry.definition.label, entry.placement.objectId, entry.root);
  }
  fitCamera(assembly.root, new THREE.Vector3(1, 0.82, 1));
  updatePressedButton("overview");

  state.ready = true;
  state.objectCount = assembly.entries.length;
  state.placements = assembly.entries.map(({ placement, root }) => ({
    objectId: placement.objectId,
    position: root.position.toArray(),
    semanticId: root.userData.semanticId,
  }));
  document.body.dataset.state = "ready";
  document.body.dataset.objectCount = String(state.objectCount);
  document.body.dataset.layoutVersion = state.layoutVersion;
  stateElement.textContent = `${state.objectCount} Procedural Replacements · ${state.layoutVersion}`;
} catch (error) {
  showError(error);
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
