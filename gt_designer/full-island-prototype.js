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
import { REFERENCE_LAYOUT } from "./full-island-layout.generated.js";

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
const measuredWorld = REFERENCE_LAYOUT.world;
const WORLD = {
  center: new THREE.Vector2(...measuredWorld.center),
  coast: new THREE.Vector2(...measuredWorld.coast),
  flat: new THREE.Vector2(...measuredWorld.flat),
  seaY: measuredWorld.seaY,
  groundY: measuredWorld.groundY,
  oceanFloor: measuredWorld.oceanFloor,
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
  decorations: 0,
  wildlife: 0,
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

function measuredCoastRadius(angle) {
  const radii = REFERENCE_LAYOUT.terrain.coastlineRadii;
  const normalized = ((angle / TAU) % 1 + 1) % 1;
  const sample = normalized * radii.length;
  const index = Math.floor(sample);
  const next = (index + 1) % radii.length;
  return lerp(radii[index], radii[next], sample - index);
}

function coastField(x, z) {
  const dx = x - WORLD.center.x;
  const dz = z - WORLD.center.y;
  const distance = Math.hypot(dx, dz);
  const radius = measuredCoastRadius(Math.atan2(dz, dx));
  const edgeNoise = fbm(x * 0.012, z * 0.012, 2) * 2.2;
  return 1 - distance / Math.max(24, radius + edgeNoise);
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

  const land = smooth(0.02, 0.16, field);
  let relief = 0;
  for (const feature of REFERENCE_LAYOUT.terrain.relief) {
    relief = Math.max(
      relief,
      feature.height * gaussian(
        x,
        z,
        feature.position[0],
        feature.position[1],
        feature.radius,
        feature.radius,
      ),
    );
  }
  height += land * relief;
  height += land * fbm(x * 0.035, z * 0.035, 2) * 0.34;
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
  plaza: material(0xb98b69, { roughness: 1 }),
  bridge: material(0xb9332e, { roughness: 0.8 }),
  bridgeDark: material(0x772923, { roughness: 0.86 }),
  leaf: material(0x284b28, { roughness: 0.98, side: THREE.DoubleSide }),
  trunk: material(0x715038, { roughness: 1 }),
  blossom: material(0xf0a8b2, { roughness: 0.95, flatShading: true }),
  blossomLight: material(0xf5c0c4, { roughness: 0.95, flatShading: true }),
  bamboo: material(0x81a45e, { roughness: 0.95 }),
  bambooLeaf: material(0x729757, { roughness: 0.98, flatShading: true }),
  pandaWhite: material(0xe8e4d7, { roughness: 0.96 }),
  pandaBlack: material(0x1f2522, { roughness: 0.92 }),
  lanternGlow: material(0xffc15c, {
    roughness: 0.6,
    emissive: 0xff7b24,
    emissiveIntensity: 0.85,
  }),
  mushroom: material(0xd7644f, { roughness: 0.9 }),
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
  const records = REFERENCE_LAYOUT.mountains;
  const lobes = [];
  for (const [mountainIndex, record] of records.entries()) {
    const [width, height, depth] = record.size;
    const alongX = width >= depth;
    const major = Math.max(width, depth);
    const minor = Math.min(width, depth);
    const count = clamp(Math.round(major / 250), 2, variantKey === "C" ? 4 : 7);
    const rng = mulberry32(config.seed + 9001 + mountainIndex * 97);
    for (let index = 0; index < count; index++) {
      const t = count === 1 ? 0 : index / (count - 1) - 0.5;
      const offset = t * major * 0.72;
      lobes.push({
        x: record.position[0] + (alongX ? offset : 0),
        z: record.position[2] + (alongX ? 0 : offset),
        y: record.position[1],
        width: Math.max(90, (major / count) * (0.92 + rng() * 0.35)),
        depth: Math.max(90, minor * (0.43 + rng() * 0.2)),
        height: height * (0.62 + rng() * 0.38),
        yaw: record.yaw + (rng() - 0.5) * 0.16,
      });
    }
  }
  const count = lobes.length;
  const baseGeometry = new THREE.ConeGeometry(1, 1, variantKey === "C" ? 5 : 7, 1);
  const peakGeometry = new THREE.ConeGeometry(1, 1, variantKey === "B" ? 8 : 6, 1);
  const baseMaterial = material(0x718664, { roughness: 1, flatShading: true });
  const peakMaterial = material(0xb9aa88, { roughness: 1, flatShading: true });
  const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, count);
  const peaks = new THREE.InstancedMesh(peakGeometry, peakMaterial, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const green = new THREE.Color();
  const stone = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const lobe = lobes[i];
    position.set(
      lobe.x,
      lobe.y + lobe.height * 0.5,
      lobe.z,
    );
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lobe.yaw);
    scale.set(lobe.width * 0.58, lobe.height, lobe.depth * 0.58);
    matrix.compose(position, quaternion, scale);
    bases.setMatrixAt(i, matrix);
    bases.setColorAt(
      i,
      green.setHSL(0.24 + (i % 5) * 0.006, 0.19, 0.39 + (i % 4) * 0.018),
    );

    const peakHeight = lobe.height * 0.5;
    position.y = lobe.y + lobe.height * 0.68;
    scale.set(lobe.width * 0.38, peakHeight, lobe.depth * 0.38);
    matrix.compose(position, quaternion, scale);
    peaks.setMatrixAt(i, matrix);
    peaks.setColorAt(
      i,
      stone.setHSL(0.11 + (i % 3) * 0.01, 0.23, 0.67 + (i % 4) * 0.025),
    );
  }
  bases.instanceMatrix.needsUpdate = true;
  peaks.instanceMatrix.needsUpdate = true;
  bases.instanceColor.needsUpdate = true;
  peaks.instanceColor.needsUpdate = true;
  bases.receiveShadow = peaks.receiveShadow = true;
  bases.castShadow = peaks.castShadow = true;
  scene.add(bases, peaks);
  stats.mountains = records.length;
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
  return group;
}

function makeMeasuredHouse(scene, record) {
  const [width, height, depth] = record.size;
  const group = new THREE.Group();
  group.name = `Measured procedural ${record.kind}`;
  const booth = record.kind === "ring-booth" || record.kind === "tea-booth";
  const baseHeight = Math.max(0.8, height * 0.06);
  const wallHeight = height * (booth ? 0.42 : 0.58);
  const wall = makeBox(
    width * (booth ? 0.62 : 0.82),
    wallHeight,
    depth * (booth ? 0.5 : 0.78),
    materials.plaster,
  );
  wall.position.y = baseHeight + wallHeight * 0.5;
  group.add(wall);
  const base = makeBox(width * 0.94, baseHeight, depth * 0.9, materials.stone);
  base.position.y = baseHeight * 0.5;
  group.add(base);
  for (const sideX of [-1, 1]) {
    for (const sideZ of booth ? [-1, 1] : [1]) {
      const post = makeBox(
        Math.max(0.45, width * 0.035),
        wallHeight * 0.95,
        Math.max(0.45, depth * 0.035),
        materials.darkTimber,
      );
      post.position.set(sideX * width * 0.36, wall.position.y, sideZ * depth * 0.34);
      group.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.5, 4, 1), materials.roof);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(width * 0.58, Math.max(5, height * (booth ? 0.62 : 0.52)), depth * 0.62);
  roof.position.y = height * 0.73;
  group.add(roof);
  const door = makeBox(width * 0.17, wallHeight * 0.52, 0.5, materials.darkTimber);
  door.position.set(0, baseHeight + wallHeight * 0.27, depth * 0.4);
  group.add(door);
  group.rotation.y = record.yaw;
  group.position.set(...record.position);
  scene.add(setShadow(group));
  stats.buildings += 1;
  return group;
}

function makeMeasuredLandmarkTree(scene, record) {
  const [width, height, depth] = record.size;
  const group = new THREE.Group();
  const trunkHeight = height * 0.62;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.055, width * 0.1, trunkHeight, 7),
    materials.trunk,
  );
  trunk.position.y = trunkHeight * 0.5;
  group.add(trunk);
  const crownMaterial = record.kind === "wish-tree" ? materials.blossom : materials.leaf;
  const rng = mulberry32(config.seed + Math.round(record.position[0] * 17));
  const puffs = variantKey === "C" ? 5 : 9;
  for (let index = 0; index < puffs; index++) {
    const angle = (index / puffs) * TAU;
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, variantKey === "B" ? 2 : 1),
      crownMaterial,
    );
    const radius = width * (0.23 + rng() * 0.09);
    crown.scale.set(radius, height * (0.17 + rng() * 0.05), depth * 0.26);
    crown.position.set(
      Math.cos(angle) * width * 0.22,
      height * (0.68 + rng() * 0.12),
      Math.sin(angle) * depth * 0.22,
    );
    group.add(crown);
  }
  group.rotation.y = record.yaw;
  group.position.set(...record.position);
  scene.add(setShadow(group));
  stats.buildings += 1;
}

function makeVillage(scene) {
  for (const record of REFERENCE_LAYOUT.structures) {
    if (["shop", "dessert-shop", "dumpling-house", "fruit-shop", "ring-booth", "tea-booth"].includes(record.kind)) {
      makeMeasuredHouse(scene, record);
    } else if (record.kind === "pavilion-tower") {
      const scale = record.size[1] / 34;
      const group = makePagoda(scene, record.position[0], record.position[2], scale, variantKey === "C" ? 2 : 3);
      group.position.y = record.position[1];
      group.rotation.y = record.yaw;
    } else if (record.kind === "pavilion") {
      const group = makePavilion(scene, record.position[0], record.position[2], record.size[1] / 24);
      group.position.y = record.position[1];
      group.rotation.y = record.yaw;
    } else {
      makeMeasuredLandmarkTree(scene, record);
    }
  }
}

function makePaths(scene) {
  for (const record of REFERENCE_LAYOUT.plazas) {
    const plaza = makeBox(record.size[0], Math.max(0.45, record.size[1]), record.size[2], materials.plaza);
    plaza.position.set(
      record.position[0],
      record.position[1] + Math.max(0.45, record.size[1]) * 0.5,
      record.position[2],
    );
    plaza.rotation.y = record.yaw;
    scene.add(plaza);
  }

  const stones = REFERENCE_LAYOUT.pathStones;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, materials.stone, stones.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (const [index, record] of stones.entries()) {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), record.yaw);
    matrix.compose(
      new THREE.Vector3(
        record.position[0],
        record.position[1] + Math.max(0.32, record.size[1]) * 0.5,
        record.position[2],
      ),
      quaternion,
      new THREE.Vector3(record.size[0], Math.max(0.32, record.size[1]), record.size[2]),
    );
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function makeWaterGarden(scene) {
  const waterMaterial = material(0x92bec0, {
    roughness: 0.32,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const radii = REFERENCE_LAYOUT.terrain.coastlineRadii;
  const inletIndex = radii.indexOf(Math.min(...radii));
  const inletAngle = (inletIndex / radii.length) * TAU;
  const inletDirection = new THREE.Vector2(Math.cos(inletAngle), Math.sin(inletAngle));
  const innerInlet = new THREE.Vector2(
    WORLD.center.x + inletDirection.x * radii[inletIndex],
    WORLD.center.y + inletDirection.y * radii[inletIndex],
  );
  const outerInlet = new THREE.Vector2(
    WORLD.center.x + inletDirection.x * 390,
    WORLD.center.y + inletDirection.y * 390,
  );
  const bridgeCenters = REFERENCE_LAYOUT.bridges.map(
    (record) => new THREE.Vector2(record.position[0], record.position[2]),
  );
  const pondCenter = bridgeCenters[0] ?? innerInlet;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(54, 48), waterMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.18, 0.82, 1);
  pond.position.set(pondCenter.x, WORLD.seaY + 0.22, pondCenter.y);
  scene.add(pond);

  const streamPoints = [
    new THREE.Vector3(outerInlet.x, WORLD.seaY + 0.12, outerInlet.y),
    new THREE.Vector3(pondCenter.x, WORLD.seaY + 0.18, pondCenter.y),
    new THREE.Vector3(innerInlet.x, WORLD.seaY + 0.2, innerInlet.y),
    new THREE.Vector3(
      bridgeCenters[1]?.x ?? WORLD.center.x,
      WORLD.seaY + 0.22,
      bridgeCenters[1]?.y ?? WORLD.center.y - 70,
    ),
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
    const width = lerp(36, 15, t);
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
    const x = pondCenter.x + Math.cos(angle) * radius * 58;
    const z = pondCenter.y + Math.sin(angle) * radius * 44;
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    const size = 0.8 + rng() * 2.2;
    scale.set(size, size, size);
    matrix.compose(new THREE.Vector3(x, WORLD.seaY + 0.42, z), quaternion, scale);
    pads.setMatrixAt(i, matrix);
  }
  pads.instanceMatrix.needsUpdate = true;
  scene.add(pads);
}

function makeBridge(scene, record) {
  const group = new THREE.Group();
  const span = Math.max(record.size[0], record.size[2]) * 0.78;
  const width = Math.min(record.size[0], record.size[2]) * 0.2;
  const archHeight = Math.max(4, record.size[1] * 0.42);
  const plankCount = variantKey === "C" ? 15 : 23;
  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1);
    const localX = lerp(-span * 0.5, span * 0.5, t);
    const y = 0.8 + Math.sin(t * Math.PI) * archHeight;
    const plank = makeBox(span / plankCount * 1.2, 0.75, width, materials.bridge);
    plank.position.set(localX, y, 0);
    plank.rotation.z = -Math.cos(t * Math.PI) * 0.24;
    group.add(plank);
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const post = makeBox(0.6, 4.4, 0.6, materials.bridgeDark);
        post.position.set(localX, y + 2.2, side * width * 0.56);
        group.add(post);
      }
    }
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(span * 0.5, 0.5, 6, 40, Math.PI),
      materials.bridge,
    );
    rail.position.set(0, 2.9, side * width * 0.56);
    group.add(rail);
  }
  group.rotation.y = record.yaw;
  group.position.set(...record.position);
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
  const records = variantKey === "C"
    ? REFERENCE_LAYOUT.palms.filter((_, index) => index % 2 === 0)
    : REFERENCE_LAYOUT.palms;
  const count = records.length;
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
  let leafIndex = 0;
  for (const [palmIndex, record] of records.entries()) {
    const x = record.position[0];
    const y = record.position[1];
    const z = record.position[2];
    const width = Math.max(12, Math.max(record.size[0], record.size[2]));
    const height = Math.max(18, record.size[1] * 0.78);
    position.set(x, y + height * 0.5, z);
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.08, record.yaw, (rng() - 0.5) * 0.08));
    const trunkRadius = clamp(width * 0.045, 0.7, 1.6);
    scale.set(trunkRadius, height, trunkRadius);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(palmIndex, matrix);
    const crownSize = width * 0.18;
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.96, z),
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
      const length = width / 14 * (0.9 + rng() * 0.18);
      scale.set(length, length, length);
      matrix.compose(position, quaternion, scale);
      leaves.setMatrixAt(leafIndex, matrix);
      leaves.setColorAt(
        leafIndex,
        leafColor.setHSL(0.25 + rng() * 0.06, 0.38, 0.24 + rng() * 0.1),
      );
      leafIndex++;
    }
  }
  leaves.count = leafIndex;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  trunks.castShadow = crowns.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = crowns.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks, crowns, leaves);
  stats.palms = records.length;
}

function makeBlossomGrove(scene) {
  const records = variantKey === "C"
    ? REFERENCE_LAYOUT.blossoms.filter((_, index) => index % 2 === 0)
    : REFERENCE_LAYOUT.blossoms;
  const treeCount = records.length;
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
  for (const [tree, record] of records.entries()) {
    const x = record.position[0];
    const y = record.position[1];
    const z = record.position[2];
    const height = Math.max(10, record.size[1] * 0.7);
    const width = Math.max(10, Math.max(record.size[0], record.size[2]));
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), record.yaw);
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.5, z),
      quaternion,
      new THREE.Vector3(clamp(width * 0.035, 0.5, 1.2), height, clamp(width * 0.035, 0.5, 1.2)),
    );
    trunks.setMatrixAt(tree, matrix);
    for (let puff = 0; puff < puffsPerTree; puff++) {
      const puffAngle = (puff / puffsPerTree) * TAU + rng();
      const size = width * (0.2 + rng() * 0.08);
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
  const records = variantKey === "C"
    ? REFERENCE_LAYOUT.bamboo.filter((_, index) => index % 2 === 0)
    : REFERENCE_LAYOUT.bamboo;
  const stemsPerClump = variantKey === "B" ? 4 : variantKey === "C" ? 2 : 3;
  const count = records.length * stemsPerClump;
  const stemGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
  const leafGeometry = new THREE.IcosahedronGeometry(1, 0);
  const stems = new THREE.InstancedMesh(stemGeometry, materials.bamboo, count);
  const leaves = new THREE.InstancedMesh(leafGeometry, materials.bambooLeaf, count);
  const rng = mulberry32(config.seed + 330);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const record = records[Math.floor(i / stemsPerClump)];
    const x = record.position[0] + (rng() - 0.5) * Math.min(record.size[0] * 0.45, 7);
    const z = record.position[2] + (rng() - 0.5) * Math.min(record.size[2] * 0.45, 7);
    const y = record.position[1];
    const height = Math.max(12, record.size[1] * (0.72 + rng() * 0.22));
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
  stats.bamboo = records.length;
}

function makeShoreRocks(scene) {
  const records = variantKey === "C"
    ? REFERENCE_LAYOUT.rocks.filter((_, index) => index % 2 === 0)
    : REFERENCE_LAYOUT.rocks;
  const count = records.length;
  const geometry = new THREE.IcosahedronGeometry(1, variantKey === "B" ? 1 : 0);
  const rockMaterial = material(0xa9a18a, { roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geometry, rockMaterial, count);
  const rng = mulberry32(config.seed + 771);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (const [index, record] of records.entries()) {
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.3, record.yaw, rng() * 0.3));
    scale.set(record.size[0] * 0.58, record.size[1] * 0.58, record.size[2] * 0.58);
    matrix.compose(
      new THREE.Vector3(
        record.position[0],
        record.position[1] + record.size[1] * 0.5,
        record.position[2],
      ),
      quaternion,
      scale,
    );
    rocks.setMatrixAt(index, matrix);
    rocks.setColorAt(index, color.setHSL(0.1 + rng() * 0.04, 0.12, 0.55 + rng() * 0.28));
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
  stats.rocks = records.length;
}

function makeDecorations(scene) {
  const records = variantKey === "C"
    ? REFERENCE_LAYOUT.decorations.filter((_, index) => index % 2 === 0)
    : REFERENCE_LAYOUT.decorations;
  const rng = mulberry32(config.seed + 811);
  for (const record of records) {
    const [width, height, depth] = record.size;
    const group = new THREE.Group();
    if (record.kind === "umbrella") {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(0.18, width * 0.018), Math.max(0.2, width * 0.022), height * 0.75, 8),
        materials.darkTimber,
      );
      pole.position.y = height * 0.375;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(width * 0.5, height * 0.18, variantKey === "C" ? 10 : 18),
        materials.roof,
      );
      canopy.position.y = height * 0.82;
      canopy.scale.z = depth / Math.max(width, 0.1);
      group.add(pole, canopy);
    } else if (record.kind === "lantern") {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(0.12, width * 0.04), Math.max(0.16, width * 0.055), height * 0.82, 7),
        materials.darkTimber,
      );
      post.position.y = height * 0.41;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.5, width * 0.24), 9, 7),
        materials.lanternGlow,
      );
      glow.scale.y = 1.25;
      glow.position.y = height * 0.78;
      group.add(post, glow);
    } else if (record.kind === "mushroom") {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.14, width * 0.2, height * 0.62, 8),
        materials.plaster,
      );
      stem.position.y = height * 0.31;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI * 0.52),
        materials.mushroom,
      );
      cap.scale.set(width * 0.52, height * 0.28, depth * 0.52);
      cap.position.y = height * 0.58;
      group.add(stem, cap);
    } else if (record.kind === "grass-clump") {
      const blades = variantKey === "C" ? 4 : 8;
      for (let index = 0; index < blades; index++) {
        const blade = new THREE.Mesh(
          new THREE.ConeGeometry(width * 0.04, height * (0.48 + rng() * 0.42), 3),
          materials.leaf,
        );
        blade.position.set((rng() - 0.5) * width * 0.7, blade.geometry.parameters.height * 0.5, (rng() - 0.5) * depth * 0.7);
        blade.rotation.z = (rng() - 0.5) * 0.35;
        group.add(blade);
      }
    } else if (record.kind === "stone-platform") {
      const platform = makeBox(width, Math.max(0.45, height), depth, materials.stone);
      platform.position.y = Math.max(0.45, height) * 0.5;
      group.add(platform);
    } else if (record.kind === "campfire") {
      for (const angle of [Math.PI * 0.25, -Math.PI * 0.25]) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(height * 0.12, height * 0.12, width * 0.8, 7),
          materials.darkTimber,
        );
        log.rotation.z = Math.PI * 0.5;
        log.rotation.y = angle;
        log.position.y = height * 0.16;
        group.add(log);
      }
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(width * 0.22, height * 0.7, 8),
        materials.lanternGlow,
      );
      flame.position.y = height * 0.42;
      group.add(flame);
    } else if (record.kind === "stone-table") {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.48, width * 0.48, height * 0.16, 12),
        materials.stone,
      );
      top.position.y = height * 0.72;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.13, width * 0.18, height * 0.7, 10),
        materials.stone,
      );
      leg.position.y = height * 0.35;
      group.add(top, leg);
    } else if (record.kind === "willow") {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.05, width * 0.09, height * 0.7, 7),
        materials.trunk,
      );
      trunk.position.y = height * 0.35;
      group.add(trunk);
      for (let index = 0; index < 9; index++) {
        const crown = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          materials.leaf,
        );
        const angle = (index / 9) * TAU;
        crown.scale.set(width * 0.2, height * 0.27, depth * 0.2);
        crown.position.set(Math.cos(angle) * width * 0.25, height * (0.63 + rng() * 0.12), Math.sin(angle) * depth * 0.25);
        group.add(crown);
      }
    } else if (record.kind === "bamboo-pile" || record.kind === "bamboo-shoot") {
      const stemCount = record.kind === "bamboo-pile" ? 6 : 3;
      for (let index = 0; index < stemCount; index++) {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(width * 0.035, width * 0.05, height * (0.7 + rng() * 0.3), 6),
          materials.bamboo,
        );
        stem.position.set((rng() - 0.5) * width * 0.6, stem.geometry.parameters.height * 0.5, (rng() - 0.5) * depth * 0.6);
        group.add(stem);
      }
    } else if (record.kind === "panda-statue") {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), materials.stone);
      body.scale.set(width * 0.35, height * 0.36, depth * 0.34);
      body.position.y = height * 0.34;
      const head = body.clone();
      head.scale.set(width * 0.28, height * 0.25, depth * 0.28);
      head.position.y = height * 0.72;
      group.add(body, head);
    } else if (record.kind === "flower-bed") {
      const count = variantKey === "C" ? 12 : 28;
      for (let index = 0; index < count; index++) {
        const flower = new THREE.Mesh(
          new THREE.IcosahedronGeometry(Math.max(0.18, height * 0.12), 0),
          index % 3 === 0 ? materials.blossomLight : materials.mushroom,
        );
        flower.position.set(
          (rng() - 0.5) * width,
          height * (0.35 + rng() * 0.45),
          (rng() - 0.5) * depth,
        );
        group.add(flower);
      }
    }
    group.rotation.y = record.yaw;
    group.position.set(...record.position);
    scene.add(setShadow(group));
  }
  stats.decorations = records.length;
}

function makeWildlife(scene) {
  const sphere = new THREE.SphereGeometry(1, variantKey === "C" ? 8 : 12, variantKey === "C" ? 6 : 9);
  for (const record of REFERENCE_LAYOUT.wildlife) {
    const group = new THREE.Group();
    const scale = record.scale / 2;
    const body = new THREE.Mesh(sphere, materials.pandaWhite);
    body.scale.set(1.55 * scale, 1.9 * scale, 1.3 * scale);
    body.position.y = 2.05 * scale;
    const head = new THREE.Mesh(sphere, materials.pandaWhite);
    head.scale.set(1.22 * scale, 1.1 * scale, 1.05 * scale);
    head.position.set(0, 4.1 * scale, 0.15 * scale);
    group.add(body, head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(sphere, materials.pandaBlack);
      ear.scale.setScalar(0.4 * scale);
      ear.position.set(side * 0.82 * scale, 4.92 * scale, 0.08 * scale);
      const eye = new THREE.Mesh(sphere, materials.pandaBlack);
      eye.scale.set(0.28 * scale, 0.4 * scale, 0.16 * scale);
      eye.position.set(side * 0.47 * scale, 4.25 * scale, 1.0 * scale);
      const arm = new THREE.Mesh(sphere, materials.pandaBlack);
      arm.scale.set(0.46 * scale, 1.0 * scale, 0.48 * scale);
      arm.position.set(side * 1.27 * scale, 2.5 * scale, 0);
      arm.rotation.z = side * 0.32;
      const leg = new THREE.Mesh(sphere, materials.pandaBlack);
      leg.scale.set(0.6 * scale, 0.72 * scale, 0.7 * scale);
      leg.position.set(side * 0.8 * scale, 0.65 * scale, 0.12 * scale);
      group.add(ear, eye, arm, leg);
    }
    group.rotation.y = record.yaw;
    group.position.set(
      record.position[0],
      islandHeight(record.position[0], record.position[2]) + 0.12,
      record.position[2],
    );
    scene.add(setShadow(group));
  }
  stats.wildlife = REFERENCE_LAYOUT.wildlife.length;
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
  camera.position.set(390, 190, 410);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(80, 26, -20);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 95;
  controls.maxDistance = 1300;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = query.get("tour") === "1";
  controls.autoRotateSpeed = 0.38;
  const cameraValues = (query.get("campos") ?? "").split(",").map(Number);
  if (cameraValues.length === 6 && cameraValues.every(Number.isFinite)) {
    camera.position.set(...cameraValues.slice(0, 3));
    controls.target.set(...cameraValues.slice(3));
  }
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
  for (const bridge of REFERENCE_LAYOUT.bridges) makeBridge(scene, bridge);

  await tick("Rebuilding village silhouettes and landmarks…", 0.58);
  makeVillage(scene);
  makeDecorations(scene);
  makeWildlife(scene);

  await tick("Growing palms, blossoms and bamboo…", 0.74);
  makePalmRing(scene);
  makeBlossomGrove(scene);
  makeBambooBank(scene);

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
      `${stats.decorations} measured props`,
      `${stats.wildlife} pandas`,
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
    semanticLayoutVersion: REFERENCE_LAYOUT.schemaVersion,
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
