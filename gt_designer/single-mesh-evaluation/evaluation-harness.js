import * as THREE from "three";

import {
  CAPTURE_SIZE,
  EVALUATION_PASSES,
} from "./evaluation-protocol.js";

const COLOR_PASS_IDS = new Set(["neutral-rgb", "albedo", "lit-rgb"]);

function semanticColor(id) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const color = hash & 0xffffff;
  return color === 0 ? 0x010101 : color;
}

function checksum(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cloneAlbedoMaterial(material) {
  if (Array.isArray(material)) return material.map(cloneAlbedoMaterial);
  const proceduralFactory = material.userData?.createAlbedoMaterial;
  if (typeof proceduralFactory === "function") {
    const replacement = proceduralFactory();
    if (!replacement?.isMaterial) {
      throw new TypeError("createAlbedoMaterial must return a THREE.Material");
    }
    return replacement;
  }
  return new THREE.MeshBasicMaterial({
    color: material.color?.clone() ?? new THREE.Color(0xffffff),
    vertexColors: material.vertexColors ?? false,
    map: material.map ?? null,
    alphaMap: material.alphaMap ?? null,
    opacity: material.opacity ?? 1,
    transparent: material.transparent ?? false,
    alphaTest: material.alphaTest ?? 0,
    side: THREE.DoubleSide,
  });
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
  } else {
    material.dispose();
  }
}

function makeDepthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      cameraNear: { value: 0.1 },
      cameraFar: { value: 100 },
    },
    vertexShader: `
      varying float vViewDistance;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDistance = -viewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float cameraNear;
      uniform float cameraFar;
      varying float vViewDistance;
      void main() {
        float depth = clamp(
          (vViewDistance - cameraNear) / (cameraFar - cameraNear),
          0.0,
          1.0
        );
        gl_FragColor = vec4(vec3(depth), 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

function makeWorldNormalMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vWorldNormal;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldNormal;
      void main() {
        vec3 normal = normalize(vWorldNormal);
        if (!gl_FrontFacing) normal = -normal;
        gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

function makeFrame(root, transform, name) {
  const frame = new THREE.Group();
  frame.name = name;
  frame.scale.setScalar(transform.uniformScale);
  root.position.fromArray(transform.translationBeforeScale);
  frame.add(root);
  frame.updateMatrixWorld(true);
  return frame;
}

function createLights() {
  const lights = new THREE.Group();
  lights.name = "Frozen Evaluation Lighting";
  lights.add(new THREE.HemisphereLight(0xeaf5ff, 0x84775f, 2.1));
  const key = new THREE.DirectionalLight(0xfff1d6, 3.25);
  key.position.set(6, 10, 8);
  lights.add(key);
  return lights;
}

function makeCompositeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      referenceTexture: { value: null },
      replacementTexture: { value: null },
      mode: { value: 2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D referenceTexture;
      uniform sampler2D replacementTexture;
      uniform int mode;
      varying vec2 vUv;
      void main() {
        vec4 referenceColor = texture2D(referenceTexture, vUv);
        vec4 replacementColor = texture2D(replacementTexture, vUv);
        if (mode == 0) {
          gl_FragColor = referenceColor;
        } else if (mode == 1) {
          gl_FragColor = replacementColor;
        } else if (mode == 2) {
          gl_FragColor = mix(referenceColor, replacementColor, 0.5);
        } else if (mode == 3) {
          gl_FragColor = vec4(abs(referenceColor.rgb - replacementColor.rgb) * 4.0, 1.0);
        } else {
          vec2 splitUv = vec2(
            vUv.x < 0.5 ? vUv.x * 2.0 : (vUv.x - 0.5) * 2.0,
            vUv.y
          );
          gl_FragColor = vUv.x < 0.5
            ? texture2D(referenceTexture, splitUv)
            : texture2D(replacementTexture, splitUv);
        }
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

const PREVIEW_MODES = Object.freeze({
  reference: 0,
  replacement: 1,
  overlay: 2,
  difference: 3,
  "pass-preview": 4,
});

/**
 * Deep development module at the Evaluation Harness seam.
 *
 * Interface: capture one pass, capture the full fixed protocol, render one
 * diagnostic preview, or dispose. Pass setup, framing, scene isolation,
 * material substitution, pixel encoding, and renderer state stay internal.
 */
export function createEvaluationHarness({
  canvas,
  referenceRoot,
  replacementRoot,
  manifest,
}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("canvas must be an HTMLCanvasElement");
  }
  if (!referenceRoot?.isObject3D || !replacementRoot?.isObject3D) {
    throw new TypeError("referenceRoot and replacementRoot must be Object3D roots");
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(CAPTURE_SIZE, CAPTURE_SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const referenceFrame = makeFrame(
    referenceRoot,
    manifest.framing.referenceTransform,
    "Canonical Authored Reference",
  );
  const replacementFrame = makeFrame(
    replacementRoot,
    manifest.framing.replacementTransform,
    "Canonical Procedural Replacement",
  );
  scene.add(referenceFrame, replacementFrame, createLights());

  const camera = new THREE.PerspectiveCamera(
    manifest.framing.camera.fovDegrees,
    1,
    manifest.framing.camera.near,
    manifest.framing.camera.far,
  );
  const captureTarget = new THREE.WebGLRenderTarget(CAPTURE_SIZE, CAPTURE_SIZE, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });
  const referencePreviewTarget = captureTarget.clone();
  const replacementPreviewTarget = captureTarget.clone();
  const depthMaterial = makeDepthMaterial();
  const normalMaterial = makeWorldNormalMaterial();

  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMaterial = makeCompositeMaterial();
  compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial));

  const semanticColors = new Map();
  for (const root of [referenceRoot, replacementRoot]) {
    root.traverse((object) => {
      const id = object.userData.semanticId;
      if (typeof id === "string") semanticColors.set(id, semanticColor(id));
    });
  }

  function applyView(viewId) {
    const pose = manifest.views.find((view) => view.id === viewId);
    if (!pose) throw new Error(`Unknown evaluation view: ${viewId}`);
    camera.position.fromArray(pose.position);
    camera.up.fromArray(pose.up);
    camera.near = pose.near;
    camera.far = pose.far;
    camera.fov = pose.fovDegrees;
    camera.lookAt(new THREE.Vector3().fromArray(pose.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function isolate(target) {
    if (target !== "reference" && target !== "replacement") {
      throw new Error(`Unknown capture target: ${target}`);
    }
    referenceFrame.visible = target === "reference";
    replacementFrame.visible = target === "replacement";
  }

  function substituteMaterials(root, passId) {
    const replacements = [];
    if (passId === "lit-rgb") return () => {};
    root.traverse((object) => {
      if (!object.isMesh) return;
      const original = object.material;
      let replacement;
      if (passId === "neutral-rgb") {
        replacement = new THREE.MeshStandardMaterial({
          color: 0xb8b8b2,
          roughness: 0.8,
          metalness: 0,
          side: THREE.DoubleSide,
        });
      } else if (passId === "silhouette") {
        replacement = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
        });
      } else if (passId === "linear-depth") {
        depthMaterial.uniforms.cameraNear.value = camera.near;
        depthMaterial.uniforms.cameraFar.value = camera.far;
        replacement = depthMaterial;
      } else if (passId === "world-normal") {
        replacement = normalMaterial;
      } else if (passId === "semantic-id") {
        const semanticId =
          object.userData.semanticId ?? root.userData.semanticId ?? "unassigned";
        replacement = new THREE.MeshBasicMaterial({
          color: semanticColor(semanticId),
          side: THREE.DoubleSide,
        });
      } else if (passId === "albedo") {
        replacement = cloneAlbedoMaterial(original);
      } else {
        throw new Error(`Unknown evaluation pass: ${passId}`);
      }
      object.material = replacement;
      replacements.push({ object, original, replacement });
    });
    return () => {
      for (const record of replacements) {
        record.object.material = record.original;
        if (
          record.replacement !== depthMaterial &&
          record.replacement !== normalMaterial
        ) {
          disposeMaterial(record.replacement);
        }
      }
    };
  }

  function configureRenderer(passId) {
    const colorPass = COLOR_PASS_IDS.has(passId);
    renderer.toneMapping = colorPass
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    renderer.outputColorSpace = colorPass
      ? THREE.SRGBColorSpace
      : THREE.LinearSRGBColorSpace;
    if (passId === "linear-depth") {
      scene.background = new THREE.Color(0xffffff);
    } else {
      scene.background = new THREE.Color(0x000000);
    }
  }

  function renderToTarget({ viewId, passId, target, renderTarget }) {
    if (!EVALUATION_PASSES.some((pass) => pass.id === passId)) {
      throw new Error(`Unknown evaluation pass: ${passId}`);
    }
    applyView(viewId);
    isolate(target);
    configureRenderer(passId);
    const restore = substituteMaterials(
      target === "reference" ? referenceRoot : replacementRoot,
      passId,
    );
    try {
      renderer.setRenderTarget(renderTarget);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(null);
      restore();
    }
  }

  function capture({ viewId, passId, target }) {
    renderToTarget({ viewId, passId, target, renderTarget: captureTarget });
    const pixels = new Uint8Array(CAPTURE_SIZE * CAPTURE_SIZE * 4);
    renderer.readRenderTargetPixels(
      captureTarget,
      0,
      0,
      CAPTURE_SIZE,
      CAPTURE_SIZE,
      pixels,
    );
    return {
      viewId,
      passId,
      target,
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      pixels,
    };
  }

  function captureAtSize({ viewId, passId, target, size }) {
    if (!Number.isInteger(size) || size < 32 || size > CAPTURE_SIZE) {
      throw new RangeError(`capture size must be an integer from 32 to ${CAPTURE_SIZE}`);
    }
    const renderTarget = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    try {
      renderToTarget({ viewId, passId, target, renderTarget });
      const pixels = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, size, size, pixels);
      return { viewId, passId, target, width: size, height: size, pixels };
    } finally {
      renderTarget.dispose();
    }
  }

  async function captureAll() {
    const captures = [];
    for (const view of manifest.views) {
      for (const pass of manifest.passes) {
        for (const target of ["reference", "replacement"]) {
          const result = capture({ viewId: view.id, passId: pass.id, target });
          captures.push({
            viewId: result.viewId,
            passId: result.passId,
            target: result.target,
            width: result.width,
            height: result.height,
            byteLength: result.pixels.byteLength,
            checksum: checksum(result.pixels),
          });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
    }
    return {
      ...manifest,
      semanticColors: Object.fromEntries(
        Array.from(semanticColors, ([id, color]) => [
          id,
          `#${color.toString(16).padStart(6, "0")}`,
        ]),
      ),
      captures,
    };
  }

  function preview({ viewId, passId, mode }) {
    if (!(mode in PREVIEW_MODES)) throw new Error(`Unknown preview mode: ${mode}`);
    renderToTarget({
      viewId,
      passId,
      target: "reference",
      renderTarget: referencePreviewTarget,
    });
    renderToTarget({
      viewId,
      passId,
      target: "replacement",
      renderTarget: replacementPreviewTarget,
    });
    referenceFrame.visible = false;
    replacementFrame.visible = false;
    renderer.setRenderTarget(null);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x111820, 1);
    renderer.clear();
    compositeMaterial.uniforms.referenceTexture.value =
      referencePreviewTarget.texture;
    compositeMaterial.uniforms.replacementTexture.value =
      replacementPreviewTarget.texture;
    compositeMaterial.uniforms.mode.value = PREVIEW_MODES[mode];
    renderer.render(compositeScene, compositeCamera);
  }

  function dispose() {
    captureTarget.dispose();
    referencePreviewTarget.dispose();
    replacementPreviewTarget.dispose();
    depthMaterial.dispose();
    normalMaterial.dispose();
    compositeMaterial.dispose();
    compositeScene.traverse((object) => object.geometry?.dispose());
    renderer.dispose();
  }

  function environment() {
    const context = renderer.getContext();
    const debugRenderer = context.getExtension("WEBGL_debug_renderer_info");
    const rendererName = debugRenderer
      ? context.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);
    const vendorName = debugRenderer
      ? context.getParameter(debugRenderer.UNMASKED_VENDOR_WEBGL)
      : context.getParameter(context.VENDOR);
    const softwarePattern = /swiftshader|llvmpipe|software|softpipe/i;
    return {
      renderer: rendererName,
      vendor: vendorName,
      version: context.getParameter(context.VERSION),
      shadingLanguageVersion: context.getParameter(
        context.SHADING_LANGUAGE_VERSION,
      ),
      antialias: Boolean(context.getContextAttributes()?.antialias),
      hardwareAccelerated:
        typeof rendererName === "string" && !softwarePattern.test(rendererName),
      rejectedSoftwareRendererPattern: String(softwarePattern),
      colorManagement: {
        outputColorSpace: renderer.outputColorSpace,
        toneMapping: renderer.toneMapping,
        toneMappingExposure: renderer.toneMappingExposure,
      },
    };
  }

  return Object.freeze({
    capture,
    captureAtSize,
    captureAll,
    preview,
    environment,
    dispose,
  });
}
