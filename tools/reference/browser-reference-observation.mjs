import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

import { createReferenceAccess } from "./reference-access.mjs";
import { deriveReferenceCameraSet } from "./reference-cameras.mjs";
import { createReferenceObservationContract } from "./reference-observation-contract.mjs";
import { verifySceneRenderContractRuntime } from "./scene-render-contract-runtime.mjs";

const contract = createReferenceObservationContract();
const referenceObservation = {
  status: "loading",
  error: null,
  primaryEvidence: null,
  complete: null,
};
window.referenceObservation = referenceObservation;
Object.defineProperty(window, "__referenceObservationTypes", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({ WebGLRenderer: THREE.WebGLRenderer, EffectComposer }),
});

let runtimeRenderObjects = null;

function round(value) {
  if (!Number.isFinite(value)) return String(value);
  const result = Number(value.toFixed(9));
  return Object.is(result, -0) ? 0 : result;
}

function numericArray(value) {
  return Array.from(value, round);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256Text(value) {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Json(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

async function hashTypedArray(array) {
  return sha256Bytes(
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
  );
}

function stableName(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function walkScene(root) {
  const rows = [];
  const visit = (object, parentPath, index) => {
    const path = `${parentPath}/${String(index).padStart(4, "0")}:${stableName(
      object.type,
    )}:${stableName(object.name)}`;
    rows.push({ object, path });
    object.children.forEach((child, childIndex) => visit(child, path, childIndex));
  };
  visit(root, "", 0);
  return rows;
}

function typeCounts(rows) {
  const counts = {};
  for (const { object } of rows) counts[object.type] = (counts[object.type] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function summarize(rows, summary) {
  return {
    digest: await sha256Json(rows),
    ...summary,
  };
}

function structureRows(entries) {
  return entries.map(({ object, path }) => [
    path,
    object.type,
    object.name,
    object.visible,
    object.children.length,
    object.renderOrder,
    object.layers.mask,
  ]);
}

async function transformRows(entries) {
  return Promise.all(
    entries.map(async ({ object, path }) => [
      path,
      numericArray(object.position.toArray()),
      numericArray(object.quaternion.toArray()),
      numericArray(object.scale.toArray()),
      numericArray(object.matrix.elements),
      numericArray(object.matrixWorld.elements),
      object.instanceMatrix ? await attributeDescriptor(object.instanceMatrix) : null,
    ]),
  );
}

async function attributeDescriptor(attribute) {
  return {
    arrayType: attribute.array.constructor.name,
    itemSize: attribute.itemSize,
    count: attribute.count,
    normalized: attribute.normalized,
    usage: attribute.usage,
    byteLength: attribute.array.byteLength,
    sha256: await hashTypedArray(attribute.array),
  };
}

async function geometryDescriptor(geometry) {
  const attributes = {};
  for (const name of Object.keys(geometry.attributes).sort()) {
    attributes[name] = await attributeDescriptor(geometry.attributes[name]);
  }
  const morphAttributes = {};
  for (const name of Object.keys(geometry.morphAttributes).sort()) {
    morphAttributes[name] = await Promise.all(
      geometry.morphAttributes[name].map(attributeDescriptor),
    );
  }
  return {
    type: geometry.type,
    attributes,
    morphAttributes,
    index: geometry.index ? await attributeDescriptor(geometry.index) : null,
    groups: geometry.groups.map((group) => ({ ...group })),
    drawRange: { ...geometry.drawRange },
  };
}

async function geometryRows(entries) {
  const descriptors = new Map();
  const rows = [];
  for (const { object, path } of entries) {
    if (!object.geometry) continue;
    if (!descriptors.has(object.geometry)) {
      descriptors.set(object.geometry, await geometryDescriptor(object.geometry));
    }
    rows.push({
      path,
      instanceCount: object.isInstancedMesh ? object.count : null,
      geometry: descriptors.get(object.geometry),
    });
  }
  return rows;
}

function colorValue(color) {
  return color?.isColor ? color.getHexString(THREE.SRGBColorSpace) : null;
}

function stableResourceSource(value) {
  if (!value) return null;
  try {
    const url = new URL(value, location.href);
    if (["127.0.0.1", "localhost"].includes(url.hostname)) {
      return `${url.pathname}${url.search}`;
    }
    return url.href;
  } catch {
    return String(value);
  }
}

function textureDescriptor(texture) {
  if (!texture?.isTexture) return null;
  const image = texture.image;
  return {
    type: texture.constructor.name,
    source: stableResourceSource(image?.currentSrc || image?.src),
    width: image?.naturalWidth || image?.videoWidth || image?.width || null,
    height: image?.naturalHeight || image?.videoHeight || image?.height || null,
    colorSpace: texture.colorSpace,
    mapping: texture.mapping,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    repeat: texture.repeat ? numericArray(texture.repeat.toArray()) : null,
    rotation: round(texture.rotation || 0),
    flipY: texture.flipY,
  };
}

function stableUniformValue(value) {
  if (value == null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") return round(value);
  if (value.isTexture) return textureDescriptor(value);
  if (value.isColor) return { color: colorValue(value) };
  if (value.toArray && typeof value.toArray === "function") {
    return numericArray(value.toArray());
  }
  if (ArrayBuffer.isView(value)) {
    return { type: value.constructor.name, length: value.length };
  }
  if (Array.isArray(value)) return value.map(stableUniformValue);
  return { type: value.constructor?.name || typeof value };
}

async function materialDescriptor(material) {
  const textures = {};
  for (const key of [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
  ]) {
    if (material[key]) textures[key] = textureDescriptor(material[key]);
  }
  const uniforms = {};
  for (const key of Object.keys(material.uniforms || {}).sort()) {
    if (/time/i.test(key)) continue;
    uniforms[key] = stableUniformValue(material.uniforms[key]?.value);
  }
  return {
    type: material.type,
    name: material.name,
    visible: material.visible,
    transparent: material.transparent,
    opacity: round(material.opacity),
    alphaTest: round(material.alphaTest),
    side: material.side,
    blending: material.blending,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    color: colorValue(material.color),
    emissive: colorValue(material.emissive),
    emissiveIntensity: round(material.emissiveIntensity ?? 0),
    roughness: round(material.roughness ?? 0),
    metalness: round(material.metalness ?? 0),
    vertexColors: material.vertexColors,
    textures,
    uniforms,
    vertexShaderSha256: material.vertexShader
      ? await sha256Text(material.vertexShader)
      : null,
    fragmentShaderSha256: material.fragmentShader
      ? await sha256Text(material.fragmentShader)
      : null,
  };
}

async function materialRows(entries) {
  const descriptors = new Map();
  const rows = [];
  for (const { object, path } of entries) {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (let index = 0; index < materials.length; index += 1) {
      const material = materials[index];
      if (!descriptors.has(material)) {
        descriptors.set(material, await materialDescriptor(material));
      }
      rows.push({
        path,
        slot: index,
        material: descriptors.get(material),
        instanceColor:
          index === 0 && object.instanceColor
            ? await attributeDescriptor(object.instanceColor)
            : null,
      });
    }
  }
  return rows;
}

function lightRows(entries) {
  return entries
    .filter(({ object }) => object.isLight)
    .map(({ object, path }) => ({
      path,
      type: object.type,
      color: colorValue(object.color),
      groundColor: colorValue(object.groundColor),
      intensity: round(object.intensity),
      distance: round(object.distance ?? 0),
      decay: round(object.decay ?? 0),
      angle: round(object.angle ?? 0),
      penumbra: round(object.penumbra ?? 0),
      castShadow: object.castShadow,
      shadow: object.shadow
        ? {
            bias: round(object.shadow.bias),
            mapSize: numericArray(object.shadow.mapSize.toArray()),
            camera: object.shadow.camera
              ? {
                  near: round(object.shadow.camera.near),
                  far: round(object.shadow.camera.far),
                  left: round(object.shadow.camera.left ?? 0),
                  right: round(object.shadow.camera.right ?? 0),
                  top: round(object.shadow.camera.top ?? 0),
                  bottom: round(object.shadow.camera.bottom ?? 0),
                }
              : null,
          }
        : null,
    }));
}

function dynamicRows(entries) {
  const rows = [];
  for (const { object, path } of entries) {
    if (object.isBone || object.isSprite) {
      rows.push({
        path,
        kind: object.isBone ? "bone" : "sprite",
        position: numericArray(object.position.toArray()),
        quaternion: numericArray(object.quaternion.toArray()),
        scale: numericArray(object.scale.toArray()),
      });
    }
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    materials.forEach((material, materialIndex) => {
      for (const key of Object.keys(material?.uniforms || {}).sort()) {
        if (!/(time|wind|phase)/i.test(key)) continue;
        rows.push({
          path,
          kind: "uniform",
          materialIndex,
          key,
          value: stableUniformValue(material.uniforms[key].value),
        });
      }
    });
  }
  return rows;
}

function captureRendererState(scene, camera) {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const attributes = gl?.getContextAttributes();
  return {
    cssViewport: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    framebuffer: [canvas?.width ?? null, canvas?.height ?? null],
    deviceScaleFactor: window.devicePixelRatio,
    context: gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl",
    contextAttributes: attributes
      ? {
          alpha: attributes.alpha,
          antialias: attributes.antialias,
          depth: attributes.depth,
          desynchronized: attributes.desynchronized,
          failIfMajorPerformanceCaveat: attributes.failIfMajorPerformanceCaveat,
          powerPreference: attributes.powerPreference,
          premultipliedAlpha: attributes.premultipliedAlpha,
          preserveDrawingBuffer: attributes.preserveDrawingBuffer,
          stencil: attributes.stencil,
        }
      : null,
    drawingBufferColorSpace: gl?.drawingBufferColorSpace ?? null,
    unpackColorSpace: gl?.unpackColorSpace ?? null,
    fog: scene.fog
      ? {
          type: scene.fog.constructor.name,
          color: colorValue(scene.fog.color),
          near: round(scene.fog.near),
          far: round(scene.fog.far),
        }
      : null,
    camera: {
      type: camera.type,
      fov: round(camera.fov),
      aspect: round(camera.aspect),
      near: round(camera.near),
      far: round(camera.far),
      position: numericArray(camera.position.toArray()),
      direction: numericArray(camera.getWorldDirection(new THREE.Vector3()).toArray()),
      up: numericArray(camera.up.toArray()),
      viewMatrix: numericArray(camera.matrixWorldInverse.elements),
      projectionMatrix: numericArray(camera.projectionMatrix.elements),
    },
  };
}

function colorNumber(color) {
  return color?.isColor ? color.getHex(THREE.SRGBColorSpace) : null;
}

function sceneEnvironmentState(scene) {
  const entries = walkScene(scene);
  const lights = entries.map(({ object }) => object).filter((object) => object.isLight);
  const sun = lights.find((light) => light.isDirectionalLight);
  const hemisphere = lights.find((light) => light.isHemisphereLight);
  const ambient = lights.find((light) => light.isAmbientLight);
  const sky = entries
    .map(({ object }) => object)
    .find(
      (object) =>
        object.material?.uniforms?.zenith && object.material?.uniforms?.horizon,
    );
  const ocean = entries
    .map(({ object }) => object)
    .find(
      (object) =>
        object.material?.uniforms?.waterColor &&
        object.material?.uniforms?.distortionScale,
    );
  const oceanUniforms = ocean?.material.uniforms;
  return {
    globalLights: {
      sun: sun
        ? {
            color: colorNumber(sun.color),
            intensity: round(sun.intensity),
            castShadow: sun.castShadow,
            shadowMapSize: numericArray(sun.shadow.mapSize.toArray()),
            shadowBias: round(sun.shadow.bias),
          }
        : null,
      hemisphere: hemisphere
        ? {
            sky: colorNumber(hemisphere.color),
            ground: colorNumber(hemisphere.groundColor),
            intensity: round(hemisphere.intensity),
          }
        : null,
      ambient: ambient
        ? {
            color: colorNumber(ambient.color),
            intensity: round(ambient.intensity),
          }
        : null,
    },
    localLightCount: lights.filter((light) => light.isPointLight).length,
    sky: sky
      ? {
          kind: "gradient",
          zenith: colorNumber(sky.material.uniforms.zenith.value),
          horizon: colorNumber(sky.material.uniforms.horizon.value),
        }
      : null,
    ocean: ocean
      ? {
          y: round(ocean.position.y),
          color: colorNumber(oceanUniforms.waterColor.value),
          sunColor: colorNumber(oceanUniforms.sunColor.value),
          distortion: round(oceanUniforms.distortionScale.value),
          alpha: round(oceanUniforms.alpha.value),
        }
      : null,
    cloudCount: entries.filter(({ object }) => object.isSprite).length,
  };
}

function sceneRenderContractRuntime(scene, camera) {
  if (!runtimeRenderObjects) {
    throw new Error("runtime renderer and composer were not attached by Reference Access");
  }
  const { renderer, composer } = runtimeRenderObjects;
  const bloom = composer.passes.find(
    (pass) => pass.constructor.name === "UnrealBloomPass",
  );
  const grading = composer.passes.find(
    (pass) => pass.uniforms?.amount && pass.uniforms?.vig,
  );
  const runtime = {
    capture: captureRendererState(scene, camera),
    threeRenderer: {
      toneMapping:
        renderer.toneMapping === THREE.ACESFilmicToneMapping
          ? "ACESFilmicToneMapping"
          : String(renderer.toneMapping),
      exposure: round(renderer.toneMappingExposure),
      outputColorSpace:
        renderer.outputColorSpace === THREE.SRGBColorSpace
          ? "SRGBColorSpace"
          : String(renderer.outputColorSpace),
      pixelRatio: round(renderer.getPixelRatio()),
      shadows: {
        enabled: renderer.shadowMap.enabled,
        type:
          renderer.shadowMap.type === THREE.PCFSoftShadowMap
            ? "PCFSoftShadowMap"
            : String(renderer.shadowMap.type),
      },
    },
    composer: {
      passes: composer.passes.map((pass) => pass.constructor.name),
      bloom: bloom
        ? {
            strength: round(bloom.strength),
            radius: round(bloom.radius),
            threshold: round(bloom.threshold),
          }
        : null,
      grading: grading
        ? {
            amount: round(grading.uniforms.amount.value),
            vignette: round(grading.uniforms.vig.value),
          }
        : null,
    },
    environment: sceneEnvironmentState(scene),
    urlOptions: Object.fromEntries(new URLSearchParams(location.search)),
  };
  return {
    ...runtime,
    verificationErrors: verifySceneRenderContractRuntime({ runtime, contract }),
  };
}

async function captureState(scene, camera) {
  const entries = walkScene(scene);
  const structures = structureRows(entries);
  const transforms = await transformRows(entries);
  const geometries = await geometryRows(entries);
  const materials = await materialRows(entries);
  const lights = lightRows(entries);
  const renderer = sceneRenderContractRuntime(scene, camera);
  const dynamic = dynamicRows(entries);
  return {
    structure: await summarize(structures, {
      nodeCount: entries.length,
      typeCounts: typeCounts(entries),
    }),
    transforms: await summarize(transforms, { nodeCount: transforms.length }),
    geometry: await summarize(geometries, { meshCount: geometries.length }),
    materials: await summarize(materials, { materialAssignments: materials.length }),
    lights: await summarize(lights, { lightCount: lights.length }),
    renderer: await summarize(renderer, renderer),
    dynamic: await summarize(dynamic, {
      stateCount: dynamic.length,
      momentMs: window.__frozenObservationClock?.momentMs ?? null,
    }),
  };
}

function transformPoint(matrix, x, y, z) {
  const e = matrix.elements;
  const denominator = e[3] * x + e[7] * y + e[11] * z + e[15];
  const w = denominator ? 1 / denominator : 1;
  return [
    (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
    (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
    (e[2] * x + e[6] * y + e[10] * z + e[14]) * w,
  ];
}

function authoredWorldBounds(scene) {
  const authored = scene.getObjectByName("Authored Village");
  if (!authored) throw new Error("ready scene does not contain Authored Village");
  const worldMin = [Infinity, Infinity, Infinity];
  const worldMax = [-Infinity, -Infinity, -Infinity];
  let meshCount = 0;
  authored.traverse((object) => {
    const position = object.geometry?.attributes?.position;
    if (!object.isMesh || !position) return;
    meshCount += 1;
    const localMin = [Infinity, Infinity, Infinity];
    const localMax = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < position.count; index += 1) {
      const point = [position.getX(index), position.getY(index), position.getZ(index)];
      for (let axis = 0; axis < 3; axis += 1) {
        localMin[axis] = Math.min(localMin[axis], point[axis]);
        localMax[axis] = Math.max(localMax[axis], point[axis]);
      }
    }
    for (const x of [localMin[0], localMax[0]]) {
      for (const y of [localMin[1], localMax[1]]) {
        for (const z of [localMin[2], localMax[2]]) {
          const point = transformPoint(object.matrixWorld, x, y, z);
          for (let axis = 0; axis < 3; axis += 1) {
            worldMin[axis] = Math.min(worldMin[axis], point[axis]);
            worldMax[axis] = Math.max(worldMax[axis], point[axis]);
          }
        }
      }
    }
  });
  if (!worldMin.every(Number.isFinite) || meshCount === 0) {
    throw new Error("Authored Village has no readable world-space geometry");
  }
  return { min: worldMin.map(round), max: worldMax.map(round), meshCount };
}

async function sourceEvidence() {
  const response = await fetch("./main.js");
  if (!response.ok) throw new Error(`unable to read reference source (${response.status})`);
  const source = await response.text();
  return {
    path: contract.reference.sourcePath,
    byteLength: new TextEncoder().encode(source).byteLength,
    sha256: await sha256Text(source),
    expectedSha256: contract.reference.sourceSha256,
    exactMatch: (await sha256Text(source)) === contract.reference.sourceSha256,
    directReadOnlyQuery: true,
  };
}

function environmentEvidence() {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl?.getParameter(gl.RENDERER);
  const vendor = debug
    ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
    : gl?.getParameter(gl.VENDOR);
  return {
    browser: {
      userAgent: navigator.userAgent,
      userAgentData: navigator.userAgentData
        ? {
            brands: navigator.userAgentData.brands,
            mobile: navigator.userAgentData.mobile,
            platform: navigator.userAgentData.platform,
          }
        : null,
    },
    os: {
      platform: navigator.platform,
      userAgentPlatform: navigator.userAgentData?.platform ?? null,
    },
    gpu: {
      vendor,
      renderer,
      webglVersion: gl?.getParameter(gl.VERSION) ?? null,
      shadingLanguageVersion: gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? null,
      acceleration:
        renderer && /(swiftshader|software|llvmpipe)/i.test(renderer)
          ? "software"
          : "hardware-or-undetermined",
    },
    color: {
      colorGamut: ["rec2020", "p3", "srgb"].find((gamut) =>
        matchMedia(`(color-gamut: ${gamut})`).matches,
      ),
      dynamicRangeHigh: matchMedia("(dynamic-range: high)").matches,
      drawingBufferColorSpace: gl?.drawingBufferColorSpace ?? null,
    },
    threeRevision: THREE.REVISION,
  };
}

async function captureAppearanceMetrics() {
  await waitForAnimationFrames(1);
  const source = document.querySelector("canvas");
  if (!source) throw new Error("reference renderer canvas is missing");
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
  const sums = [0, 0, 0];
  const squareSums = [0, 0, 0];
  const histogram = Array.from({ length: 3 }, () => Array(16).fill(0));
  const pixelCount = copy.width * copy.height;
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = pixels[index + channel];
      sums[channel] += value;
      squareSums[channel] += value * value;
      histogram[channel][Math.min(15, value >> 4)] += 1;
    }
  }
  const means = sums.map((sum) => sum / pixelCount);
  const standardDeviations = squareSums.map((sum, channel) =>
    Math.sqrt(Math.max(0, sum / pixelCount - means[channel] ** 2)),
  );

  const hashCanvas = document.createElement("canvas");
  hashCanvas.width = 33;
  hashCanvas.height = 18;
  const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });
  hashContext.drawImage(source, 0, 0, hashCanvas.width, hashCanvas.height);
  const hashPixels = hashContext.getImageData(
    0,
    0,
    hashCanvas.width,
    hashCanvas.height,
  ).data;
  let bits = "";
  for (let y = 0; y < hashCanvas.height; y += 1) {
    for (let x = 0; x < hashCanvas.width - 1; x += 1) {
      const left = (y * hashCanvas.width + x) * 4;
      const right = left + 4;
      const leftLuminance =
        hashPixels[left] * 0.2126 +
        hashPixels[left + 1] * 0.7152 +
        hashPixels[left + 2] * 0.0722;
      const rightLuminance =
        hashPixels[right] * 0.2126 +
        hashPixels[right + 1] * 0.7152 +
        hashPixels[right + 2] * 0.0722;
      bits += leftLuminance > rightLuminance ? "1" : "0";
    }
  }
  let differenceHash = "";
  for (let index = 0; index < bits.length; index += 4) {
    differenceHash += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }

  return {
    source: "unmodified native composer canvas",
    width: copy.width,
    height: copy.height,
    rgbaSha256: await sha256Bytes(pixels),
    channelMeans: means.map(round),
    channelStandardDeviations: standardDeviations.map(round),
    normalizedHistograms: histogram.map((bins) =>
      bins.map((count) => round(count / pixelCount)),
    ),
    differenceHash,
  };
}

function waitForAnimationFrames(count) {
  return new Promise((resolve) => {
    const next = () => {
      if (count <= 0) resolve();
      else {
        count -= 1;
        requestAnimationFrame(next);
      }
    };
    next();
  });
}

async function waitForReady() {
  while (!window.island?.ready) {
    if (window.island?.error) throw new Error(window.island.error);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitForAnimationFrames(3);
}

async function initialize() {
  await waitForReady();
  const clock = window.__frozenObservationClock;
  if (clock?.kind !== "Frozen Observation Clock") {
    throw new Error("external Frozen Observation Clock was not installed");
  }
  if (clock.momentMs !== contract.clock.primaryMomentMs) {
    throw new Error("reference did not become ready at the primary observation moment");
  }
  referenceObservation.status = "awaiting-runtime-render-state";
  referenceObservation.attachRuntimeRenderState = async ({ renderer, composer }) => {
    if (referenceObservation.status !== "awaiting-runtime-render-state") {
      throw new Error("runtime render state may be attached exactly once");
    }
    if (
      !(renderer instanceof THREE.WebGLRenderer) ||
      !(composer instanceof EffectComposer) ||
      renderer.domElement !== document.querySelector("canvas") ||
      composer.renderer !== renderer
    ) {
      throw new TypeError("Reference Access received the wrong renderer or composer");
    }
    referenceObservation.status = "observing-primary";
    runtimeRenderObjects = { renderer, composer };
    try {
      await observePrimary(clock);
      return { status: referenceObservation.status };
    } catch (error) {
      referenceObservation.status = "error";
      referenceObservation.error = error.stack || error.message || String(error);
      throw error;
    }
  };
}

async function observePrimary(clock) {
  const { scene, camera } = window.island;
  const access = createReferenceAccess({ snapshot: () => captureState(scene, camera) });
  const immutableObservation = await access.observe(async () => {
    const authoredBounds = authoredWorldBounds(scene);
    const cameras = deriveReferenceCameraSet({
      authoredBounds,
      sceneAnchor: contract.sceneAnchor,
      aspect: contract.capture.cssViewport[0] / contract.capture.cssViewport[1],
      verticalFovDegrees: contract.cameras.authoredOverview.verticalFovDegrees,
      near: contract.cameras.authoredOverview.near,
      far: contract.cameras.authoredOverview.far,
    });
    return {
      assembledScene: {
        ready: window.island.ready,
        authority: contract.authority,
        runtimeBounds: {
          center: [...window.island.bounds.center],
          groundY: window.island.bounds.groundY,
          seaY: window.island.bounds.seaY,
          style: window.island.bounds.style,
        },
        sceneStats: window.island.sceneStats,
        authoredScene: window.island.authoredScene,
        authoredBounds,
      },
      cameraSet: cameras,
      environment: environmentEvidence(),
      source: await sourceEvidence(),
      appearance: await captureAppearanceMetrics(),
      renderContract: {
        declared: contract.renderContract,
        runtime: sceneRenderContractRuntime(scene, camera),
      },
      capture: captureRendererState(scene, camera),
      clock: {
        kind: clock.kind,
        source: clock.source,
        momentMs: clock.momentMs,
        allowedMomentsMs: [...clock.allowedMomentsMs],
        appearancePatched: clock.appearancePatched,
      },
      appearanceIntegrity: {
        referenceSourcePatched: false,
        referenceMaterialsOrLightsInjected: false,
        cameraAppliedByExistingPublicUrlControl: true,
        nativeComposerCanvasObserved: true,
      },
    };
  });

  referenceObservation.primaryEvidence = immutableObservation;
  referenceObservation.status = "primary-ready";
  referenceObservation.complete = async () => {
    if (referenceObservation.status === "complete") {
      return { status: "complete", report: referenceObservation.report };
    }
    const dynamicCaptures = [];
    for (const momentMs of contract.clock.dynamicMomentsMs) {
      const transition = await access.observe(
        async () => {
          clock.setMoment(momentMs);
          await waitForAnimationFrames(3);
          return { momentMs };
        },
        { allowedChanges: ["transforms", "dynamic"] },
      );
      dynamicCaptures.push({
        momentMs,
        dynamic: transition.immutability.after.dynamic,
        transforms: transition.immutability.after.transforms,
        stateTransition: transition.immutability,
      });
    }
    referenceObservation.report = {
      schemaVersion: "reference-observation-evidence-v1",
      contractSchemaVersion: contract.schemaVersion,
      primaryMomentMs: contract.clock.primaryMomentMs,
      primary: immutableObservation,
      dynamicCaptures,
    };
    referenceObservation.status = "complete";
    return { status: "complete", report: referenceObservation.report };
  };
}

initialize().catch((error) => {
  referenceObservation.status = "error";
  referenceObservation.error = error.stack || error.message || String(error);
});
