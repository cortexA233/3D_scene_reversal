// Painterly Island
//
// A cohesive Three.js scene that combines an authored village with a procedural
// coastline, ocean, vegetation, atmospheric lighting, and restrained post effects.
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { SceneBuilder } from "./src/scene-builder.js";
import { naturalDecor } from "./scene-decoration.js";
import { bindPointerLock } from "./src/pointer-lock.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ════════════════════════════════════════════════════════════════════════════
// WORLD LAYOUT
// ════════════════════════════════════════════════════════════════════════════
const WORLD = {
  groundY: 26,
  seaY: 16,
  center: [86, -24],
  flat: [255, 228],
  coast: [322, 290],
  oceanFloor: -40,
  reliefMode: "A", // 'A' = gentle edge hills/dunes · 'C' = one headland
  spawn: [40, 55, -95], // spawn near the pavilion, looking toward the shops
  lookAt: [40, 28, 40],
};

// ════════════════════════════════════════════════════════════════════════════
// ART DIRECTION
// ════════════════════════════════════════════════════════════════════════════
const STYLE = {
  name: "ghibli painterly",
  exposure: 1.0,
  toneMapping: THREE.ACESFilmicToneMapping,
  // warm, low afternoon sun that backlights the rim hills with a golden glow
  sun: { elevDeg: 23, azDeg: 60, color: 0xffce86, intensity: 2.7 },
  hemi: { sky: 0xcfe2f0, ground: 0xc6b06a, intensity: 1.12 },
  ambient: 0.34,
  ambientColor: 0xfff0d6,
  // tender warm afternoon haze; pulled in a touch for storybook depth
  fog: { color: 0xe6dcc2, near: 650, far: 3500 },
  sky: "gradient", // custom painterly dome (see makeSky)
  skyGradient: { zenith: 0x3f7ec8, horizon: 0xaccfe6 },
  water: {
    color: 0x4fb7b8,
    sunColor: 0xfff0cf,
    distortion: 1.6,
    alpha: 0.92,
    size: 2.0,
  },
  // soft pastel storybook palette
  palette: {
    sandWet: 0xcdb98a,
    sand: 0xeaddb0,
    grassLow: 0x9bc25e,
    grass: 0x86b94f,
    grassDry: 0xc3cf76,
    rock: 0x8f8a66,
    rockHi: 0xb0a87f,
  },
  grass: { on: true, count: 7000, color: 0x95c257, height: 2.6 },
  bloom: { on: true, strength: 0.26, radius: 0.7, threshold: 0.9 },
  clouds: { on: true, count: 34 },
  grain: { on: true, amount: 0.045, vignette: 0.34 },
};

// three.js example textures (grass/sand/water/etc.) — served from the GitHub repo
// via jsdelivr (the npm package omits examples/textures). Append a filename.
const TEX_CDN =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/";

// ── tiny utils + value-noise fBm ─────────────────────────────────────────────
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
  lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry32(s) {
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function h2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz),
    b = h2(ix + 1, iz),
    c = h2(ix, iz + 1),
    d = h2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z, oct = 4) {
  let a = 0,
    w = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    a += w * (vnoise(x * f + i * 9.1, z * f + i * 4.7) * 2 - 1);
    w *= 0.5;
    f *= 2.0;
  }
  return a;
}
function ridged(x, z, oct = 4) {
  let a = 0,
    w = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    const n = vnoise(x * f + i * 5.2, z * f + i * 8.3) * 2 - 1;
    a += w * (1 - Math.abs(n));
    w *= 0.5;
    f *= 2.0;
  }
  return a;
}

const loadMsg = document.getElementById("loadmsg"),
  loadBar = document.getElementById("loadbar");
const tick = (m, f) => {
  if (loadMsg) loadMsg.textContent = m;
  if (loadBar) loadBar.style.width = (f * 100).toFixed(0) + "%";
  return new Promise((r) => setTimeout(r, 0));
};

// ════════════════════════════════════════════════════════════════════════════
// ISLAND HEIGHTFIELD — flat plateau over the footprint, beach ring, ocean; relief
// is added ONLY outside the flat footprint so models always rest on level ground.
// ════════════════════════════════════════════════════════════════════════════
const C = WORLD.center;
function coastField(x, z) {
  // ~1 deep inland → 0 at the (wobbled) coastline
  const wob = 1 + 0.13 * fbm(x * 0.0035 + 3, z * 0.0035 + 7, 3);
  const dx = (x - C[0]) / (WORLD.coast[0] * wob),
    dz = (z - C[1]) / (WORLD.coast[1] * wob);
  return 1 - Math.hypot(dx, dz);
}
function flatField(x, z) {
  // 1 inside the flat footprint → 0 once outside
  const dx = (x - C[0]) / WORLD.flat[0],
    dz = (z - C[1]) / WORLD.flat[1];
  return 1 - smooth(0.82, 1.12, Math.hypot(dx, dz));
}
function reliefH(x, z) {
  const outside = 1 - flatField(x, z); // 0 on the plain, 1 beyond it
  const onLand = smooth(0.04, 0.42, coastField(x, z)); // fade out as we near the water
  const band = outside * onLand;
  if (band <= 0.001) return 0;
  if (WORLD.reliefMode === "C") {
    // single dramatic headland (SE)
    const hx = (x - (C[0] + 430)) / 300,
      hz = (z - (C[1] + 470)) / 330;
    const head = Math.max(0, 1 - Math.hypot(hx, hz));
    const dunes = (fbm(x * 0.011, z * 0.011, 4) * 0.5 + 0.5) * 9 * band;
    return dunes + Math.pow(head, 1.5) * 150 * onLand;
  }
  // 'A' — rolling dunes + a few soft hills around the rim
  const dunes = (fbm(x * 0.01, z * 0.01, 4) * 0.5 + 0.5) * 16;
  const hills =
    Math.pow(clamp(ridged(x * 0.0045, z * 0.0045, 4), 0, 1), 1.4) *
    60 *
    smooth(0.35, 0.75, fbm(x * 0.0028 + 11, z * 0.0028 + 11, 3) * 0.5 + 0.5);
  return band * (dunes + hills);
}

let terrainHeightfield = null;

async function loadTerrainHeightfield() {
  const response = await fetch("./data/terrain-heightfield.json");
  if (!response.ok)
    throw new Error(`Unable to load terrain heightfield (${response.status}).`);
  terrainHeightfield = await response.json();
}

function sampleTerrainHeight(x, z) {
  if (!terrainHeightfield) return null;
  const { meta, h: heights } = terrainHeightfield;
  const fx = ((x - meta.x0) / (meta.x1 - meta.x0)) * (meta.nx - 1);
  const fz = ((z - meta.z0) / (meta.z1 - meta.z0)) * (meta.nz - 1);
  if (fx < 0 || fz < 0 || fx > meta.nx - 1 || fz > meta.nz - 1)
    return null;

  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, meta.nx - 1);
  const z1 = Math.min(z0 + 1, meta.nz - 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const value = (height) => height ?? WORLD.oceanFloor;

  return (
    value(heights[z0][x0]) * (1 - tx) * (1 - tz) +
    value(heights[z0][x1]) * tx * (1 - tz) +
    value(heights[z1][x0]) * (1 - tx) * tz +
    value(heights[z1][x1]) * tx * tz
  );
}

function islandH(x, z) {
  const authoredHeight = sampleTerrainHeight(x, z);
  if (authoredHeight !== null) return authoredHeight;
  const m = coastField(x, z);
  // ocean floor → shore → plateau, by inland distance
  let h = lerp(WORLD.oceanFloor, WORLD.seaY - 2.0, smooth(-0.25, 0.05, m));
  h = lerp(h, WORLD.groundY, smooth(0.05, 0.26, m));
  h += reliefH(x, z);
  // sub-stud plain texture so the flat centre isn't a dead mirror
  h += flatField(x, z) * 0.5 * fbm(x * 0.03, z * 0.03, 2);
  return h;
}
function slopeAt(x, z) {
  const e = 2;
  const h0 = islandH(x, z);
  return Math.hypot(islandH(x + e, z) - h0, islandH(x, z + e) - h0) / e;
}

// ── derived sun direction ────────────────────────────────────────────────────
function sunDirection() {
  const el = (STYLE.sun.elevDeg * Math.PI) / 180,
    az = (STYLE.sun.azDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  ).normalize();
}

// ════════════════════════════════════════════════════════════════════════════
// STYLE HOOKS — override these in a scene to change the look.
// ════════════════════════════════════════════════════════════════════════════
function makeSky(ctx) {
  const { scene, renderer, sunDir } = ctx;
  if (STYLE.sky === "gradient") {
    const g = STYLE.skyGradient;
    const geo = new THREE.SphereGeometry(9000, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(g.zenith) },
        horizon: { value: new THREE.Color(g.horizon) },
        mid: { value: new THREE.Color(0x73aadf) },
        haze: { value: new THREE.Color(0xeedfba) },
        glow: { value: new THREE.Color(0xffdf9c) },
        sunDir: { value: sunDir.clone() },
      },
      vertexShader: `varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 zenith,horizon,mid,haze,glow,sunDir;
        void main(){
          vec3 dir=normalize(vP);
          float h=clamp(dir.y,0.0,1.0);
          // tender blue dome — blue reaches low so it dominates even horizon-heavy framings
          vec3 col=mix(horizon, mid, smoothstep(0.0,0.18,h));
          col=mix(col, zenith, smoothstep(0.10,0.62,h));
          // soft warm haze confined to the lowest sliver of sky
          float band=pow(1.0-clamp(h*4.5,0.0,1.0),2.6);
          col=mix(col, haze, band*0.30);
          // soft golden glow around the sun — kept gentle so bloom won't blow it to white
          float sd=max(dot(dir,normalize(sunDir)),0.0);
          col+=glow*pow(sd,9.0)*0.22;
          col+=glow*pow(sd,150.0)*0.40;
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.frustumCulled = false;
    scene.add(dome);
    scene.background = new THREE.Color(g.horizon);
    return;
  }
  const sky = new Sky();
  sky.scale.setScalar(20000);
  scene.add(sky);
  const u = sky.material.uniforms;
  u["turbidity"].value = 3.2;
  u["rayleigh"].value = 1.6;
  u["mieCoefficient"].value = 0.004;
  u["mieDirectionalG"].value = 0.82;
  u["sunPosition"].value.copy(sunDir);
}
function makeWater(ctx) {
  const { scene, loadingManager, sunDir } = ctx;
  const w = STYLE.water;
  const geo = new THREE.PlaneGeometry(20000, 20000);
  let normals;
  if (STAGE_1_5_REFERENCE_COMPOSITE) {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        const nx = Math.sin((x + y * 0.37) * 0.54) * 0.24;
        const ny = Math.cos((y - x * 0.29) * 0.47) * 0.24;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        pixels[offset] = Math.round((nx * 0.5 + 0.5) * 255);
        pixels[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        pixels[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        pixels[offset + 3] = 255;
      }
    }
    normals = new THREE.DataTexture(
      pixels,
      size,
      size,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    normals.needsUpdate = true;
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  } else {
    normals = new THREE.TextureLoader(loadingManager).load(
      TEX_CDN + "waternormals.jpg",
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      },
    );
  }
  const water = new Water(geo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: sunDir.clone(),
    sunColor: w.sunColor,
    waterColor: w.color,
    distortionScale: w.distortion,
    fog: !!scene.fog,
    alpha: w.alpha,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = WORLD.seaY;
  scene.add(water);
  ctx.water = water;
  return water;
}
function terrainMaterial(geo, ctx) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
  });
  // painterly mottling + a warm golden backlit rim on the hills (Ghibli signature).
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunW = { value: ctx.sunDir.clone() };
    sh.uniforms.uRim = { value: new THREE.Color(0xffcf86) };
    sh.vertexShader =
      "varying vec3 vWPos;\nvarying vec3 vWN;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vWPos=(modelMatrix*vec4(transformed,1.0)).xyz;\n  vWN=normalize(mat3(modelMatrix)*objectNormal);",
      );
    sh.fragmentShader =
      "varying vec3 vWPos;\nvarying vec3 vWN;\nuniform vec3 uSunW;\nuniform vec3 uRim;\n" +
      `
      float gh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float gn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);
        float a=gh(i),b=gh(i+vec2(1.0,0.0)),c=gh(i+vec2(0.0,1.0)),d=gh(i+vec2(1.0,1.0));
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
      float gf(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*gn(p);p=p*2.0+7.3;a*=0.5;}return s;}
    ` +
      sh.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      {
        vec2 wp=vWPos.xz;
        float m =gf(wp*0.0060);
        float m2=gf(wp*0.0240+13.0);
        float br=gf(wp*0.1300+5.0);
        float v=(m-0.5)*0.32+(m2-0.5)*0.14+(br-0.5)*0.06;
        diffuseColor.rgb*=(1.0+v);
        diffuseColor.rgb+=vec3(0.050,0.022,-0.034)*(m-0.5);
        diffuseColor.rgb=clamp(diffuseColor.rgb,0.0,1.0);
      }`,
        )
        .replace(
          "#include <dithering_fragment>",
          `{
        vec3 Nw=normalize(vWN);
        vec3 Vw=normalize(cameraPosition-vWPos);
        float fres=pow(1.0-clamp(dot(Nw,Vw),0.0,1.0),3.0);
        float back=clamp(dot(-normalize(uSunW),Vw),0.0,1.0);   // looking toward the sun
        float graze=smoothstep(0.0,0.5,1.0-abs(Nw.y));         // favour hill flanks, not flats
        gl_FragColor.rgb+=uRim*fres*back*graze*0.85;
      }
      #include <dithering_fragment>`,
        );
  };
  return mat;
}
// dark bluish-gray cobblestone plaza over the shop cluster (matches the original
// stone-brick plaza. Grass is suppressed inside this ellipse for a clean edge.
const SHOP_PAVE = { cx: 60, cz: 31, rx: 52, rz: 60 };
const inShopPave = (x, z) => {
  const dx = (x - SHOP_PAVE.cx) / SHOP_PAVE.rx,
    dz = (z - SHOP_PAVE.cz) / SHOP_PAVE.rz;
  return dx * dx + dz * dz < 1;
};

function decorate(ctx) {
  naturalDecor(ctx, { tufts: 0, ...SCATTER }); // boulders default 10% (360→36); all layers URL-tunable
  if (STYLE.clouds.on) makeClouds(ctx);
  if (PAVE_VARIANT) shopPaving(ctx); // stone paving only when ?pave=N is set (off by default)
}

// 5 stone-paving candidates (?pave=1..5). Each builds a COLOUR map + a BUMP map
// (joints recessed → real relief under light, no plastic flatness) from a jittered
// Voronoi stone field; #4 is rectangular ashlar. Default = 2.
const PAVE_VARIANT =
  parseInt(new URLSearchParams(location.search).get("pave"), 10) || 0; // 0/absent = no paving
// film-grain noise: TEMP disabled so the scene can be viewed clean. ?grain=1 restores it.
// (the warm grade + vignette in the same pass stay on either way.)
const GRAIN_NOISE = new URLSearchParams(location.search).get("grain") === "1";
// Lantern and firelight multiplier. Use ?lights=N for art-direction previews.
// scales their intensity (0 = off) so the strength can be tuned without code edits.
const LANTERN_MULT = (() => {
  const v = new URLSearchParams(location.search).get("lights");
  return v == null ? 3 : Math.max(0, parseFloat(v) || 0);
})();
// procedural ground scatter counts (deco.js). Override any layer via URL for live A/B
// tuning — e.g. ?boulders=360 restores the ORIGINAL (100%) big-rock density, ?shrubs=0
// removes the green foliage clumps. Defaults: boulders cut to 10% (36) of the original
// 360; white medium 'rocks' 900, tiny 'pebbles' 4200, green 'shrubs' 520 at deco defaults.
const SCATTER = (() => {
  const q = new URLSearchParams(location.search);
  const num = (k, d) => {
    const v = q.get(k);
    return v == null ? d : Math.max(0, parseInt(v, 10) || 0);
  };
  return {
    boulders: num("boulders", 0),
    rocks: num("rocks", 900),
    pebbles: num("pebbles", 4200),
    shrubs: num("shrubs", 0),
  };
})();
function paveTextures(variant) {
  const TS = 1024,
    colCv = document.createElement("canvas"),
    bumpCv = document.createElement("canvas");
  colCv.width = colCv.height = bumpCv.width = bumpCv.height = TS;
  const cc = colCv.getContext("2d"),
    bc = bumpCv.getContext("2d");
  const CD = cc.createImageData(TS, TS),
    BD = bc.createImageData(TS, TS),
    cd = CD.data,
    bd = BD.data;
  const V =
    {
      1: {
        nx: 60,
        ny: 60,
        jit: 0.3,
        metric: "euc",
        pal: [
          [118, 126, 140],
          [98, 107, 122],
          [136, 144, 158],
        ],
        mortar: [46, 52, 60],
        moss: 0,
      }, // small setts
      2: {
        nx: 38,
        ny: 38,
        jit: 0.42,
        metric: "euc",
        pal: [
          [128, 136, 148],
          [106, 115, 130],
          [148, 155, 168],
        ],
        mortar: [50, 56, 64],
        moss: 0,
      }, // cobbles
      3: {
        nx: 22,
        ny: 24,
        jit: 0.58,
        metric: "cheb",
        pal: [
          [134, 140, 152],
          [114, 122, 136],
          [152, 158, 170],
        ],
        mortar: [54, 60, 68],
        moss: 0,
      }, // big angular flagstone
      5: {
        nx: 42,
        ny: 42,
        jit: 0.4,
        metric: "euc",
        pal: [
          [120, 128, 136],
          [100, 110, 118],
          [132, 142, 150],
        ],
        mortar: [44, 50, 52],
        moss: 0.55,
      }, // weathered/mossy
    }[variant] || null;
  const rng = mulberry32(70707 + variant * 131);
  if (variant === 4) {
    // ── rectangular ashlar slabs ──
    cc.fillStyle = "#3f464e";
    cc.fillRect(0, 0, TS, TS);
    bc.fillStyle = "#202020";
    bc.fillRect(0, 0, TS, TS);
    let y = 0;
    while (y < TS) {
      const h = TS * (0.035 + rng() * 0.025);
      let x = (rng() - 0.5) * TS * 0.1;
      while (x < TS) {
        const w = TS * (0.05 + rng() * 0.05),
          pad = 2;
        const b = 120 + rng() * 40,
          R = (b * 0.9) | 0,
          G = (b * 0.96) | 0,
          B = (b * 1.04) | 0;
        cc.fillStyle = "rgb(" + R + "," + G + "," + B + ")";
        cc.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
        const bb = 170 + rng() * 50;
        bc.fillStyle = "rgb(" + bb + "," + bb + "," + bb + ")";
        bc.fillRect(x + pad + 2, y + pad + 2, w - pad * 2 - 4, h - pad * 2 - 4);
        x += w;
      }
      y += h;
    }
    // speckle on colour
    const im = cc.getImageData(0, 0, TS, TS),
      dd = im.data;
    for (let k = 0; k < 60000; k++) {
      const i = ((rng() * TS * TS) | 0) * 4;
      const n = (rng() - 0.5) * 26;
      dd[i] += n;
      dd[i + 1] += n;
      dd[i + 2] += n;
    }
    cc.putImageData(im, 0, 0);
  } else {
    // ── Voronoi stones ──
    const cw = TS / V.nx,
      ch = TS / V.ny,
      seeds = [];
    for (let gy = -1; gy <= V.ny; gy++)
      for (let gx = -1; gx <= V.nx; gx++) {
        const sx = (gx + 0.5 + (rng() - 0.5) * V.jit) * cw,
          sy = (gy + 0.5 + (rng() - 0.5) * V.jit) * ch;
        const p = V.pal[(rng() * V.pal.length) | 0],
          v = (rng() - 0.5) * 22,
          moss = V.moss && rng() < V.moss * 0.5;
        seeds.push({
          x: sx,
          y: sy,
          gx,
          gy,
          r: (moss ? p[0] * 0.7 + 30 : p[0]) + v,
          g: (moss ? p[1] * 0.8 + 45 : p[1]) + v,
          b: (moss ? p[2] * 0.6 + 18 : p[2]) + v,
        });
      }
    const at = (gx, gy) => (gy + 1) * (V.nx + 2) + (gx + 1);
    const dist = (dx, dy) =>
      V.metric === "cheb"
        ? Math.max(Math.abs(dx), Math.abs(dy))
        : Math.hypot(dx, dy);
    for (let py = 0; py < TS; py++)
      for (let px = 0; px < TS; px++) {
        const gx0 = Math.floor(px / cw),
          gy0 = Math.floor(py / ch);
        let d1 = 1e9,
          d2 = 1e9,
          best = null;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const s = seeds[at(gx0 + ox, gy0 + oy)];
            if (!s) continue;
            const dd = dist(px - s.x, py - s.y);
            if (dd < d1) {
              d2 = d1;
              d1 = dd;
              best = s;
            } else if (dd < d2) {
              d2 = dd;
            }
          }
        const joint = Math.min(1, (d2 - d1) / (cw * 0.16)); // 0 at seam → 1 inside stone
        const i = (py * TS + px) * 4,
          e = joint * joint * (3 - 2 * joint),
          m = V.mortar;
        cd[i] = best.r * e + m[0] * (1 - e);
        cd[i + 1] = best.g * e + m[1] * (1 - e);
        cd[i + 2] = best.b * e + m[2] * (1 - e);
        cd[i + 3] = 255;
        const hgt = 40 + 215 * e - (e > 0.6 ? best.x * 0 + 0 : 0);
        bd[i] = bd[i + 1] = bd[i + 2] = hgt;
        bd[i + 3] = 255;
      }
    // fine speckle
    for (let k = 0; k < 70000; k++) {
      const i = ((rng() * TS * TS) | 0) * 4;
      const n = (rng() - 0.5) * 22;
      cd[i] += n;
      cd[i + 1] += n;
      cd[i + 2] += n;
    }
    cc.putImageData(CD, 0, 0);
    bc.putImageData(BD, 0, 0);
  }
  // radial edge alpha fade on the colour map → blends into grass
  const im = cc.getImageData(0, 0, TS, TS),
    d = im.data;
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const nx = (x / TS - 0.5) * 2,
        ny = (y / TS - 0.5) * 2,
        rr = Math.hypot(nx, ny);
      let a = 1;
      if (rr > 0.72) a = Math.max(0, 1 - (rr - 0.72) / 0.28);
      a *= a;
      const idx = (y * TS + x) * 4;
      d[idx + 3] = Math.round(d[idx + 3] * a);
    }
  cc.putImageData(im, 0, 0);
  const map = new THREE.CanvasTexture(colCv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  const bump = new THREE.CanvasTexture(bumpCv);
  bump.anisotropy = 8;
  bump.needsUpdate = true;
  return { map, bump };
}
// radial alpha fade canvas → paving blends into surrounding grass
function paveFadeAlpha() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d");
  const g = c.createRadialGradient(128, 128, 46, 128, 128, 128);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.72, "#fff");
  g.addColorStop(1, "#000");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}
function shopPaving(ctx) {
  const { scene } = ctx;
  const S = SHOP_PAVE;
  const NX = 56,
    NZ = 60,
    geo = new THREE.PlaneGeometry(S.rx * 2, S.rz * 2, NX, NZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + S.cx,
      z = pos.getZ(i) + S.cz;
    pos.setX(i, x);
    pos.setZ(i, z);
    pos.setY(i, islandH(x, z) + 0.18);
  }
  geo.computeVertexNormals();
  let mat;
  if (PAVE_VARIANT === 4) {
    // ── Poly Haven "mossy_brick" (CC0) photo texture ──
    const tl = new THREE.TextureLoader(ctx.loadingManager),
      REP = 14;
    const tile = (url, srgb) => {
      const t = tl.load(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(REP, (REP * S.rz) / S.rx);
      t.anisotropy = ctx.maxAnisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const diff = tile("./assets/tex/mossy_brick_diff_2k.jpg", true);
    mat = new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: tile("./assets/tex/mossy_brick_nor_gl_2k.jpg", false),
      normalScale: new THREE.Vector2(0.55, 0.55),
      emissiveMap: diff,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.32, // lift the dark albedo out of canopy shade
      alphaMap: paveFadeAlpha(),
      transparent: true,
      roughness: 0.92,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
    });
  } else {
    const { map, bump } = paveTextures(PAVE_VARIANT);
    mat = new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 1.4,
      transparent: true,
      roughness: 0.97,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "shopPaving";
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

// ── big fluffy stylized cumulus clouds (procedural puff texture → billboards) ──
function cloudTexture() {
  const cv = document.createElement("canvas");
  cv.width = 320;
  cv.height = 200;
  const g = cv.getContext("2d");
  const puff = (x, y, r, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a})`);
    rg.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, 6.2832);
    g.fill();
  };
  // lumpy cumulus: flatter bottom row, billowing crown
  const blobs = [
    [70, 150, 40],
    [110, 140, 52],
    [155, 134, 58],
    [200, 140, 54],
    [244, 148, 42],
    [278, 154, 30],
    [42, 156, 30],
    [120, 108, 46],
    [165, 98, 52],
    [210, 108, 44],
    [150, 118, 40],
    [185, 118, 42],
    [95, 124, 36],
    [235, 124, 34],
  ];
  for (const [x, y, r] of blobs) puff(x, y, r, 0.92);
  // warm sunlit crown
  g.globalCompositeOperation = "source-atop";
  let gr = g.createLinearGradient(0, 70, 0, 200);
  gr.addColorStop(0, "rgba(255,246,222,0.5)");
  gr.addColorStop(0.55, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 320, 200);
  // cool shadowed underside
  gr = g.createLinearGradient(0, 110, 0, 200);
  gr.addColorStop(0, "rgba(196,212,236,0)");
  gr.addColorStop(1, "rgba(176,196,228,0.5)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 320, 200);
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeClouds(ctx) {
  const { scene } = ctx,
    N = STYLE.clouds.count;
  const tex = cloudTexture();
  const clouds = [];
  const rng = mulberry32(91);
  for (let i = 0; i < N; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.9 + rng() * 0.1,
      color: 0xffffff,
    });
    const sp = new THREE.Sprite(mat);
    const ang = rng() * 6.2832,
      rad = 1500 + rng() * 4600;
    const x = C[0] + Math.cos(ang) * rad,
      z = C[1] + Math.sin(ang) * rad;
    const y = 520 + rng() * 2100; // some hang low near the horizon
    const w = 1500 + rng() * 2700,
      h = w * (0.46 + rng() * 0.16);
    sp.position.set(x, y, z);
    sp.scale.set(w, h, 1);
    sp.renderOrder = 2;
    sp.frustumCulled = false; // draw AFTER the sky dome so clouds show
    scene.add(sp);
    clouds.push({ sp, vx: 16 + rng() * 22, lim: C[0] + 6200, wrap: 12400 });
  }
  const prev = ctx.onFrame;
  ctx.onFrame = (dt, t) => {
    if (prev) prev(dt, t);
    for (const c of clouds) {
      c.sp.position.x += c.vx * dt;
      if (c.sp.position.x > c.lim) c.sp.position.x -= c.wrap;
    }
  };
}
function post(composer, ctx) {
  if (STYLE.bloom.on) {
    const b = STYLE.bloom;
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        b.strength,
        b.radius,
        b.threshold,
      ),
    );
  }
  if (STYLE.grain.on) {
    const G = STYLE.grain;
    const grainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        amount: { value: GRAIN_NOISE ? G.amount : 0 },
        vig: { value: G.vignette },
      },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time,amount,vig;
        float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){
          vec3 c=texture2D(tDiffuse,vUv).rgb;
          // gentle storybook warm grade: lift shadows warm, soft highlight roll-off
          c=mix(c, c*vec3(1.04,1.015,0.97)+vec3(0.012,0.008,0.0), 0.6);
          c=pow(c, vec3(0.96));
          // soft vignette
          vec2 d=vUv-0.5; float v=1.0-vig*dot(d,d)*2.0; c*=clamp(v,0.0,1.0);
          // subtle film grain
          float g=rnd(vUv*vec2(1920.0,1080.0)+time)-0.5;
          c+=g*amount;
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    composer.addPass(grainPass);
    const prev = ctx.onFrame;
    ctx.onFrame = (dt, t) => {
      if (prev) prev(dt, t);
      grainPass.uniforms.time.value = t;
    };
  }
  composer.addPass(new OutputPass());
}

// ── Layered ground cover ────────────────────────────────────────────────────
function scatterGrass(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group();
  root.name = "grass";
  scene.add(root);
  const canv = (draw, sz = 64) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = sz;
    draw(cv.getContext("2d"), sz);
    const t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  };
  // alpha shapes (white = opaque)
  const thinT = canv((c) => {
    const g = c.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(29, 64);
    c.quadraticCurveTo(26, 18, 32, 1);
    c.quadraticCurveTo(38, 18, 35, 64);
    c.fill();
  });
  const broadT = canv((c) => {
    const g = c.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,.06)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(20, 64);
    c.quadraticCurveTo(12, 24, 32, 2);
    c.quadraticCurveTo(52, 24, 44, 64);
    c.fill();
  });
  const flowerT = canv((c) => {
    c.fillStyle = "#fff";
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.283;
      c.beginPath();
      c.arc(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13, 9, 0, 6.283);
      c.fill();
    }
    c.beginPath();
    c.arc(32, 32, 9, 0, 6.283);
    c.fill();
  });
  const cloverT = canv((c) => {
    c.fillStyle = "#fff";
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 6.283 - 1.57;
      c.beginPath();
      c.arc(32 + Math.cos(a) * 13, 40 + Math.sin(a) * 13, 13, 0, 6.283);
      c.fill();
    }
  });
  const quad = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    return g;
  };
  const cross = (w, h) => {
    const a = quad(w, h),
      b = quad(w, h),
      d = quad(w, h);
    b.rotateY(Math.PI / 3);
    d.rotateY(-Math.PI / 3);
    return mergeGeometries([a, b, d]);
  };
  const curved = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h, 1, 4),
      pos = g.attributes.position,
      col = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + h / 2,
        t = y / h;
      pos.setZ(i, t * t * h * 0.34);
      pos.setY(i, y);
      col.push(0.16 + 0.48 * t, 0.4 + 0.46 * t, 0.1 + 0.22 * t);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const mat = (o) =>
    new THREE.MeshStandardMaterial(
      Object.assign({ roughness: 1, metalness: 0, side: THREE.DoubleSide }, o),
    );
  // fill ONE InstancedMesh by scattering `per` blades inside each cluster center
  function field(geo, material, centers, per, opt = {}) {
    if (!centers.length) return null;
    const cap = centers.length * per;
    const inst = new THREE.InstancedMesh(geo, material, cap);
    inst.frustumCulled = false;
    inst.castShadow = false;
    inst.receiveShadow = true;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3(),
      tl = new THREE.Quaternion(),
      ax = new THREE.Vector3();
    let n = 0;
    for (const c of centers) {
      const rng = mulberry32(
        ((c.x * 131 + c.z * 17) | 0) ^ (opt.seed || 0) || 1,
      );
      let k = 0,
        t = 0;
      while (k < per && t++ < per * 5) {
        const a = rng() * 6.283,
          rr = Math.sqrt(rng()) * c.R,
          x = c.x + Math.cos(a) * rr,
          z = c.z + Math.sin(a) * rr,
          y = islandH(x, z);
        if (y < WORLD.seaY + 5.5) {
          k++;
          continue;
        }
        if (occupied.has(cellKey(x, z))) {
          k++;
          continue;
        }
        if (PAVE_VARIANT && inShopPave(x, z)) {
          k++;
          continue;
        } // keep paving clean (only when paving is on)
        p.set(x, y, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.283);
        if (opt.lean) {
          ax.set(Math.cos(a), 0, Math.sin(a));
          tl.setFromAxisAngle(ax, (rng() - 0.5) * opt.lean);
          q.multiply(tl);
        }
        const sc = (opt.s0 || 0.8) + rng() * (opt.sj || 0.6);
        s.set(sc, sc * ((opt.hy0 || 0.9) + rng() * (opt.hyj || 0.4)), sc);
        m.compose(p, q, s);
        inst.setMatrixAt(n++, m);
        k++;
      }
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    root.add(inst);
    return inst;
  }
  // Build a coarse occupancy field from the authored village so ground cover
  // remains on open terrain and never intersects buildings or props.
  const occupied = new Set();
  const cellKey = (x, z) => `${(x / 2) | 0}:${(z / 2) | 0}`;
  const objectCenters = [];
  const villageBounds = new THREE.Box3();
  const objectBounds = new THREE.Box3();
  const objectCenter = new THREE.Vector3();
  ctx.authoredVillage.traverse((object) => {
    if (!object.isMesh) return;
    objectBounds.setFromObject(object);
    if (!Number.isFinite(objectBounds.min.x)) return;
    villageBounds.union(objectBounds);
    objectBounds.getCenter(objectCenter);
    objectCenters.push([objectCenter.x, objectCenter.z]);
    for (let x = objectBounds.min.x - 1.5; x <= objectBounds.max.x + 1.5; x += 2)
      for (let z = objectBounds.min.z - 1.5; z <= objectBounds.max.z + 1.5; z += 2)
        occupied.add(cellKey(x, z));
  });

  const isOpenGround = (x, z) =>
    islandH(x, z) > WORLD.seaY + 5.5 &&
    slopeAt(x, z) < 0.35 &&
    !occupied.has(cellKey(x, z)) &&
    !(PAVE_VARIANT && inShopPave(x, z));

  const candidates = [];
  for (let x = villageBounds.min.x + 8; x <= villageBounds.max.x - 8; x += 6) {
    for (let z = villageBounds.min.z + 8; z <= villageBounds.max.z - 8; z += 6) {
      if (!isOpenGround(x, z)) continue;
      let nearbyObjects = 0;
      for (const center of objectCenters) {
        if (Math.hypot(center[0] - x, center[1] - z) < 70) nearbyObjects++;
        if (nearbyObjects >= 5) break;
      }
      if (nearbyObjects < 5) continue;

      let openSamples = 0;
      let samples = 0;
      for (let dx = -10; dx <= 10; dx += 5) {
        for (let dz = -10; dz <= 10; dz += 5) {
          samples++;
          if (isOpenGround(x + dx, z + dz)) openSamples++;
        }
      }
      if (openSamples / samples > 0.55) candidates.push({ x, z });
    }
  }

  const compositionCenter = objectCenters.reduce(
    (sum, center) => [sum[0] + center[0], sum[1] + center[1]],
    [0, 0],
  );
  compositionCenter[0] /= objectCenters.length || 1;
  compositionCenter[1] /= objectCenters.length || 1;
  const coreCandidates = candidates
    .filter(
      (candidate) =>
        Math.hypot(
          candidate.x - compositionCenter[0],
          candidate.z - compositionCenter[1],
        ) < 200,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - compositionCenter[0], a.z - compositionCenter[1]) -
        Math.hypot(b.x - compositionCenter[0], b.z - compositionCenter[1]),
    );

  const patchCenters = [];
  for (const candidate of coreCandidates) {
    if (
      patchCenters.every(
        (center) => Math.hypot(center.x - candidate.x, center.z - candidate.z) >= 45,
      )
    )
      patchCenters.push(candidate);
    if (patchCenters.length >= 3) break;
  }

  const rngC = mulberry32(20260720);
  const cMeadow = [],
    cSav = [];
  for (const center of patchCenters) {
    for (let index = 0; index < 4; index++) {
      const angle = rngC() * Math.PI * 2;
      const radius = rngC() * 10;
      const cluster = {
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
        R: 7 + rngC() * 5,
      };
      (index < 3 ? cMeadow : cSav).push(cluster);
    }
  }
  field(
    quad(1.9, 2.2),
    mat({
      color: 0x8cc457,
      alphaMap: thinT,
      transparent: true,
      alphaTest: 0.42,
    }),
    cMeadow,
    220,
    { lean: 0.4, s0: 0.6, sj: 1.0, hy0: 0.32, hyj: 1.0 },
  );
  field(
    quad(2.0, 0.9),
    mat({
      color: 0xfff2c0,
      map: flowerT,
      alphaMap: flowerT,
      transparent: true,
      alphaTest: 0.5,
      emissive: 0x332b00,
      emissiveIntensity: 0.4,
    }),
    cMeadow,
    30,
    { seed: 99, s0: 0.6, sj: 0.7, hy0: 0.7, hyj: 0.6 },
  );
  field(
    quad(1.5, 2.1),
    mat({
      color: 0xccbd66,
      alphaMap: thinT,
      transparent: true,
      alphaTest: 0.38,
    }),
    cSav,
    200,
    { lean: 0.75, s0: 0.55, sj: 1.2, hy0: 0.35, hyj: 1.2 },
  );
  runtime.meadowPatches = patchCenters.map(({ x, z }) => [
    Math.round(x),
    Math.round(z),
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
// BUILD
// ════════════════════════════════════════════════════════════════════════════
const qs = new URLSearchParams(location.search);
const BARE = qs.has("bare");
const SPECTATE = qs.has("cam");
const STAGE_1_5_REFERENCE_COMPOSITE =
  location.pathname.replace(/\/+$/, "") === "/stage-1-5-scene";
const runtime = window.island;

init().catch((e) => {
  const m = "init: " + e.message + "\n" + (e.stack || "");
  const el = document.getElementById("err");
  if (el) el.textContent += m;
  runtime.error = (runtime.error || "") + m;
  if (STAGE_1_5_REFERENCE_COMPOSITE) {
    document.body.dataset.state = "error";
    const state = document.getElementById("state");
    if (state) state.textContent = e.message;
  }
});

async function init() {
  await tick("preparing…", 0.03);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = STYLE.toneMapping;
  renderer.toneMappingExposure = STYLE.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const loadingManager = new THREE.LoadingManager();
  const failedAssets = new Set();
  let pendingAssets = 0;
  const assetWaiters = new Set();
  const itemStart = loadingManager.itemStart.bind(loadingManager);
  const itemEnd = loadingManager.itemEnd.bind(loadingManager);
  loadingManager.itemStart = (url) => {
    pendingAssets++;
    itemStart(url);
  };
  loadingManager.itemEnd = (url) => {
    itemEnd(url);
    pendingAssets--;
    if (pendingAssets === 0) {
      for (const resolve of assetWaiters) resolve();
      assetWaiters.clear();
    }
  };
  loadingManager.onError = (url) => failedAssets.add(url);
  const waitForAssets = () =>
    pendingAssets === 0
      ? Promise.resolve()
      : new Promise((resolve) => assetWaiters.add(resolve));

  const scene = new THREE.Scene();
  if (STYLE.fog)
    scene.fog = new THREE.Fog(STYLE.fog.color, STYLE.fog.near, STYLE.fog.far);
  const camera = new THREE.PerspectiveCamera(
    58,
    innerWidth / innerHeight,
    0.5,
    30000,
  );
  camera.position.set(...WORLD.spawn);
  camera.lookAt(...WORLD.lookAt);

  const sunDir = sunDirection();
  const ctx = {
    THREE,
    scene,
    renderer,
    camera,
    sunDir,
    WORLD,
    STYLE,
    islandH,
    slopeAt,
    loadingManager,
    maxAnisotropy: Math.min(renderer.capabilities.getMaxAnisotropy(), 8),
  };

  // ── lights (shared by terrain + loaded models) ──
  const sun = new THREE.DirectionalLight(STYLE.sun.color, STYLE.sun.intensity);
  sun.position.copy(sunDir).multiplyScalar(1600);
  sun.target.position.set(C[0], WORLD.groundY, C[1]);
  sun.castShadow = true;
  const S = 1100;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 5000;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  ctx.sun = sun;
  scene.add(
    new THREE.HemisphereLight(
      STYLE.hemi.sky,
      STYLE.hemi.ground,
      STYLE.hemi.intensity,
    ),
  );
  if (STYLE.ambient)
    scene.add(
      new THREE.AmbientLight(STYLE.ambientColor || 0xffffff, STYLE.ambient),
    );

  await tick("raising the sky…", 0.1);
  makeSky(ctx);

  // ── terrain mesh (uniform grid over the whole map, vertex-coloured) ──
  await tick("shaping the island…", 0.18);
  await loadTerrainHeightfield();
  const terrain = buildTerrain(ctx);
  scene.add(terrain);
  ctx.terrain = terrain;

  await tick("filling the ocean…", 0.42);
  makeWater(ctx);

  await tick("dressing the scene…", 0.5);
  decorate(ctx);

  let stage15Composite = null;

  // ── models (default ON — the whole point is to see them seated here) ──
  if (!BARE) {
    await tick("placing the village…", 0.6);
    await loadCharactersAndLights(scene, ctx);
    await loadAuthoredVillage(scene, ctx);
    scatterGrass(ctx);
    if (STAGE_1_5_REFERENCE_COMPOSITE) {
      await tick("replacing Stage 1.5 meshes in place…", 0.72);
      const { mountStage15Composite } = await import(
        "./stage-1-5-scene/composite.js"
      );
      stage15Composite = mountStage15Composite({
        scene,
        authoredVillage: ctx.authoredVillage,
      });
    }
  }

  // ── post ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  post(composer, ctx);
  ctx.composer = composer;

  // ── camera: free-fly. Mouse look (click to capture), WASD move, Q/E up·down. ──
  const controls = new PointerLockControls(camera, renderer.domElement);
  bindPointerLock(controls, renderer.domElement, { enabled: !SPECTATE });
  const flySpeed = Math.max(WORLD.coast[0] * 0.16, 90); // constant fast speed
  const keys = Object.create(null);
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
  });
  addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  await waitForAssets();
  if (failedAssets.size)
    throw new Error(
      `Unable to load ${failedAssets.size} required scene asset${failedAssets.size === 1 ? "" : "s"}.`,
    );
  await renderer.compileAsync(scene, camera);
  await tick("first light…", 1.0);
  const load = document.getElementById("load");
  if (load) {
    load.style.opacity = "0";
    setTimeout(() => {
      load.remove();
      // Set the tab title once the scene is ready, only after the loading
      // overlay is gone and two frames have rendered.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.title = "SCENE_READY";
        }),
      );
    }, 1200);
  } else {
    document.title = "SCENE_READY";
  }

  Object.assign(runtime, {
    ready: true,
    scene,
    camera,
  });
  if (stage15Composite) {
    const stage15State = {
      ready: true,
      referenceContext: true,
      layoutVersion: stage15Composite.layoutVersion,
      objectCount: stage15Composite.assembly.entries.length,
      sourceMeshesHidden: stage15Composite.hiddenSourceMeshes.length,
      placements: stage15Composite.assembly.entries.map(
        ({ placement, root }) => ({
          objectId: placement.objectId,
          position: root.position.toArray(),
          semanticId: root.userData.semanticId,
        }),
      ),
    };
    runtime.stage15Composite = stage15State;
    window.stage15Scene = stage15State;
    document.body.dataset.state = "ready";
    document.body.dataset.objectCount = String(stage15State.objectCount);
    document.body.dataset.layoutVersion = stage15State.layoutVersion;
    document.body.dataset.referenceContext = "true";
    document.body.dataset.sourceMeshesHidden = String(
      stage15State.sourceMeshesHidden,
    );
    const state = document.getElementById("state");
    if (state) {
      state.textContent = `${stage15State.objectCount} procedural replacements mounted · ${stage15State.sourceMeshesHidden} authored meshes hidden`;
    }
  }
  runtime.bounds = {
    center: C,
    groundY: WORLD.groundY,
    seaY: WORLD.seaY,
    style: STYLE.name,
    islandH: (x, z) => +islandH(x, z).toFixed(2),
  };
  runtime.setCamera = (px, py, pz, lx, ly, lz) => {
    camera.position.set(px, py, pz);
    camera.lookAt(lx, ly, lz);
  };
  // ?campos=x,y,z,lx,ly,lz → place the camera from the URL (handy for fixed
  // overview shots; combine with ?cam to disable manual controls).
  {
    const cp = (qs.get("campos") || "").split(",").map(Number);
    if (cp.length === 6 && cp.every((v) => Number.isFinite(v)))
      runtime.setCamera(...cp);
  }
  // ?panda → drop the camera right in front of the animated panda so it's unmissable
  runtime.focusWildlife = () => {
    const p = ctx.pandaPos;
    if (!p) return false;
    camera.position.set(p[0] + 9, p[1] + 5, p[2] + 9);
    camera.lookAt(p[0], p[1] + 2.5, p[2]);
    return true;
  };
  if (new URLSearchParams(location.search).has("panda")) {
    const tryGoto = (n) => {
      if (runtime.focusWildlife() || n > 40) return;
      setTimeout(() => tryGoto(n + 1), 250);
    };
    tryGoto(0);
  }

  const _f = new THREE.Vector3(),
    _r = new THREE.Vector3(),
    _u = new THREE.Vector3(0, 1, 0),
    _m = new THREE.Vector3();
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (
      ctx.water &&
      ctx.water.material.uniforms &&
      ctx.water.material.uniforms["time"]
    )
      ctx.water.material.uniforms["time"].value += dt;
    if (ctx.onFrame) ctx.onFrame(dt, now / 1000);
    if (!SPECTATE && controls.isLocked) {
      // free-fly: WASD move, Q/E up·down, mouse look
      camera.getWorldDirection(_f);
      _r.crossVectors(_f, _u).normalize();
      _m.set(0, 0, 0);
      if (keys.KeyW) _m.add(_f);
      if (keys.KeyS) _m.sub(_f);
      if (keys.KeyD) _m.add(_r);
      if (keys.KeyA) _m.sub(_r);
      if (keys.KeyQ) _m.add(_u);
      if (keys.KeyE) _m.sub(_u);
      if (_m.lengthSq() > 0)
        camera.position.addScaledVector(_m.normalize(), flySpeed * dt);
    }
    composer.render();
  });
}

// ── terrain geometry + height/slope vertex colours ──────────────────────────
function buildTerrain(ctx) {
  const STEP = 4;
  const minX = C[0] - WORLD.coast[0] * 1.25,
    maxX = C[0] + WORLD.coast[0] * 1.25;
  const minZ = C[1] - WORLD.coast[1] * 1.25,
    maxZ = C[1] + WORLD.coast[1] * 1.25;
  const NX = Math.ceil((maxX - minX) / STEP),
    NZ = Math.ceil((maxZ - minZ) / STEP);
  const VX = NX + 1,
    VZ = NZ + 1;
  const pos = new Float32Array(VX * VZ * 3),
    col = new Float32Array(VX * VZ * 3);
  const P = STYLE.palette,
    c = new THREE.Color(),
    tmp = new THREE.Color();
  const colOf = (x, z, y) => {
    const slope = slopeAt(x, z),
      rel = y - WORLD.seaY;
    if (rel < 1.0) return tmp.set(P.sandWet);
    if (rel < 4.5) return tmp.set(P.sand);
    if (slope > 0.55)
      return tmp.set(y > WORLD.groundY + 45 ? P.rockHi : P.rock);
    // grass, drier on higher dunes/hills
    const dry = smooth(WORLD.groundY + 18, WORLD.groundY + 60, y);
    tmp.set(P.grass).lerp(c.set(P.grassDry), dry);
    if (rel < 6.5) tmp.lerp(c.set(P.grassLow), smooth(6.5, 4.5, rel));
    return tmp;
  };
  let k = 0;
  for (let j = 0; j < VZ; j++) {
    const z = minZ + j * STEP;
    for (let i = 0; i < VX; i++) {
      const x = minX + i * STEP,
        y = islandH(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const cc = colOf(x, z, y);
      col[k * 3] = cc.r;
      col[k * 3 + 1] = cc.g;
      col[k * 3 + 2] = cc.b;
      k++;
    }
  }
  const idx = new Uint32Array(NX * NZ * 6);
  let q = 0;
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const a = j * VX + i,
        b = a + 1,
        d = a + VX,
        e = d + 1;
      idx[q++] = a;
      idx[q++] = d;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = e;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = terrainMaterial(geo, ctx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// The village layout is resolved at authoring time and loaded directly.

// Convert the authored local light records to physically decaying point lights.
// Their reach is intentionally capped so nearby lanterns do not flatten the scene.
function addLanternLights(scene, lights) {
  if (!LANTERN_MULT) {
    console.log("[lanternLights] disabled (?lights=0)");
    return;
  }
  const grp = new THREE.Group();
  grp.name = "Lantern Lights";
  let added = 0;
  for (const L of lights) {
    if (L.intensity <= 0 || !L.position) continue;
    const col = Array.isArray(L.color)
      ? new THREE.Color().setRGB(...L.color, THREE.SRGBColorSpace)
      : L.color || new THREE.Color(0xffd9a0);
    const dist = Math.min(L.range, 20); // cap reach so big-range fills don't flood
    const inten = Math.min(L.intensity, 12) * 1.5 * LANTERN_MULT;
    const pl = new THREE.PointLight(col, inten, dist, 2); // decay 2 (physical)
    if (Array.isArray(L.position)) pl.position.fromArray(L.position);
    else pl.position.copy(L.position);
    pl.castShadow = false;
    grp.add(pl);
    added++;
  }
  scene.add(grp);
  console.log(
    "[lanternLights] added " +
      added +
      " point lights (of " +
      lights.length +
      " source lights) · mult=" +
      LANTERN_MULT,
  );
}
async function loadCharactersAndLights(scene, ctx) {
  const fj = (u) =>
    fetch(u).then((r) => {
      if (!r.ok) throw new Error("fetch " + u + " " + r.status);
      return r.json();
    });
  const fjOpt = (u) =>
    fetch(u)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null); // optional file
  const [assetIndex, materialPacks, wildlife, lighting] = await Promise.all([
    fj("./data/assets.json"),
    fj("./data/texpacks.json"),
    fj("./data/wildlife.json"),
    fj("./data/lighting.json"),
  ]);
  // Animated wildlife is removed from static batching and rebuilt as articulated
  // rigs. Selection happens before removal, so an incomplete character can never
  // disappear from the scene.
  const DEFAULT_PANDA_ANIM = "14160762032";
  const removeNode = (root, target) => {
    const rec = (n) => {
      if (!n || typeof n !== "object" || !n.children) return false;
      const i = n.children.indexOf(target);
      if (i >= 0) {
        n.children.splice(i, 1);
        return true;
      }
      for (const k of n.children) if (rec(k)) return true;
      return false;
    };
    if (Array.isArray(root)) {
      const i = root.indexOf(target);
      if (i >= 0) {
        root.splice(i, 1);
        return true;
      }
      for (const k of root) if (rec(k)) return true;
      return false;
    }
    return rec(root);
  };
  const hasRig = (m) => {
    let ok = false;
    (function w(n) {
      if (ok || !n || typeof n !== "object") return;
      if (n.name === "Character Root" && n.properties?.matrix) ok = true;
      for (const k of n.children || []) w(k);
    })(m);
    return ok;
  };
  // Stop at each complete character so nested groups are not selected separately.
  const pandaModels = [];
  (function collect(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "Group" && hasRig(n)) {
      pandaModels.push(n);
      return;
    }
    for (const k of n.children || []) collect(k);
  })({ children: wildlife.children || [] });
  const animModels = [];
  for (const m of pandaModels) {
    removeNode(wildlife, m);
    animModels.push({
      model: m,
      anim: DEFAULT_PANDA_ANIM,
      name: m.name || "Panda",
    });
  }
  console.log(
    "[anim] selected " +
      animModels.length +
      " panda rigs: " +
      animModels.map((a) => a.name).join(", "),
  );

  const builder = new SceneBuilder({
    scene,
    assetIndex,
    materialPacks: materialPacks.materialPacks,
    loadingManager: ctx.loadingManager,
    maxAnisotropy: ctx.renderer.capabilities.getMaxAnisotropy(),
  });
  runtime.sceneStats = {
    animatedWildlife: animModels.length,
    localLights: lighting.lights.length,
  };
  addLanternLights(scene, lighting.lights);

  // build the animated rigs now that the GLB loader/cache is warm.
  // Stagger each rig's clock so the pandas don't move in lock-step (looks unnatural).
  const pandaPosers = [];
  ctx.wildlifeRigs = [];
  const clipCache = {};
  const getClip = async (id) => {
    if (!(id in clipCache))
      clipCache[id] = await fjOpt("./assets/anims/" + id + ".json");
    return clipCache[id];
  };
  let rigged = 0;
  for (let ai = 0; ai < animModels.length; ai++) {
    const am = animModels[ai];
    try {
      const clip = await getClip(am.anim);
      if (!clip) {
        console.warn("[anim] clip missing for " + am.name);
        continue;
      }
      const r = await buildAnimatedRig(scene, builder, am.model, clip);
      if (r) {
        const phase = (ai * 0.37 * (clip.length || 1)) % (clip.length || 1); // desync the herd
        pandaPosers.push((t) => r.poser(t + phase));
        ctx.wildlifeRigs.push(r.rig);
        rigged++;
        if (am.name === "Hua Hua" || !ctx.pandaPos) {
          ctx.pandaPos = r.pos;
          runtime.wildlifePosition = r.pos;
        }
      } else
        console.warn(
          "[anim] rig returned null for " +
            am.name +
            " — static model already removed, panda would be missing!",
        );
    } catch (e) {
      console.warn("[anim] failed for " + am.name, e);
    }
  }
  console.log(
    "[anim] " + rigged + "/" + animModels.length + " pandas animated",
  );
  if (pandaPosers.length) {
    const prev = ctx.onFrame;
    ctx.onFrame = (dt, t) => {
      if (prev) prev(dt, t);
      for (const p of pandaPosers) p(t);
    };
  }
}

async function loadAuthoredVillage(scene, ctx) {
  const dracoLoader = new DRACOLoader(ctx.loadingManager);
  dracoLoader.setDecoderPath("./assets/draco/");
  dracoLoader.setDecoderConfig({ type: "wasm" });
  const loader = new GLTFLoader(ctx.loadingManager);
  loader.setDRACOLoader(dracoLoader);
  let asset;
  try {
    asset = await loader.loadAsync("./data/island-village.glb");
  } finally {
    dracoLoader.dispose();
  }
  const village = asset.scene;
  village.name = "Authored Village";

  const excluded = [];
  village.traverse((object) => {
    if (/^(_1|1|Cube)$/.test(object.name) || /^panda_/.test(object.name))
      excluded.push(object);
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material) material.side = THREE.DoubleSide;
    }
  });
  for (const object of excluded) object.removeFromParent();

  const response = await fetch("./data/layout-overrides.json");
  if (!response.ok)
    throw new Error(`Unable to load layout overrides (${response.status}).`);
  const overrides = await response.json();
  applyLayoutOverrides(village, ctx.wildlifeRigs, overrides);
  groundWildlife(ctx.wildlifeRigs);

  scene.add(village);
  ctx.authoredVillage = village;

  let meshCount = 0;
  village.traverse((object) => {
    if (object.isMesh) meshCount++;
  });
  runtime.authoredScene = { meshes: meshCount, excluded: excluded.length };
}

function canonicalName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9._]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
}

function applyLayoutOverrides(village, wildlifeRigs, overrides) {
  const villageMeshes = new Map();
  village.traverse((object) => {
    if (object.isMesh && object.name)
      villageMeshes.set(canonicalName(object.name), object);
  });

  for (const key of overrides.deleted || [])
    villageMeshes.get(key)?.removeFromParent();

  const center = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const centerOffset = new THREE.Matrix4();
  for (const [key, values] of Object.entries(overrides.moved || {})) {
    const mesh = villageMeshes.get(key);
    if (!mesh) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.getCenter(center);
    transform
      .compose(
        new THREE.Vector3(...values.pos),
        new THREE.Quaternion(...values.quat),
        new THREE.Vector3(...values.scale),
      )
      .multiply(centerOffset.makeTranslation(-center.x, -center.y, -center.z));
    transform.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }

  const deletedWildlife = new Set(overrides.pandaDeleted || []);
  for (const rig of wildlifeRigs) {
    const key = `panda_${canonicalName(rig.name.replace(/ Rig$/, "").trim())}`;
    if (deletedWildlife.has(key)) {
      rig.removeFromParent();
      continue;
    }
    const delta = overrides.pandaDelta?.[key];
    if (!delta) continue;
    rig.updateMatrix();
    transform
      .compose(
        new THREE.Vector3(...delta.pos),
        new THREE.Quaternion(...delta.quat),
        new THREE.Vector3(...delta.scale),
      )
      .multiply(rig.matrix);
    transform.decompose(rig.position, rig.quaternion, rig.scale);
  }
}

function groundWildlife(wildlifeRigs) {
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  for (const rig of wildlifeRigs) {
    if (!rig.parent) continue;
    bounds.setFromObject(rig);
    if (!Number.isFinite(bounds.min.y)) continue;
    bounds.getCenter(center);
    rig.position.y += islandH(center.x, center.z) - bounds.min.y;
  }
}

// Build one articulated character from the compact joint hierarchy.
// Forward kinematics: partWorld = parentWorld · bindA · pose(t) · bindB⁻¹.
async function buildAnimatedRig(scene, builder, model, anim) {
  const nodeMatrix = (n) => n?.properties?.matrix;
  const matrixFromRows = (r) =>
    new THREE.Matrix4().set(
      r[0],
      r[1],
      r[2],
      r[3],
      r[4],
      r[5],
      r[6],
      r[7],
      r[8],
      r[9],
      r[10],
      r[11],
      0,
      0,
      0,
      1,
    );
  const trkM = (e) =>
    new THREE.Matrix4().set(
      e.r[0],
      e.r[1],
      e.r[2],
      e.p[0],
      e.r[3],
      e.r[4],
      e.r[5],
      e.p[1],
      e.r[6],
      e.r[7],
      e.r[8],
      e.p[2],
      0,
      0,
      0,
      1,
    );
  const PARENT = {
    LowerTorso: "Character Root",
    UpperTorso: "LowerTorso",
    Head: "UpperTorso",
    LeftUpperArm: "UpperTorso",
    LeftLowerArm: "LeftUpperArm",
    LeftHand: "LeftLowerArm",
    RightUpperArm: "UpperTorso",
    RightLowerArm: "RightUpperArm",
    RightHand: "RightLowerArm",
    LeftUpperLeg: "LowerTorso",
    LeftLowerLeg: "LeftUpperLeg",
    LeftFoot: "LeftLowerLeg",
    RightUpperLeg: "LowerTorso",
    RightLowerLeg: "RightUpperLeg",
    RightFoot: "RightLowerLeg",
  };
  const ORDER = [
    "LowerTorso",
    "UpperTorso",
    "Head",
    "LeftUpperArm",
    "LeftLowerArm",
    "LeftHand",
    "RightUpperArm",
    "RightLowerArm",
    "RightHand",
    "LeftUpperLeg",
    "LeftLowerLeg",
    "LeftFoot",
    "RightUpperLeg",
    "RightLowerLeg",
    "RightFoot",
  ];
  const JOINT2PART = {
    Root: "LowerTorso",
    Waist: "UpperTorso",
    Neck: "Head",
    LeftShoulder: "LeftUpperArm",
    LeftElbow: "LeftLowerArm",
    LeftWrist: "LeftHand",
    RightShoulder: "RightUpperArm",
    RightElbow: "RightLowerArm",
    RightWrist: "RightHand",
    LeftHip: "LeftUpperLeg",
    LeftKnee: "LeftLowerLeg",
    LeftAnkle: "LeftFoot",
    RightHip: "RightUpperLeg",
    RightKnee: "RightLowerLeg",
    RightAnkle: "RightFoot",
  };
  const find = (n, pred, o = []) => {
    if (!n || typeof n !== "object") return o;
    if (pred(n)) o.push(n);
    for (const k of n.children || []) find(k, pred, o);
    return o;
  };
  const root = find(model, (n) => n.name === "Character Root")[0];
  if (!root || !nodeMatrix(root)) return null;
  const rootWorld = matrixFromRows(nodeMatrix(root)),
    rootInverse = rootWorld.clone().invert();
  const joints = {};
  for (const joint of find(model, (n) => n.type === "Joint")) {
    const part = JOINT2PART[joint.name];
    if (!part) continue;
    const c0 = joint.properties?.c0,
      c1 = joint.properties?.c1;
    if (!c0 || !c1) continue;
    joints[part] = {
      C0: matrixFromRows(c0),
      C1inv: matrixFromRows(c1).invert(),
    };
  }
  const groups = {},
    relativeToRoot = {};
  const rig = new THREE.Group();
  rig.name = (model.name || "Character") + " Rig";
  scene.add(rig);
  for (const meshNode of find(
    model,
    (n) => n.type === "Mesh" && PARENT[n.name] !== undefined,
  )) {
    const name = meshNode.name;
    relativeToRoot[name] = rootInverse
      .clone()
      .multiply(matrixFromRows(nodeMatrix(meshNode)));
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    rig.add(g);
    groups[name] = g;
    const properties = meshNode.properties || {};
    const id = properties.geometry;
    const geo = id ? await builder.loadGeometry(id) : null;
    if (geo && geo.geometry) {
      const c = new THREE.Vector3();
      geo.bbox.getCenter(c);
      const ns = new THREE.Vector3();
      geo.bbox.getSize(ns);
      const sz = properties.size,
        safe = (v) => (Math.abs(v) < 1e-5 ? 1 : v);
      const materialNode = (meshNode.children || []).find(
        (child) => child.type === "Material",
      );
      const materialMaps = materialNode?.properties;
      let mat;
      if (materialMaps) {
        const tx = builder._surfaceTextures(materialMaps);
        mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.75,
          metalness: 0.0,
          ...tx,
        });
        if (tx.metalnessMap) mat.metalness = 1.0;
      } else {
        const tid = properties.texture;
        if (
          tid &&
          builder.assetIndex[tid] &&
          builder.assetIndex[tid].type === "texture"
        )
          mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            metalness: 0.0,
            map: builder.loadTexture(tid, true),
          });
        else {
          const col = properties.color;
          mat = new THREE.MeshStandardMaterial({
            color: col
              ? new THREE.Color().setRGB(
                  col[0],
                  col[1],
                  col[2],
                  THREE.SRGBColorSpace,
                )
              : new THREE.Color(0xece9e2),
            roughness: 0.8,
            metalness: 0.0,
          });
        }
      }
      const mesh = new THREE.Mesh(geo.geometry, mat);
      mesh.applyMatrix4(
        new THREE.Matrix4()
          .makeScale(sz[0] / safe(ns.x), sz[1] / safe(ns.y), sz[2] / safe(ns.z))
          .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)),
      );
      g.add(mesh);
    }
  }
  const I = new THREE.Matrix4();
  const samplePart = (name, t) => {
    const tr = anim.tracks[name];
    if (!tr) return I;
    let a = tr[0],
      b = tr[tr.length - 1];
    for (let i = 0; i < tr.length - 1; i++) {
      if (tr[i].t <= t && tr[i + 1].t >= t) {
        a = tr[i];
        b = tr[i + 1];
        break;
      }
    }
    const span = b.t - a.t || 1,
      u = Math.min(1, Math.max(0, (t - a.t) / span));
    const ma = trkM(a),
      mb = trkM(b);
    const pa = new THREE.Vector3().setFromMatrixPosition(ma),
      pb = new THREE.Vector3().setFromMatrixPosition(mb);
    const qa = new THREE.Quaternion().setFromRotationMatrix(ma),
      qb = new THREE.Quaternion().setFromRotationMatrix(mb);
    return new THREE.Matrix4().compose(
      pa.lerp(pb, u),
      qa.slerp(qb, u),
      new THREE.Vector3(1, 1, 1),
    );
  };
  const poser = (time) => {
    const t = anim.length ? time % anim.length : 0;
    const local = { "Character Root": I };
    for (const name of ORDER) {
      const j = joints[name],
        par = local[PARENT[name]] || I;
      let w;
      if (j)
        w = par
          .clone()
          .multiply(j.C0)
          .multiply(samplePart(name, t))
          .multiply(j.C1inv);
      else w = par.clone().multiply(relativeToRoot[name] || I);
      local[name] = w;
      const g = groups[name];
      if (g) g.matrix.copy(rootWorld).multiply(w);
    }
  };
  poser(0);
  return {
    poser,
    rig,
    pos: [
      rootWorld.elements[12],
      rootWorld.elements[13],
      rootWorld.elements[14],
    ],
  };
}
