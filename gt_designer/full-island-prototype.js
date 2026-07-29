// THROWAWAY VISUAL PROTOTYPE
//
// Question: can a code-only procedural scene reproduce the authored island's
// overall layout, materials, mesh silhouettes, sea plane, and mountain horizon
// closely enough to justify a full-island reconstruction pass?
//
// Three procedural reconstructions of the same authored island composition,
// switchable through ?variant=A|B|C. The authored GLB, terrain heightfield, scene
// manifests, and textures are deliberately absent from this runtime.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const query = new URLSearchParams(location.search);
const variantKey = ["A", "B", "C"].includes(query.get("variant"))
  ? query.get("variant")
  : "A";

const VARIANTS = {
  A: {
    name: "Reference Match",
    description:
      "Closest reconstruction: authored-scale coastline, central water garden, palm ring, blossom grove, bamboo bank, red bridges and pagoda landmarks.",
    seed: 149548,
    foliage: 1,
    meshDetail: 1,
    exposure: 1.03,
    fogDensity: 1,
    palette: {
      skyTop: 0x91b9d3,
      skyHorizon: 0xe8e2d4,
      waterDeep: 0x80b3c6,
      waterShallow: 0xc1d8d5,
      sand: 0xd9c690,
      grass: 0x8ebd5d,
      grassLight: 0xb4cf78,
      rock: 0xa39b78,
      timber: 0x754531,
      plaster: 0xe8d4a9,
      roof: 0xb84c32,
    },
  },
  B: {
    name: "Dense Mesh Study",
    description:
      "The same reference layout with denser roofs, foliage and shoreline meshes to test how much silhouette detail improves the match.",
    seed: 149548,
    foliage: 1.28,
    meshDetail: 1.35,
    exposure: 1,
    fogDensity: 0.92,
    palette: {
      skyTop: 0x7faecd,
      skyHorizon: 0xece2cc,
      waterDeep: 0x6fa9bd,
      waterShallow: 0xb8d4d3,
      sand: 0xd5c088,
      grass: 0x80b354,
      grassLight: 0xaecb70,
      rock: 0x948c6d,
      timber: 0x693b2d,
      plaster: 0xe9d8b4,
      roof: 0xc1442e,
    },
  },
  C: {
    name: "Low-poly Budget",
    description:
      "The same composition reduced to fewer instances and broader faceted forms, preserving the island silhouette and landmark layout.",
    seed: 149548,
    foliage: 0.58,
    meshDetail: 0.62,
    exposure: 1.08,
    fogDensity: 1.12,
    palette: {
      skyTop: 0x9abed2,
      skyHorizon: 0xece5d5,
      waterDeep: 0x89b7c5,
      waterShallow: 0xc8dcda,
      sand: 0xdfca91,
      grass: 0x94bd61,
      grassLight: 0xb7ce77,
      rock: 0xa69d79,
      timber: 0x784a35,
      plaster: 0xead8b4,
      roof: 0xb94d35,
    },
  },
};

const config = VARIANTS[variantKey];
const WORLD = {
  center: new THREE.Vector2(86, -24),
  coast: new THREE.Vector2(322, 290),
  flat: new THREE.Vector2(255, 228),
  seaY: 16,
  groundY: 26,
  oceanFloor: -40,
};

const runtime = window.island;
const loadMessage = document.getElementById("load-message");
const loadBar = document.getElementById("load-bar");
const statsElement = document.getElementById("stats");
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;

const stats = {
  terrainVertices: 0,
  palms: 0,
  blossoms: 0,
  bamboo: 0,
  rocks: 0,
  buildings: 0,
  mountains: 0,
};

function tick(message, progress) {
  loadMessage.textContent = message;
  loadBar.style.width = `${Math.round(progress * 100)}%`;
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed = config.seed) {
  let value =
    Math.imul(ix, 374761393) ^
    Math.imul(iz, 668265263) ^
    Math.imul(seed, 1597334677);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed = config.seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

function fbm(x, z, octaves = 4, seed = config.seed) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total +=
      valueNoise(
        x * frequency + octave * 7.31,
        z * frequency + octave * 11.17,
        seed + octave * 97,
      ) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total;
}

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz) * 2.2);
}

function coastField(x, z) {
  const center = WORLD.center;
  const wobble = 1 + 0.115 * fbm(x * 0.004 + 3, z * 0.004 + 7, 3);
  const dx = (x - center.x) / (WORLD.coast.x * wobble);
  const dz = (z - center.y) / (WORLD.coast.y * wobble);
  let field = 1 - Math.hypot(dx, dz);

  // The reference island has a broad water mouth in the foreground that narrows
  // into the central garden. This subtractive field keeps that composition.
  const forward = smooth(30, 175, z - center.y);
  const mouth = Math.exp(-Math.pow((x - (center.x + 2)) / 44, 2)) * forward;
  const lagoon = gaussian(x, z, center.x + 14, center.y + 67, 92, 76);
  field -= mouth * 0.92;
  field -= lagoon * 0.13;
  return field;
}

function flatField(x, z) {
  const dx = (x - WORLD.center.x) / WORLD.flat.x;
  const dz = (z - WORLD.center.y) / WORLD.flat.y;
  return 1 - smooth(0.78, 1.1, Math.hypot(dx, dz));
}

function islandHeight(x, z) {
  const field = coastField(x, z);
  let height = lerp(
    WORLD.oceanFloor,
    WORLD.seaY - 1.4,
    smooth(-0.24, -0.015, field),
  );
  height = lerp(height, WORLD.groundY, smooth(-0.015, 0.2, field));

  const rim = (1 - flatField(x, z)) * smooth(0.05, 0.38, field);
  const dune = (fbm(x * 0.012, z * 0.012, 4) * 0.5 + 0.5) * 10;
  const hill =
    Math.pow(clamp(fbm(x * 0.004 + 19, z * 0.004 - 8, 4) * 0.5 + 0.58, 0, 1), 2) *
    42;
  height += rim * (dune + hill);
  height += flatField(x, z) * fbm(x * 0.035, z * 0.035, 2) * 0.42;
  return height;
}

function slopeAt(x, z) {
  const epsilon = 3;
  const height = islandHeight(x, z);
  return Math.hypot(
    islandHeight(x + epsilon, z) - height,
    islandHeight(x, z + epsilon) - height,
  ) / epsilon;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.88,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

const materials = {
  sand: material(config.palette.sand, { roughness: 1 }),
  grass: material(config.palette.grass, { roughness: 1 }),
  timber: material(config.palette.timber, { roughness: 0.92 }),
  darkTimber: material(0x3f2b27, { roughness: 0.9 }),
  plaster: material(config.palette.plaster, { roughness: 0.95 }),
  roof: material(config.palette.roof, { roughness: 0.82 }),
  roofDark: material(0x6f332d, { roughness: 0.85 }),
  stone: material(0xa9a48d, { roughness: 1, flatShading: true }),
  bridge: material(0xb9332e, { roughness: 0.8 }),
  bridgeDark: material(0x772923, { roughness: 0.86 }),
  leaf: material(0x284b28, { roughness: 0.98, side: THREE.DoubleSide }),
  trunk: material(0x715038, { roughness: 1 }),
  blossom: material(0xf0a8b2, { roughness: 0.95, flatShading: true }),
  blossomLight: material(0xf5c0c4, { roughness: 0.95, flatShading: true }),
  bamboo: material(0x81a45e, { roughness: 0.95 }),
  bambooLeaf: material(0x729757, { roughness: 0.98, flatShading: true }),
};

function setShadow(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

function makeSky(scene) {
  const geometry = new THREE.SphereGeometry(6200, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(config.palette.skyTop) },
      horizonColor: { value: new THREE.Color(config.palette.skyHorizon) },
      sunColor: { value: new THREE.Color(0xffe5ae) },
      sunDirection: {
        value: new THREE.Vector3(-0.45, 0.32, -0.5).normalize(),
      },
    },
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDirection;
      void main(){
        float h=clamp(vDirection.y,0.0,1.0);
        vec3 color=mix(horizonColor,topColor,smoothstep(0.02,0.58,h));
        float haze=pow(1.0-clamp(h*4.0,0.0,1.0),2.0);
        color=mix(color,horizonColor,haze*0.38);
        float sun=max(dot(normalize(vDirection),sunDirection),0.0);
        color+=sunColor*pow(sun,90.0)*0.42+sunColor*pow(sun,8.0)*0.09;
        gl_FragColor=vec4(color,1.0);
      }`,
  });
  const sky = new THREE.Mesh(geometry, skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);
}

function makeOcean(scene) {
  const geometry = new THREE.PlaneGeometry(7200, 7200, 100, 100);
  const oceanMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    fog: false,
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(config.palette.waterDeep) },
      shallowColor: { value: new THREE.Color(config.palette.waterShallow) },
      sunColor: { value: new THREE.Color(0xfff1d5) },
    },
    vertexShader: `uniform float time; varying vec3 vWorld; varying float vWave;
      void main(){
        vec3 p=position;
        float w=sin(p.x*0.021+time*0.72)*0.32+cos(p.y*0.017-time*0.58)*0.28+sin((p.x+p.y)*0.008+time)*0.22;
        p.z+=w;
        vec4 world=modelMatrix*vec4(p,1.0);vWorld=world.xyz;vWave=w;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `uniform vec3 deepColor;uniform vec3 shallowColor;uniform vec3 sunColor;
      varying vec3 vWorld;varying float vWave;
      void main(){
        vec3 V=normalize(cameraPosition-vWorld);
        float fres=pow(1.0-clamp(V.y,0.0,1.0),2.2);
        float ripple=sin(vWorld.x*0.055+vWorld.z*0.03)+sin(vWorld.z*0.074-vWorld.x*0.012);
        vec3 color=mix(shallowColor,deepColor,0.34+fres*0.5);
        color+=sunColor*max(0.0,ripple)*0.025;
        color=mix(color,sunColor,fres*0.12);
        gl_FragColor=vec4(color,0.88);
      }`,
  });
  const ocean = new THREE.Mesh(geometry, oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = WORLD.seaY;
  ocean.receiveShadow = true;
  scene.add(ocean);
  return { ocean, oceanMaterial };
}

function terrainColor(x, z, height) {
  const field = coastField(x, z);
  const slope = slopeAt(x, z);
  const color = new THREE.Color();
  if (field < 0.075 || height < WORLD.seaY + 3.6) {
    color.set(config.palette.sand);
  } else if (slope > 0.62 || height > WORLD.groundY + 42) {
    color.set(config.palette.rock);
    color.lerp(new THREE.Color(0xd5c59a), clamp((height - 55) / 50, 0, 0.55));
  } else {
    color.set(config.palette.grass);
    color.lerp(
      new THREE.Color(config.palette.grassLight),
      clamp(fbm(x * 0.026, z * 0.026, 3) * 0.34 + 0.38, 0, 0.7),
    );
  }
  const variation = 0.9 + valueNoise(x * 0.08, z * 0.08) * 0.055;
  return color.multiplyScalar(variation);
}

function makeTerrain(scene) {
  const minX = WORLD.center.x - WORLD.coast.x * 1.3;
  const maxX = WORLD.center.x + WORLD.coast.x * 1.3;
  const minZ = WORLD.center.y - WORLD.coast.y * 1.3;
  const maxZ = WORLD.center.y + WORLD.coast.y * 1.3;
  const step = variantKey === "B" ? 3.6 : variantKey === "C" ? 6.4 : 4.5;
  const nx = Math.ceil((maxX - minX) / step);
  const nz = Math.ceil((maxZ - minZ) / step);
  const vx = nx + 1;
  const vz = nz + 1;
  const positions = new Float32Array(vx * vz * 3);
  const colors = new Float32Array(vx * vz * 3);
  const indices = new Uint32Array(nx * nz * 6);
  let vertex = 0;
  for (let iz = 0; iz < vz; iz++) {
    const z = lerp(minZ, maxZ, iz / nz);
    for (let ix = 0; ix < vx; ix++) {
      const x = lerp(minX, maxX, ix / nx);
      const height = islandHeight(x, z);
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = height;
      positions[vertex * 3 + 2] = z;
      const color = terrainColor(x, z, height);
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
      vertex++;
    }
  }
  let index = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * vx + ix;
      const b = a + 1;
      const c = a + vx;
      const d = c + 1;
      indices[index++] = a;
      indices[index++] = c;
      indices[index++] = b;
      indices[index++] = b;
      indices[index++] = c;
      indices[index++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    flatShading: variantKey === "C",
  });
  const terrain = new THREE.Mesh(geometry, terrainMaterial);
  terrain.name = "Procedural Island Terrain";
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  scene.add(terrain);
  stats.terrainVertices = vertex;
  return terrain;
}

function makeMountainRing(scene) {
  const count = Math.round(62 * config.meshDetail);
  const baseGeometry = new THREE.ConeGeometry(1, 1, variantKey === "C" ? 4 : 5, 1);
  const peakGeometry = new THREE.ConeGeometry(1, 1, variantKey === "B" ? 6 : 5, 1);
  const baseMaterial = material(0x718664, { roughness: 1, flatShading: true });
  const peakMaterial = material(0xb9aa88, { roughness: 1, flatShading: true });
  const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, count);
  const peaks = new THREE.InstancedMesh(peakGeometry, peakMaterial, count);
  const rng = mulberry32(config.seed + 9001);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const green = new THREE.Color();
  const stone = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + (rng() - 0.5) * 0.1;
    const radius = 1120 + rng() * 460;
    const mountainRadius = 58 + rng() * 74;
    const height = 78 + Math.pow(rng(), 1.55) * 112;
    position.set(
      WORLD.center.x + Math.cos(angle) * radius,
      WORLD.seaY + height * 0.5 - 2,
      WORLD.center.y + Math.sin(angle) * radius,
    );
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    scale.set(mountainRadius, height, mountainRadius * (0.72 + rng() * 0.4));
    matrix.compose(position, quaternion, scale);
    bases.setMatrixAt(i, matrix);
    bases.setColorAt(
      i,
      green.setHSL(0.24 + rng() * 0.035, 0.19, 0.39 + rng() * 0.08),
    );

    const peakHeight = height * (0.56 + rng() * 0.12);
    position.y = WORLD.seaY + height * 0.58;
    scale.set(mountainRadius * 0.72, peakHeight, mountainRadius * 0.7);
    matrix.compose(position, quaternion, scale);
    peaks.setMatrixAt(i, matrix);
    peaks.setColorAt(
      i,
      stone.setHSL(0.11 + rng() * 0.03, 0.23, 0.67 + rng() * 0.1),
    );
  }
  bases.instanceMatrix.needsUpdate = true;
  peaks.instanceMatrix.needsUpdate = true;
  bases.instanceColor.needsUpdate = true;
  peaks.instanceColor.needsUpdate = true;
  bases.receiveShadow = peaks.receiveShadow = true;
  bases.castShadow = peaks.castShadow = true;
  scene.add(bases, peaks);
  stats.mountains = count;
}

function canvasCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const blobs = [
    [45, 82, 34],
    [80, 69, 45],
    [126, 63, 54],
    [174, 70, 43],
    [214, 83, 30],
  ];
  for (const [x, y, radius] of blobs) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,.82)");
    gradient.addColorStop(0.62, "rgba(245,246,242,.62)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeClouds(scene) {
  const texture = canvasCloudTexture();
  const rng = mulberry32(config.seed + 51);
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const angle = rng() * TAU;
    const radius = 650 + rng() * 1600;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.46 + rng() * 0.28,
        fog: true,
      }),
    );
    sprite.position.set(
      WORLD.center.x + Math.cos(angle) * radius,
      210 + rng() * 330,
      WORLD.center.y + Math.sin(angle) * radius,
    );
    const scale = 220 + rng() * 320;
    sprite.scale.set(scale * 1.75, scale, 1);
    clouds.add(sprite);
  }
  scene.add(clouds);
  return clouds;
}

function makeBox(width, height, depth, meshMaterial) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    meshMaterial,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function placeOnGround(group, x, z, yOffset = 0) {
  group.position.set(x, islandHeight(x, z) + yOffset, z);
  return group;
}

function makeHouse(scene, x, z, scale = 1, rotation = 0, levels = 1) {
  const group = new THREE.Group();
  group.name = "Procedural Village House";
  const width = 18 * scale;
  const depth = 14 * scale;
  const floorHeight = 10 * scale;
  const base = makeBox(width + 2, 1.6 * scale, depth + 2, materials.stone);
  base.position.y = 0.8 * scale;
  group.add(base);

  for (let level = 0; level < levels; level++) {
    const shrink = 1 - level * 0.16;
    const wall = makeBox(
      width * shrink,
      floorHeight,
      depth * shrink,
      materials.plaster,
    );
    wall.position.y = 1.6 * scale + floorHeight * (level + 0.5);
    group.add(wall);
    const beamFront = makeBox(width * shrink + 0.8, 0.65 * scale, 0.55, materials.darkTimber);
    beamFront.position.set(0, wall.position.y + floorHeight * 0.25, depth * shrink * 0.51);
    group.add(beamFront);
    const beamBack = beamFront.clone();
    beamBack.position.z *= -1;
    group.add(beamBack);
    for (const side of [-1, 1]) {
      const post = makeBox(0.75 * scale, floorHeight * 0.9, 0.75 * scale, materials.timber);
      post.position.set(side * width * shrink * 0.45, wall.position.y, depth * shrink * 0.48);
      group.add(post);
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1, 0.48, 4, 1),
      level === levels - 1 ? materials.roof : materials.roofDark,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width * shrink * 0.82, 11 * scale, depth * shrink * 0.95);
    roof.position.y = wall.position.y + floorHeight * 0.57;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }

  const door = makeBox(3.2 * scale, 5.4 * scale, 0.45, materials.darkTimber);
  door.position.set(0, 4.4 * scale, depth * 0.53);
  group.add(door);
  const lanternMaterial = material(0xffd28d, {
    emissive: 0xff9e4d,
    emissiveIntensity: 0.65,
    roughness: 0.65,
  });
  for (const side of [-1, 1]) {
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.75 * scale, 8, 6),
      lanternMaterial,
    );
    lantern.position.set(side * width * 0.28, 6.5 * scale, depth * 0.56);
    group.add(lantern);
  }

  group.rotation.y = rotation;
  placeOnGround(group, x, z, 0.15);
  scene.add(setShadow(group));
  stats.buildings++;
  return group;
}

function makePagoda(scene, x, z, scale = 1, levels = 3) {
  const group = new THREE.Group();
  group.name = "Procedural Pagoda";
  const base = makeBox(22 * scale, 2.2 * scale, 22 * scale, materials.stone);
  base.position.y = 1.1 * scale;
  group.add(base);
  for (let level = 0; level < levels; level++) {
    const width = (16 - level * 2.1) * scale;
    const y = 2.2 * scale + level * 10.5 * scale;
    const room = makeBox(width, 7.2 * scale, width, materials.plaster);
    room.position.y = y + 3.6 * scale;
    group.add(room);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = makeBox(0.75 * scale, 7.6 * scale, 0.75 * scale, materials.darkTimber);
        post.position.set(sx * width * 0.43, y + 3.8 * scale, sz * width * 0.43);
        group.add(post);
      }
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1, 0.3, 4, 1),
      materials.roof,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width * 0.9, 10 * scale, width * 0.9);
    roof.position.y = y + 8.5 * scale;
    group.add(roof);
  }
  const finial = new THREE.Mesh(
    new THREE.ConeGeometry(1.2 * scale, 6 * scale, 6),
    materials.roofDark,
  );
  finial.position.y = levels * 10.5 * scale + 3 * scale;
  group.add(finial);
  placeOnGround(group, x, z, 0.2);
  scene.add(setShadow(group));
  stats.buildings++;
  return group;
}

function makePavilion(scene, x, z, scale = 1) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(13 * scale, 14 * scale, 2 * scale, 8),
    materials.stone,
  );
  base.position.y = scale;
  group.add(base);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    const post = makeBox(0.8 * scale, 12 * scale, 0.8 * scale, materials.darkTimber);
    post.position.set(Math.cos(angle) * 10.5 * scale, 8 * scale, Math.sin(angle) * 10.5 * scale);
    group.add(post);
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(18 * scale, 8 * scale, 8),
    materials.roof,
  );
  roof.position.y = 16 * scale;
  group.add(roof);
  placeOnGround(group, x, z, 0.15);
  scene.add(setShadow(group));
  stats.buildings++;
}

function makeTorii(scene, x, z, scale = 1, rotation = 0) {
  const group = new THREE.Group();
  const postHeight = 14 * scale;
  for (const side of [-1, 1]) {
    const post = makeBox(1.7 * scale, postHeight, 1.7 * scale, materials.bridge);
    post.position.set(side * 6 * scale, postHeight * 0.5, 0);
    group.add(post);
  }
  const beam = makeBox(17 * scale, 1.8 * scale, 2 * scale, materials.bridge);
  beam.position.y = postHeight;
  group.add(beam);
  const top = makeBox(20 * scale, 1.3 * scale, 2.6 * scale, materials.bridgeDark);
  top.position.y = postHeight + 2.2 * scale;
  group.add(top);
  group.rotation.y = rotation;
  placeOnGround(group, x, z, 0.1);
  scene.add(setShadow(group));
}

function makeVillage(scene) {
  const cx = WORLD.center.x;
  const cz = WORLD.center.y;
  const houses = [
    [-104, -8, 1.05, 0.32, 1],
    [-72, 22, 0.9, -0.18, 1],
    [-48, -45, 0.92, 0.62, 1],
    [-20, 10, 1.12, -0.42, 1],
    [18, -15, 0.88, 0.2, 1],
    [54, -76, 0.92, -0.34, 1],
    [95, 6, 0.82, 0.52, 1],
    [124, -62, 0.88, -0.5, 1],
    [156, 8, 1.02, 0.28, 2],
    [-124, 66, 0.82, 0.78, 1],
    [-62, 82, 0.84, -0.5, 1],
  ];
  const count = variantKey === "C" ? 8 : variantKey === "B" ? houses.length : 10;
  for (let i = 0; i < count; i++) {
    const [dx, dz, scale, rotation, levels] = houses[i];
    makeHouse(scene, cx + dx, cz + dz, scale, rotation, levels);
  }
  makePagoda(scene, cx + 5, cz - 135, 1.05, variantKey === "C" ? 2 : 3);
  makePagoda(scene, cx + 190, cz - 50, 0.9, 2);
  makePavilion(scene, cx - 168, cz - 95, 0.86);
  makeTorii(scene, cx - 155, cz + 35, 0.86, Math.PI / 2.5);
  makeTorii(scene, cx + 20, cz - 92, 0.75, 0.1);
}

function makeStonePath(scene, points, width = 7, count = 42) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  );
  const geometry = new THREE.BoxGeometry(width, 0.72, width * 0.75);
  const path = new THREE.InstancedMesh(geometry, materials.stone, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rng = mulberry32(config.seed + count + Math.round(points[0][0]));
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const y = islandHeight(point.x, point.z) + 0.6;
    quaternion.setFromEuler(
      new THREE.Euler(0, Math.atan2(tangent.x, tangent.z) + (rng() - 0.5) * 0.12, 0),
    );
    scale.set(0.78 + rng() * 0.35, 1, 0.72 + rng() * 0.32);
    matrix.compose(new THREE.Vector3(point.x, y, point.z), quaternion, scale);
    path.setMatrixAt(i, matrix);
  }
  path.instanceMatrix.needsUpdate = true;
  path.castShadow = true;
  path.receiveShadow = true;
  scene.add(path);
}

function makePaths(scene) {
  const cx = WORLD.center.x;
  const cz = WORLD.center.y;
  makeStonePath(scene, [
    [cx - 3, cz + 245],
    [cx - 34, cz + 150],
    [cx - 72, cz + 70],
    [cx - 54, cz + 12],
    [cx + 8, cz - 40],
    [cx + 8, cz - 120],
  ], 8.5, 58);
  makeStonePath(scene, [
    [cx - 130, cz + 35],
    [cx - 72, cz + 20],
    [cx, cz + 5],
    [cx + 85, cz + 18],
    [cx + 170, cz - 25],
  ], 7.5, 50);
  makeStonePath(scene, [
    [cx - 90, cz - 70],
    [cx - 24, cz - 48],
    [cx + 45, cz - 80],
    [cx + 110, cz - 60],
  ], 6.8, 34);
}

function makeWaterGarden(scene) {
  const cx = WORLD.center.x;
  const cz = WORLD.center.y;
  const waterMaterial = material(0x92bec0, {
    roughness: 0.32,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(70, 48), waterMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.24, 0.85, 1);
  pond.position.set(cx + 22, WORLD.groundY + 0.32, cz + 47);
  scene.add(pond);

  const streamPoints = [
    new THREE.Vector3(cx + 6, WORLD.seaY + 0.16, cz + 282),
    new THREE.Vector3(cx - 8, 19, cz + 205),
    new THREE.Vector3(cx + 5, 23, cz + 130),
    new THREE.Vector3(cx + 20, WORLD.groundY + 0.25, cz + 70),
  ];
  const curve = new THREE.CatmullRomCurve3(streamPoints);
  const positions = [];
  const indices = [];
  const segments = 48;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const width = lerp(27, 16, t);
    for (const direction of [-1, 1]) {
      const edge = point.clone().addScaledVector(side, width * direction);
      positions.push(edge.x, edge.y, edge.z);
    }
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const stream = new THREE.Mesh(geometry, waterMaterial);
  stream.renderOrder = 2;
  scene.add(stream);

  // Lily pads preserve the highly visible dotted surface of the reference pond.
  const padCount = variantKey === "C" ? 70 : 145;
  const padGeometry = new THREE.CircleGeometry(1, 10);
  padGeometry.rotateX(-Math.PI / 2);
  const padMaterial = material(0x668f49, { roughness: 0.9, side: THREE.DoubleSide });
  const pads = new THREE.InstancedMesh(padGeometry, padMaterial, padCount);
  const rng = mulberry32(config.seed + 440);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < padCount; i++) {
    const angle = rng() * TAU;
    const radius = Math.sqrt(rng());
    const x = cx + 22 + Math.cos(angle) * radius * 76;
    const z = cz + 47 + Math.sin(angle) * radius * 50;
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    const size = 0.8 + rng() * 2.2;
    scale.set(size, size, size);
    matrix.compose(new THREE.Vector3(x, WORLD.groundY + 0.48, z), quaternion, scale);
    pads.setMatrixAt(i, matrix);
  }
  pads.instanceMatrix.needsUpdate = true;
  scene.add(pads);
}

function makeBridge(scene, x, z, rotation = 0, scale = 1) {
  const group = new THREE.Group();
  const plankCount = 17;
  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1);
    const localX = lerp(-19, 19, t) * scale;
    const y = (2.2 + Math.sin(t * Math.PI) * 7) * scale;
    const plank = makeBox(3 * scale, 0.8 * scale, 11 * scale, materials.bridge);
    plank.position.set(localX, y, 0);
    plank.rotation.z = -Math.cos(t * Math.PI) * 0.24;
    group.add(plank);
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const post = makeBox(0.65 * scale, 5 * scale, 0.65 * scale, materials.bridgeDark);
        post.position.set(localX, y + 2.4 * scale, side * 6 * scale);
        group.add(post);
      }
    }
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(20 * scale, 0.55 * scale, 6, 32, Math.PI),
      materials.bridge,
    );
    rail.rotation.set(0, 0, 0);
    rail.position.set(0, 4.2 * scale, side * 6 * scale);
    group.add(rail);
  }
  group.rotation.y = rotation;
  group.position.set(x, WORLD.groundY + 0.2, z);
  scene.add(setShadow(group));
}

function palmLeafGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, -0.95, -0.12, 4.0, 0, -0.82, 7.0, 0, 0, 0, 0.95, -0.12, 4.0, 0, -0.82, 7.0],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.computeVertexNormals();
  return geometry;
}

function makePalmRing(scene) {
  const count = Math.round(164 * config.foliage);
  const leavesPerPalm = variantKey === "C" ? 6 : 8;
  const trunkGeometry = new THREE.CylinderGeometry(0.55, 1.15, 1, 6);
  const leafGeometry = palmLeafGeometry();
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.leaf, count);
  const leaves = new THREE.InstancedMesh(
    leafGeometry,
    materials.leaf,
    count * leavesPerPalm,
  );
  const rng = mulberry32(config.seed + 100);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const leafColor = new THREE.Color();
  let palmIndex = 0;
  let leafIndex = 0;
  let attempts = 0;
  while (palmIndex < count && attempts++ < count * 20) {
    const angle = rng() * TAU;
    const radial = 0.76 + rng() * 0.2;
    const x = WORLD.center.x + Math.cos(angle) * WORLD.coast.x * radial;
    const z = WORLD.center.y + Math.sin(angle) * WORLD.coast.y * radial;
    if (coastField(x, z) < 0.04) continue;
    // Keep the reference's open foreground mouth visible.
    if (z > WORLD.center.y + 125 && Math.abs(x - WORLD.center.x) < 78) continue;
    const y = islandHeight(x, z);
    const height = 18 + rng() * 15;
    position.set(x, y + height * 0.5, z);
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.12, rng() * TAU, (rng() - 0.5) * 0.12));
    scale.set(1, height, 1);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(palmIndex, matrix);
    const crownSize = 3.4 + rng() * 2.3;
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.95, z),
      quaternion,
      new THREE.Vector3(crownSize * 1.45, crownSize * 0.62, crownSize * 1.45),
    );
    crowns.setMatrixAt(palmIndex, matrix);
    for (let leaf = 0; leaf < leavesPerPalm; leaf++) {
      const leafAngle = (leaf / leavesPerPalm) * TAU + rng() * 0.28;
      position.set(x, y + height * 0.94, z);
      quaternion.setFromEuler(
        new THREE.Euler(-0.08 + rng() * 0.2, leafAngle, (rng() - 0.5) * 0.18),
      );
      const length = 1.18 + rng() * 0.5;
      scale.set(length, length, length);
      matrix.compose(position, quaternion, scale);
      leaves.setMatrixAt(leafIndex, matrix);
      leaves.setColorAt(
        leafIndex,
        leafColor.setHSL(0.25 + rng() * 0.06, 0.38, 0.24 + rng() * 0.1),
      );
      leafIndex++;
    }
    palmIndex++;
  }
  trunks.count = palmIndex;
  crowns.count = palmIndex;
  leaves.count = leafIndex;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  trunks.castShadow = crowns.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = crowns.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks, crowns, leaves);
  stats.palms = palmIndex;
}

function makeBlossomGrove(scene) {
  const treeCount = Math.round(76 * config.foliage);
  const puffsPerTree = variantKey === "C" ? 2 : 3;
  const trunkGeometry = new THREE.CylinderGeometry(0.45, 0.75, 1, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1, variantKey === "B" ? 2 : 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, treeCount);
  const crowns = new THREE.InstancedMesh(
    crownGeometry,
    materials.blossom,
    treeCount * puffsPerTree,
  );
  const rng = mulberry32(config.seed + 230);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let crownIndex = 0;
  for (let tree = 0; tree < treeCount; tree++) {
    const x = WORLD.center.x - 25 + (rng() * 2 - 1) * 172;
    const z = WORLD.center.y - 104 + (rng() * 2 - 1) * 88;
    const y = islandHeight(x, z);
    const height = 10 + rng() * 9;
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.5, z),
      quaternion,
      new THREE.Vector3(1, height, 1),
    );
    trunks.setMatrixAt(tree, matrix);
    for (let puff = 0; puff < puffsPerTree; puff++) {
      const puffAngle = (puff / puffsPerTree) * TAU + rng();
      const size = 4.5 + rng() * 3.6;
      matrix.compose(
        new THREE.Vector3(
          x + Math.cos(puffAngle) * size * 0.45,
          y + height + (rng() - 0.3) * 2.5,
          z + Math.sin(puffAngle) * size * 0.45,
        ),
        quaternion,
        new THREE.Vector3(size * 1.25, size, size * 1.1),
      );
      crowns.setMatrixAt(crownIndex, matrix);
      crowns.setColorAt(
        crownIndex,
        color.setHSL(0.96 + rng() * 0.035, 0.55, 0.7 + rng() * 0.12),
      );
      crownIndex++;
    }
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);
  stats.blossoms = treeCount;
}

function makeBambooBank(scene) {
  const count = Math.round(145 * config.foliage);
  const stemGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
  const leafGeometry = new THREE.IcosahedronGeometry(1, 0);
  const stems = new THREE.InstancedMesh(stemGeometry, materials.bamboo, count);
  const leaves = new THREE.InstancedMesh(leafGeometry, materials.bambooLeaf, count);
  const rng = mulberry32(config.seed + 330);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = rng() * TAU;
    const radius = Math.sqrt(rng());
    const x = WORLD.center.x + 145 + Math.cos(angle) * radius * 82;
    const z = WORLD.center.y + 75 + Math.sin(angle) * radius * 112;
    const y = islandHeight(x, z);
    const height = 13 + rng() * 18;
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.06, rng() * TAU, (rng() - 0.5) * 0.06));
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.5, z),
      quaternion,
      new THREE.Vector3(1, height, 1),
    );
    stems.setMatrixAt(i, matrix);
    matrix.compose(
      new THREE.Vector3(x, y + height, z),
      quaternion,
      new THREE.Vector3(1.8 + rng() * 1.8, 1.25 + rng() * 1.25, 1.8 + rng() * 1.8),
    );
    leaves.setMatrixAt(i, matrix);
    leaves.setColorAt(i, color.setHSL(0.25 + rng() * 0.06, 0.35, 0.33 + rng() * 0.12));
  }
  stems.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  stems.castShadow = leaves.castShadow = true;
  scene.add(stems, leaves);
  stats.bamboo = count;
}

function makeShoreRocks(scene) {
  const count = Math.round(900 * config.foliage);
  const geometry = new THREE.IcosahedronGeometry(1, variantKey === "B" ? 1 : 0);
  const rockMaterial = material(0xa9a18a, { roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geometry, rockMaterial, count);
  const rng = mulberry32(config.seed + 771);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts++ < count * 30) {
    const angle = rng() * TAU;
    const radius = Math.sqrt(rng());
    const x = WORLD.center.x + Math.cos(angle) * WORLD.coast.x * radius;
    const z = WORLD.center.y + Math.sin(angle) * WORLD.coast.y * radius;
    const field = coastField(x, z);
    if (field < 0.015 || field > 0.22) continue;
    const y = islandHeight(x, z);
    const size = 0.25 + Math.pow(rng(), 2.2) * 2.2;
    quaternion.setFromEuler(new THREE.Euler(rng(), rng() * TAU, rng()));
    scale.set(size * (0.6 + rng()), size * (0.45 + rng() * 0.5), size * (0.6 + rng()));
    matrix.compose(new THREE.Vector3(x, y + size * 0.2, z), quaternion, scale);
    rocks.setMatrixAt(placed, matrix);
    rocks.setColorAt(placed, color.setHSL(0.1 + rng() * 0.04, 0.12, 0.55 + rng() * 0.28));
    placed++;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
  stats.rocks = placed;
}

function makeFlowerBeds(scene) {
  const count = Math.round(480 * config.foliage);
  const geometry = new THREE.IcosahedronGeometry(0.55, 0);
  const flowerMaterial = material(0xdf504d, { roughness: 0.9, emissive: 0x2a0303, emissiveIntensity: 0.1 });
  const flowers = new THREE.InstancedMesh(geometry, flowerMaterial, count);
  const rng = mulberry32(config.seed + 612);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const cluster = i % 2;
    const cx = WORLD.center.x + (cluster ? 72 : -72);
    const cz = WORLD.center.y + (cluster ? 54 : 8);
    const x = cx + (rng() * 2 - 1) * (cluster ? 55 : 78);
    const z = cz + (rng() * 2 - 1) * (cluster ? 82 : 54);
    const y = islandHeight(x, z);
    const size = 0.45 + rng() * 0.75;
    matrix.compose(
      new THREE.Vector3(x, y + 1 + rng() * 1.5, z),
      new THREE.Quaternion(),
      new THREE.Vector3(size, size, size),
    );
    flowers.setMatrixAt(i, matrix);
    flowers.setColorAt(i, color.setHSL((0.97 + rng() * 0.11) % 1, 0.62, 0.48 + rng() * 0.2));
  }
  flowers.instanceMatrix.needsUpdate = true;
  flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);
}

function makeBirds(scene) {
  const positions = [];
  const rng = mulberry32(config.seed + 91);
  for (let i = 0; i < 18; i++) {
    const x = WORLD.center.x + (rng() * 2 - 1) * 430;
    const y = 120 + rng() * 110;
    const z = WORLD.center.y - 80 + (rng() * 2 - 1) * 310;
    const size = 2 + rng() * 2.6;
    positions.push(x - size, y, z, x, y - size * 0.35, z, x, y - size * 0.35, z, x + size, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const birds = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x36424a, transparent: true, opacity: 0.72 }),
  );
  scene.add(birds);
}

function wireSwitcher() {
  const keys = Object.keys(VARIANTS);
  const index = keys.indexOf(variantKey);
  document.getElementById("variant-label").textContent = `${variantKey} — ${config.name}`;
  document.getElementById("variant-name").textContent = config.name;
  document.getElementById("variant-description").textContent = config.description;
  document.getElementById("seed").textContent = config.seed;
  const navigate = (offset) => {
    const next = keys[(index + offset + keys.length) % keys.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    location.href = url.toString();
  };
  document.getElementById("previous-variant").addEventListener("click", () => navigate(-1));
  document.getElementById("next-variant").addEventListener("click", () => navigate(1));
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target?.matches?.("input, textarea, [contenteditable]")) return;
    if (event.key === "ArrowLeft") navigate(-1);
    if (event.key === "ArrowRight") navigate(1);
  });
}

async function init() {
  wireSwitcher();
  await tick("Building the reference-scale coastline…", 0.05);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.palette.skyHorizon);
  scene.fog = new THREE.Fog(
    config.palette.skyHorizon,
    780 / config.fogDensity,
    2750 / config.fogDensity,
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(Number(query.get("dpr")) || devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = config.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 8000);
  camera.position.set(WORLD.center.x + 520, 330, WORLD.center.y + 650);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(WORLD.center.x + 5, WORLD.groundY + 12, WORLD.center.y - 8);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 95;
  controls.maxDistance = 1300;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = query.get("tour") === "1";
  controls.autoRotateSpeed = 0.38;
  controls.update();

  const hemi = new THREE.HemisphereLight(0xddebf2, 0x947747, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffddaa, 3.15);
  sun.position.set(-520, 570, -430);
  sun.target.position.set(WORLD.center.x, WORLD.groundY, WORLD.center.y);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -480;
  sun.shadow.camera.right = 480;
  sun.shadow.camera.top = 480;
  sun.shadow.camera.bottom = -480;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1450;
  sun.shadow.bias = -0.00045;
  scene.add(sun, sun.target);
  scene.add(new THREE.AmbientLight(0xfff2dc, 0.34));

  makeSky(scene);
  const { oceanMaterial } = makeOcean(scene);
  await tick("Raising the island and distant mountain ring…", 0.2);
  makeTerrain(scene);
  makeMountainRing(scene);
  const clouds = makeClouds(scene);

  await tick("Laying out the water garden, paths and bridges…", 0.42);
  makeWaterGarden(scene);
  makePaths(scene);
  makeBridge(scene, WORLD.center.x + 36, WORLD.center.y + 54, 0.08, 1.08);
  makeBridge(scene, WORLD.center.x - 26, WORLD.center.y + 125, -0.18, 0.72);

  await tick("Rebuilding village silhouettes and landmarks…", 0.58);
  makeVillage(scene);

  await tick("Growing palms, blossoms and bamboo…", 0.74);
  makePalmRing(scene);
  makeBlossomGrove(scene);
  makeBambooBank(scene);
  makeFlowerBeds(scene);

  await tick("Scattering the beach and finishing atmosphere…", 0.9);
  makeShoreRocks(scene);
  makeBirds(scene);

  const clock = new THREE.Clock();
  let elapsed = 0;
  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      controls.autoRotate = !controls.autoRotate;
    }
  });

  function render() {
    requestAnimationFrame(render);
    const delta = Math.min(clock.getDelta(), 0.05);
    elapsed += delta;
    oceanMaterial.uniforms.time.value = elapsed;
    clouds.rotation.y += delta * 0.0025;
    controls.update();
    renderer.render(scene, camera);
  }
  render();

  const drawStats = () => {
    statsElement.innerHTML = [
      `${stats.terrainVertices.toLocaleString()} terrain vertices`,
      `${stats.buildings} buildings`,
      `${stats.palms} palms`,
      `${stats.blossoms} blossom trees`,
      `${stats.bamboo} bamboo`,
      `${stats.mountains} horizon peaks`,
    ].map((value) => `<span>${value}</span>`).join("");
  };
  drawStats();

  Object.assign(runtime, {
    ready: true,
    variant: variantKey,
    config,
    scene,
    camera,
    renderer,
    controls,
    stats,
    referenceIndependent: true,
    setCamera(px, py, pz, lx, ly, lz) {
      camera.position.set(px, py, pz);
      controls.target.set(lx, ly, lz);
      controls.update();
    },
  });
  document.body.dataset.state = "ready";
  document.body.dataset.variant = variantKey;
  document.body.dataset.referenceIndependent = "true";
  document.body.dataset.sceneStats = JSON.stringify(stats);
  document.title = `SCENE_READY · ${variantKey} · ${config.name}`;
  await tick("Island ready", 1);
  document.getElementById("loading").classList.add("done");
}

init().catch((error) => {
  console.error(error);
  runtime.error = error.stack || error.message || String(error);
  document.body.dataset.state = "error";
  document.title = "SCENE_ERROR";
  const errorElement = document.getElementById("error");
  errorElement.style.display = "block";
  errorElement.textContent = runtime.error;
});
