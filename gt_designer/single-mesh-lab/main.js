import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { LAB_SCENE } from "./scene-config.js";

const ui = {
  loading: document.querySelector("#loading"),
  loadingText: document.querySelector("#loading-text"),
  loadingBar: document.querySelector("#loading-bar"),
  toolbar: document.querySelector("#toolbar"),
  labels: document.querySelector("#labels"),
  error: document.querySelector("#error"),
};

const lab = {
  ready: false,
  error: null,
  config: LAB_SCENE,
  references: new Map(),
  resetCamera: () => {},
  focus: () => {},
};
window.singleMeshLab = lab;

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

const initialCamera = {
  position: new THREE.Vector3().fromArray(LAB_SCENE.camera.position),
  target: new THREE.Vector3().fromArray(LAB_SCENE.camera.target),
};

function resetCamera() {
  camera.position.copy(initialCamera.position);
  controls.target.copy(initialCamera.target);
  controls.update();
  setActiveButton("all");
}
lab.resetCamera = resetCamera;
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
addEnvironment();

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map(cloneMaterial);
  const clone = material.clone();
  clone.side = THREE.DoubleSide;
  clone.needsUpdate = true;
  return clone;
}

function triangleCount(geometry) {
  if (geometry.index) return Math.round(geometry.index.count / 3);
  return Math.round(geometry.attributes.position.count / 3);
}

function canonicalName(name) {
  return String(name).replace(/[^A-Za-z0-9_]/g, "");
}

function findUniqueMesh(root, name) {
  const matches = [];
  const targetName = canonicalName(name);
  root.traverse((object) => {
    if (object.isMesh && canonicalName(object.name) === targetName)
      matches.push(object);
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected one mesh named "${name}", found ${matches.length}.`,
    );
  }
  return matches[0];
}

function makeReference(source, spec) {
  source.updateWorldMatrix(true, false);
  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();

  const sourceBox = geometry.boundingBox.clone();
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const pivot = new THREE.Vector3(
    (sourceBox.min.x + sourceBox.max.x) * 0.5,
    sourceBox.min.y,
    (sourceBox.min.z + sourceBox.max.z) * 0.5,
  );
  geometry.translate(-pivot.x, -pivot.y, -pivot.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const largestDimension = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  const displayScale = LAB_SCENE.canonicalMaxDimension / largestDimension;
  const mesh = new THREE.Mesh(geometry, cloneMaterial(source.material));
  mesh.name = `Reference · ${spec.label}`;
  mesh.position.fromArray(spec.slot);
  mesh.position.y += 0.01;
  mesh.scale.setScalar(displayScale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.lab = {
    id: spec.id,
    sourceNode: spec.sourceNode,
    sourceSize: sourceSize.toArray(),
    displayScale,
    triangles: triangleCount(geometry),
  };
  return mesh;
}

async function loadReferences() {
  const draco = new DRACOLoader();
  draco.setDecoderPath("../assets/draco/");
  draco.setDecoderConfig({ type: "wasm" });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let asset;
  try {
    asset = await loader.loadAsync("../data/island-village.glb", (event) => {
      if (!event.total) return;
      const fraction = Math.min(event.loaded / event.total, 1);
      ui.loadingBar.style.width = `${(fraction * 100).toFixed(1)}%`;
      ui.loadingText.textContent = `Loading authored reference meshes · ${Math.round(
        fraction * 100,
      )}%`;
    });
  } finally {
    draco.dispose();
  }

  for (const spec of LAB_SCENE.objects) {
    const source = findUniqueMesh(asset.scene, spec.sourceNode);
    const reference = makeReference(source, spec);
    lab.references.set(spec.id, reference);
    scene.add(reference);
  }
}

const labelRecords = [];

function makeInterface() {
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.dataset.focus = "all";
  allButton.textContent = "All / Reset";
  allButton.addEventListener("click", resetCamera);
  ui.toolbar.append(allButton);

  for (const spec of LAB_SCENE.objects) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.focus = spec.id;
    button.textContent = spec.label;
    button.addEventListener("click", () => focusObject(spec.id));
    ui.toolbar.append(button);

    const label = document.createElement("div");
    label.className = "object-label";
    label.innerHTML = `<strong>${spec.label}</strong><span>${spec.description}</span>`;
    ui.labels.append(label);
    labelRecords.push({
      id: spec.id,
      element: label,
      anchor: new THREE.Vector3(spec.slot[0], 0, spec.slot[2]),
    });
  }
  setActiveButton("all");
}

function setActiveButton(id) {
  for (const button of ui.toolbar.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.focus === id);
  }
}

function focusObject(id) {
  const object = lab.references.get(id);
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.25, radius, radius * 1.7));
  controls.update();
  setActiveButton(id);
}
lab.focus = focusObject;
makeInterface();

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
  lab.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.error = "true";
  ui.error.textContent = lab.error;
  ui.error.style.display = "block";
  ui.loading.classList.add("done");
  document.title = "Single Mesh Lab · Error";
  console.error(error);
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

loadReferences()
  .then(() => {
    for (const record of labelRecords) {
      const reference = lab.references.get(record.id);
      const box = new THREE.Box3().setFromObject(reference);
      const center = box.getCenter(new THREE.Vector3());
      record.anchor.set(center.x, box.max.y + 0.35, center.z);
    }
    lab.ready = true;
    document.body.dataset.ready = "true";
    ui.loadingBar.style.width = "100%";
    ui.loadingText.textContent = "Reference scene ready";
    ui.loading.classList.add("done");
    document.title = "Single Mesh Reconstruction Lab · Ready";
  })
  .catch(showError);
