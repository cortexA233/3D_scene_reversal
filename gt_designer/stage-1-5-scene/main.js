import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  EIGHT_SLOT_LAB_REFERENCE_LAYOUT,
} from "../src/reconstruction/eight-slot-lab-layout.js";
import {
  createStage15Assembly,
  STAGE_1_5_LAYOUT_VERSION,
} from "../src/reconstruction/stage-1-5-layout.js";

const ui = {
  state: document.querySelector("#state"),
  toolbar: document.querySelector("#toolbar"),
  labels: document.querySelector("#labels"),
  error: document.querySelector("#error"),
};
const layout = EIGHT_SLOT_LAB_REFERENCE_LAYOUT;
const state = {
  ready: false,
  error: null,
  layoutVersion: STAGE_1_5_LAYOUT_VERSION,
  layoutKind: layout.id,
  referenceSlotCount: layout.slots.length,
  populatedSlotCount: 0,
  objectCount: 0,
  placements: [],
  resetCamera: () => {},
  focus: () => {},
};
window.stage15Scene = state;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfdce7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  layout.camera.fov,
  window.innerWidth / window.innerHeight,
  layout.camera.near,
  layout.camera.far,
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 85;
controls.maxPolarAngle = Math.PI * 0.48;

const initialCamera = {
  position: new THREE.Vector3().fromArray(layout.camera.position),
  target: new THREE.Vector3().fromArray(layout.camera.target),
};

function setActiveButton(id) {
  for (const button of ui.toolbar.querySelectorAll("button")) {
    const active = button.dataset.focus === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function resetCamera() {
  camera.position.copy(initialCamera.position);
  controls.target.copy(initialCamera.target);
  controls.update();
  setActiveButton("all");
}
state.resetCamera = resetCamera;

function addEnvironment() {
  const [floorWidth, floorDepth] = layout.floor.size;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorWidth, floorDepth),
    new THREE.MeshStandardMaterial({
      color: layout.floor.color,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  floor.name = "Lab Floor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(floorWidth, 42, 0x82909b, 0xaeb7bb);
  grid.name = "One Unit Grid";
  grid.position.y = 0.005;
  const gridMaterials = Array.isArray(grid.material)
    ? grid.material
    : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.36;
  }
  scene.add(grid);

  scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x84775f, 2.1));

  const key = new THREE.DirectionalLight(0xfff1d6, 3.25);
  key.name = "Key Light";
  key.position.set(10, 20, 13);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc7e8, 0.8);
  fill.name = "Fill Light";
  fill.position.set(-12, 9, -10);
  scene.add(fill);
}

function focusObject(entry) {
  const bounds = new THREE.Box3().setFromObject(entry.root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(radius * 1.25, radius, radius * 1.7));
  controls.update();
  setActiveButton(entry.placement.objectId);
}

function addFocusButton(label, id, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.focus = id;
  button.textContent = label;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", action);
  ui.toolbar.append(button);
}

const labelRecords = [];
function addObjectLabel(entry) {
  const label = document.createElement("div");
  label.className = "object-label";
  label.innerHTML = `<strong>${entry.definition.label}</strong><span>Procedural Replacement</span>`;
  ui.labels.append(label);
  const bounds = new THREE.Box3().setFromObject(entry.root);
  const anchor = bounds.getCenter(new THREE.Vector3());
  anchor.y = bounds.max.y + 0.35;
  labelRecords.push({ element: label, anchor });
}

const projected = new THREE.Vector3();
function updateLabels() {
  for (const record of labelRecords) {
    projected.copy(record.anchor).project(camera);
    const visible = projected.z > -1 && projected.z < 1;
    record.element.style.display = visible ? "block" : "none";
    record.element.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
    record.element.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

function showError(error) {
  state.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  ui.state.textContent = state.error;
  ui.error.textContent = state.error;
  ui.error.style.display = "block";
  document.title = "Stage 1.5 Lab Layout · Error";
  console.error(error);
}

try {
  addEnvironment();
  const assembly = createStage15Assembly();
  assembly.root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(assembly.root);

  addFocusButton("All / Reset", "all", resetCamera);
  for (const entry of assembly.entries) {
    addFocusButton(entry.definition.label, entry.placement.objectId, () =>
      focusObject(entry),
    );
    addObjectLabel(entry);
  }

  resetCamera();
  state.ready = true;
  state.objectCount = assembly.entries.length;
  state.populatedSlotCount = assembly.entries.length;
  state.placements = assembly.entries.map(({ placement, root }) => ({
    objectId: placement.objectId,
    position: root.position.toArray(),
    scale: root.scale.x,
    semanticId: root.userData.semanticId,
  }));
  document.body.dataset.state = "ready";
  document.body.dataset.objectCount = String(state.objectCount);
  document.body.dataset.layoutVersion = state.layoutVersion;
  document.body.dataset.layoutKind = state.layoutKind;
  document.body.dataset.referenceSlotCount = String(state.referenceSlotCount);
  document.body.dataset.populatedSlotCount = String(state.populatedSlotCount);
  ui.state.textContent = `${state.populatedSlotCount} procedural replacements in their matching ${state.referenceSlotCount}-slot Lab positions`;
  document.title = "Stage 1.5 Eight-slot Lab Layout · Ready";
} catch (error) {
  showError(error);
}

function render() {
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
