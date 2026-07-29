import * as THREE from "three";

import { generateObject } from "../src/reconstruction/core/object-generator.js";
import { getObjectDefinition } from "../src/reconstruction/objects/object-registry.js";
import {
  benchmarkGeneration,
  benchmarkSequentialGeneration,
  canonicalRecipeEvidence,
  deterministicGenerationEvidence,
  recipeScalarEvidence,
} from "/dev-tools/acceptance/runtime-evidence.mjs";

const stateElement = document.querySelector("#state");
const state = { ready: false, error: null, report: null };
window.singleMeshRuntimeAudit = state;

function rendererEvidence() {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas });
  const context = renderer.getContext();
  const extension = context.getExtension("WEBGL_debug_renderer_info");
  const result = {
    webglVersion: context.getParameter(context.VERSION),
    shadingLanguageVersion: context.getParameter(
      context.SHADING_LANGUAGE_VERSION,
    ),
    vendor: extension
      ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL)
      : context.getParameter(context.VENDOR),
    renderer: extension
      ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER),
  };
  renderer.dispose();
  return result;
}

try {
  const id = new URLSearchParams(window.location.search).get("object") ?? "probe";
  if (id === "stage-1") {
    const objectIds = ["stone-path", "stone", "vase", "umbrella"];
    const definitions = objectIds.map(getObjectDefinition);
    const makeRoots = definitions.map(
      (definition) => () =>
        generateObject(definition.recipe, definition.generator),
    );
    state.report = {
      schemaVersion: "single-mesh-stage-runtime-evidence-v1",
      objectId: id,
      objectIds,
      sequentialBenchmark: benchmarkSequentialGeneration(makeRoots),
      deterministic: definitions.map((definition, index) => ({
        objectId: definition.id,
        evidence: deterministicGenerationEvidence(makeRoots[index], 3),
      })),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        threeRevision: THREE.REVISION,
        renderer: rendererEvidence(),
      },
    };
    state.ready = true;
    document.body.dataset.state = "ready";
    document.body.dataset.objectId = id;
    stateElement.textContent = JSON.stringify(
      {
        objectIds,
        sequentialGenerationP95:
          state.report.sequentialBenchmark.p95Milliseconds,
      },
      null,
      2,
    );
  } else {
  const definition = getObjectDefinition(id);
  const makeRoot = () => generateObject(definition.recipe, definition.generator);
  state.report = {
    schemaVersion: "single-mesh-runtime-evidence-v1",
    objectId: definition.id,
    semanticId: definition.recipe.id,
    recipe: canonicalRecipeEvidence(definition.recipe),
    recipeScalars: recipeScalarEvidence(definition.recipe),
    deterministic: deterministicGenerationEvidence(makeRoot, 3),
    benchmark: benchmarkGeneration(makeRoot),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      threeRevision: THREE.REVISION,
      renderer: rendererEvidence(),
    },
  };
  state.ready = true;
  document.body.dataset.state = "ready";
  document.body.dataset.objectId = definition.id;
  stateElement.textContent = JSON.stringify(
    {
      objectId: definition.id,
      triangles: state.report.deterministic.snapshot.triangles,
      drawCalls: state.report.deterministic.snapshot.drawCalls,
      generationP95: state.report.benchmark.p95Milliseconds,
      byteStable: state.report.deterministic.byteStable,
    },
    null,
    2,
  );
  }
} catch (error) {
  state.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  stateElement.textContent = state.error;
  console.error(error);
}
