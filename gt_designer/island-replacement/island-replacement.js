import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../src/reconstruction/scene/island-scene-recipe.generated.js";
import { createEnvironmentComposer } from "../src/reconstruction/scene/environment-postprocessing.js";
import { generateScene } from "../src/reconstruction/scene/scene-generator.js";

/**
 * Replacement-only composition root.
 *
 * It imports the Scene Recipe, the Scene Generation Module, and Three.js — and
 * nothing else. No reference scene, loader, measurement, fitting, or acceptance
 * module is reachable from here, so the island still builds and renders when
 * every authored input and development tool is unavailable.
 */

const parameters = new URLSearchParams(location.search);

function readCamera(environment) {
  const requested = parameters.get("campos");
  if (!requested) {
    return { position: environment.camera.position, target: environment.camera.target };
  }
  const values = requested.split(",").map(Number);
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    return { position: environment.camera.position, target: environment.camera.target };
  }
  return { position: values.slice(0, 3), target: values.slice(3) };
}

function boot() {
  const started = performance.now();
  const { root, semanticIndex, environment, report } = generateScene(ISLAND_SCENE_RECIPE);
  const generationMs = performance.now() - started;

  const scene = new THREE.Scene();
  scene.add(root);
  // The authored scene clears to its own horizon colour, so anything the dome does
  // not cover reads as sky rather than as black.
  scene.background = new THREE.Color(environment.sky.horizon);
  scene.fog = new THREE.Fog(
    environment.fog.color,
    environment.fog.near,
    environment.fog.far,
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = environment.renderer.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.append(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    environment.camera.verticalFovDegrees,
    innerWidth / innerHeight,
    environment.camera.near,
    environment.camera.far,
  );
  const framing = readCamera(environment);
  camera.position.set(...framing.position);
  camera.lookAt(...framing.target);

  // The authored scene renders through a composer, so rendering straight out of
  // the renderer here would leave every appearance measurement dominated by the
  // absence of bloom, grade, and vignette rather than by the island.
  const post = createEnvironmentComposer({
    renderer,
    scene,
    camera,
    environment,
    size: [innerWidth, innerHeight],
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
  });

  // `renderer.info` resets on every render call, and a composer makes several, so
  // reading it after the chain finishes measures the output pass's fullscreen quad
  // rather than the island: it reported 1 triangle and 1 draw call. Turning the
  // automatic reset off and resetting once before the chain accumulates every pass,
  // which is what a runtime budget is about.
  renderer.info.autoReset = false;
  renderer.info.reset();
  post.render();

  const triangles = renderer.info.render.triangles;
  window.islandReplacement = {
    ready: true,
    recipeVersion: report.recipeVersion,
    generatorVersion: report.generatorVersion,
    sceneSeed: report.sceneSeed,
    entityCount: report.entityCount,
    populationCount: report.populationCount,
    semanticLightCount: report.semanticLightCount,
    semanticIdCount: report.semanticIdCount,
    contractErrors: report.contractErrors,
    generationMs: Math.round(generationMs * 100) / 100,
    triangles,
    drawCalls: renderer.info.render.calls,
    semanticIds: [...semanticIndex.keys()],
    // Both go through the composer. A runtime whose public render bypassed the
    // post-processing would let an audit measure a frame nobody ever sees. Each
    // resets the counters first, for the same reason the initial render does.
    render: () => {
      renderer.info.reset();
      post.render();
    },
    setCamera: (position, target) => {
      camera.position.set(...position);
      camera.lookAt(...target);
      renderer.info.reset();
      post.render();
    },
  };
  document.body.dataset.state = "ready";
  document.body.dataset.referenceIndependent = "true";
  document.body.dataset.entityCount = String(report.entityCount);
}

try {
  boot();
} catch (error) {
  window.islandReplacement = { ready: false, error: String(error?.stack ?? error) };
  document.body.dataset.state = "error";
}
