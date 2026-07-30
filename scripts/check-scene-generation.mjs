/**
 * Non-interactive production-generation check.
 *
 * Proves the island candidate is produced through the Scene Recipe and Scene
 * Generation Module, that the replacement-only entrypoint renders with no
 * reference, measurement, fitting, or acceptance import reachable, and that its
 * browser run requests only code.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { buildProductionBundle } from "../tools/acceptance/production-build.mjs";
import { auditProductionGraph } from "../tools/acceptance/static-audit.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ENTRYPOINT = path.join(
  PROJECT_ROOT,
  "gt_designer/island-replacement/island-replacement.js",
);

const FORBIDDEN_IMPORT = /(?:^|\/)(?:tools|scripts)\/|reference|measurement|fitting|acceptance|ground-truth|full-island-layout/i;
const PERMITTED_RUNTIME_PATHS = new Set([
  "/island-replacement/",
  "/island-replacement/island-replacement.js",
  "/src/reconstruction/scene/island-scene-recipe.generated.js",
  "/src/reconstruction/scene/scene-generator.js",
  "/src/reconstruction/scene/scene-recipe-contract.js",
  "/src/reconstruction/scene/scene-seed.js",
  "/src/reconstruction/scene/scene-object-generators.js",
  "/src/reconstruction/scene/terrain-generator.js",
  "/src/reconstruction/scene/terrain-program.js",
  "/src/reconstruction/scene/material-families.js",
  "/src/reconstruction/core/rng.js",
  "/vendor/three/build/three.module.js",
]);

async function auditImportGraph() {
  const bundle = await buildProductionBundle({
    entryPoint: path.relative(PROJECT_ROOT, ENTRYPOINT).replace(/\\/g, "/"),
    projectRoot: PROJECT_ROOT,
  });
  const files = Object.keys(bundle.metafile.inputs)
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.startsWith("node_modules/"));

  assert.deepEqual(
    files.filter((file) => FORBIDDEN_IMPORT.test(file)),
    [],
    "the replacement-only entrypoint reached a development-only module",
  );
  const audit = await auditProductionGraph({
    projectRoot: PROJECT_ROOT,
    metafile: bundle.metafile,
  });
  assert.deepEqual(
    audit.failures,
    [],
    "the static production audit rejected the island runtime",
  );

  for (const file of files) {
    const source = await readFile(path.join(PROJECT_ROOT, file), "utf8");
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, `${file} uses ambient randomness`);
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["'][^"']+\.(?:glb|gltf|fbx|obj|png|jpe?g|webp|ktx2?|hdr|exr|json)[^"']*["']/i,
      `${file} imports an authored asset`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:GLTFLoader|DRACOLoader|TextureLoader|ImageLoader|FileLoader)\b/,
      `${file} reaches an asset loader`,
    );
  }
  return { files, bundle };
}

async function runBrowser() {
  const result = await runLocalSceneAutomation({
    label: "island-replacement",
    serverFlag: "--island-replacement",
    path: "/island-replacement/",
    query: "?dpr=1",
    readyState: { state: "ready", referenceIndependent: true },
    port: 8470,
    timeoutMs: 120_000,
    viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
    probeExpression: `(() => ({
      state: document.body?.dataset?.state ?? null,
      referenceIndependent: document.body?.dataset?.referenceIndependent === "true",
      recipeVersion: window.islandReplacement?.recipeVersion ?? null,
      generatorVersion: window.islandReplacement?.generatorVersion ?? null,
      sceneSeed: window.islandReplacement?.sceneSeed ?? null,
      entityCount: window.islandReplacement?.entityCount ?? null,
      semanticIdCount: window.islandReplacement?.semanticIdCount ?? null,
      contractErrors: window.islandReplacement?.contractErrors ?? null,
      generationMs: window.islandReplacement?.generationMs ?? null,
      triangles: window.islandReplacement?.triangles ?? null,
      drawCalls: window.islandReplacement?.drawCalls ?? null,
      error: window.islandReplacement?.error ?? null
    }))()`,
  });

  assert.equal(result.state.recipeVersion, ISLAND_SCENE_RECIPE.schemaVersion);
  assert.equal(result.state.sceneSeed, ISLAND_SCENE_RECIPE.sceneSeed);
  assert.equal(result.state.entityCount, ISLAND_SCENE_RECIPE.entities.length);
  assert.deepEqual(result.state.contractErrors, []);
  assert.equal(
    result.state.semanticIdCount,
    ISLAND_SCENE_RECIPE.entities.length +
      ISLAND_SCENE_RECIPE.populations.length +
      ISLAND_SCENE_RECIPE.semanticLights.length +
      1,
  );

  const runtimePaths = result.requests
    .map((requestUrl) => new URL(requestUrl))
    .filter((url) => ["127.0.0.1", "localhost"].includes(url.hostname))
    .map((url) => url.pathname);
  for (const runtimePath of runtimePaths) {
    assert.ok(
      PERMITTED_RUNTIME_PATHS.has(runtimePath),
      `the replacement requested a non-code or unexpected resource: ${runtimePath}`,
    );
  }
  assert.deepEqual(result.externalRequests, []);
  return result;
}

async function main() {
  const graph = await auditImportGraph();
  const result = await runBrowser();
  process.stdout.write(
    `Scene generation: OK (${result.state.entityCount} entities, ${result.state.semanticIdCount} semantic IDs, ` +
      `${graph.files.length} production modules, ${graph.bundle.gzipBytes} B gzip, ` +
      `${result.state.triangles} triangles, ` +
      `${result.state.drawCalls} draw calls, ${result.state.generationMs} ms generation)\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
