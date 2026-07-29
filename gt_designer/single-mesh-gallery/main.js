import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { generateObject } from "../src/reconstruction/core/object-generator.js";
import { getObjectDefinition } from "../src/reconstruction/objects/object-registry.js";
import { LAB_SCENE } from "../single-mesh-lab/scene-config.js";

const IMPLEMENTED_IDS = new Set(["stone-path", "stone", "vase", "umbrella"]);
const ui = {
  status: document.querySelector("#status"),
  toolbar: document.querySelector("#toolbar"),
  labels: document.querySelector("#labels"),
  error: document.querySelector("#error"),
};
const gallery = {
  ready: false,
  error: null,
  generated: new Map(),
  missingIds: LAB_SCENE.objects
    .filter((spec) => !IMPLEMENTED_IDS.has(spec.id))
    .map((spec) => spec.id),
};
window.singleMeshGallery = gallery;

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
  LAB_SCENE.camera.fov,
  window.innerWidth / window.innerHeight,
  LAB_SCENE.camera.near,
  LAB_SCENE.camera.far,
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 85;
controls.maxPolarAngle = Math.PI * 0.48;

const initialPosition = new THREE.Vector3().fromArray(LAB_SCENE.camera.position);
const initialTarget = new THREE.Vector3().fromArray(LAB_SCENE.camera.target);

function resetCamera() {
  camera.position.copy(initialPosition);
  controls.target.copy(initialTarget);
  controls.update();
  setActiveButton("all");
}
resetCamera();

function addEnvironment() {
  const [floorWidth, floorDepth] = LAB_SCENE.floor.size;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorWidth, floorDepth),
    new THREE.MeshStandardMaterial({
      color: LAB_SCENE.floor.color,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(floorWidth, 42, 0x82909b, 0xaeb7bb);
  grid.position.y = 0.005;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.36;
  }
  scene.add(grid);

  scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x84775f, 2.1));
  const key = new THREE.DirectionalLight(0xfff1d6, 3.25);
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
  fill.position.set(-12, 9, -10);
  scene.add(fill);
}
addEnvironment();

function placeGeneratedObject(spec) {
  const definition = getObjectDefinition(spec.id);
  const root = generateObject(definition.recipe, definition.generator);
  root.updateWorldMatrix(true, true);
  const localBox = new THREE.Box3().setFromObject(root);
  const size = localBox.getSize(new THREE.Vector3());
  const scale = LAB_SCENE.canonicalMaxDimension / Math.max(size.x, size.y, size.z);
  const bottomCenter = new THREE.Vector3(
    (localBox.min.x + localBox.max.x) * 0.5,
    localBox.min.y,
    (localBox.min.z + localBox.max.z) * 0.5,
  );
  root.scale.setScalar(scale);
  root.position.set(
    spec.slot[0] - bottomCenter.x * scale,
    spec.slot[1] + 0.01 - bottomCenter.y * scale,
    spec.slot[2] - bottomCenter.z * scale,
  );
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  root.userData.gallery = { slot: [...spec.slot], displayScale: scale };
  scene.add(root);
  gallery.generated.set(spec.id, root);
  return root;
}

function addMissingMarker(spec) {
  const material = new THREE.LineBasicMaterial({ color: 0xb47a38 });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.9, 0, -0.9),
    new THREE.Vector3(0.9, 0, 0.9),
    new THREE.Vector3(-0.9, 0, 0.9),
    new THREE.Vector3(0.9, 0, -0.9),
  ]);
  const marker = new THREE.LineSegments(geometry, material);
  marker.position.set(spec.slot[0], 0.025, spec.slot[2]);
  scene.add(marker);
}

const labelRecords = [];
function addInterface() {
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.dataset.focus = "all";
  allButton.textContent = "All / Reset";
  allButton.addEventListener("click", resetCamera);
  ui.toolbar.append(allButton);

  for (const spec of LAB_SCENE.objects) {
    const implemented = IMPLEMENTED_IDS.has(spec.id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.focus = spec.id;
    button.textContent = spec.label;
    button.classList.toggle("missing", !implemented);
    button.title = implemented ? "Procedural Replacement" : "Generator not implemented";
    button.addEventListener("click", () => focusSlot(spec.id));
    ui.toolbar.append(button);

    const label = document.createElement("div");
    label.className = `object-label${implemented ? "" : " missing"}`;
    label.innerHTML = `<strong>${spec.label}</strong><span>${implemented ? "Procedural Replacement" : "Not reconstructed"}</span>`;
    ui.labels.append(label);
    labelRecords.push({
      id: spec.id,
      element: label,
      anchor: new THREE.Vector3(spec.slot[0], implemented ? 1 : 0.25, spec.slot[2]),
    });
  }
  setActiveButton("all");
}

function setActiveButton(id) {
  for (const button of ui.toolbar.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.focus === id);
  }
}

function focusSlot(id) {
  const spec = LAB_SCENE.objects.find((candidate) => candidate.id === id);
  if (!spec) return;
  const object = gallery.generated.get(id);
  const box = object
    ? new THREE.Box3().setFromObject(object)
    : new THREE.Box3(
        new THREE.Vector3(spec.slot[0] - 1, 0, spec.slot[2] - 1),
        new THREE.Vector3(spec.slot[0] + 1, 1, spec.slot[2] + 1),
      );
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 2);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.25, radius, radius * 1.7));
  controls.update();
  setActiveButton(id);
}
addInterface();

try {
  for (const spec of LAB_SCENE.objects) {
    if (IMPLEMENTED_IDS.has(spec.id)) placeGeneratedObject(spec);
    else addMissingMarker(spec);
  }
  for (const record of labelRecords) {
    const object = gallery.generated.get(record.id);
    if (!object) continue;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    record.anchor.set(center.x, box.max.y + 0.35, center.z);
  }
  gallery.ready = true;
  document.body.dataset.state = "ready";
  document.body.dataset.generatedCount = String(gallery.generated.size);
  ui.status.textContent = `${gallery.generated.size} generated · ${gallery.missingIds.length} not yet reconstructed`;
} catch (error) {
  gallery.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  ui.error.textContent = gallery.error;
  ui.error.style.display = "block";
  console.error(error);
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

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);

function render() {
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
