import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { REFERENCE_LAYOUT } from "../gt_designer/full-island-layout.generated.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const entryPath = path.join(
  projectRoot,
  "gt_designer",
  "full-island-prototype.js",
);
const htmlPath = path.join(projectRoot, "gt_designer", "index.html");
const layoutPath = path.join(
  projectRoot,
  "gt_designer",
  "full-island-layout.generated.js",
);
const [entrySource, htmlSource, layoutSource] = await Promise.all([
  readFile(entryPath, "utf8"),
  readFile(htmlPath, "utf8"),
  readFile(layoutPath, "utf8"),
]);

assert.match(
  htmlSource,
  /<script type="module" src="\.\/full-island-prototype\.js\?v=[^"]+"><\/script>/,
  "the root scene must boot only the procedural island entrypoint",
);
assert.doesNotMatch(entrySource, /\b(?:GLTFLoader|DRACOLoader|TextureLoader|ImageLoader|SceneBuilder)\b/);
assert.doesNotMatch(entrySource, /\bfetch\s*\(/);
assert.doesNotMatch(
  entrySource,
  /(?:from\s*|import\s*\()["'][^"']+\.(?:glb|gltf|fbx|obj|stl|dae|3ds|ply|drc|png|jpe?g|webp|ktx2?|hdr|exr|json)[^"']*["']/i,
);
assert.doesNotMatch(layoutSource, /\.(?:glb|gltf|fbx|obj|png|jpe?g|webp|json)\b/i);
assert.doesNotMatch(layoutSource, /"(?:name|canonicalName|vertexCount|vertices|samples)"\s*:/i);

const permittedRuntimePaths = new Set([
  "/",
  "/full-island-prototype.js",
  "/full-island-layout.generated.js",
  "/vendor/three/build/three.module.js",
  "/vendor/three/examples/jsm/controls/OrbitControls.js",
]);

for (const [index, variant] of ["A", "B", "C"].entries()) {
  const result = await runLocalSceneAutomation({
    label: `full-island-prototype-${variant}`,
    serverFlag: null,
    path: "/",
    query: `?variant=${variant}&dpr=1`,
    readyState: {
      state: "ready",
      variant,
      referenceIndependent: true,
    },
    port: 8460 + index,
    timeoutMs: 30_000,
    serverArguments: ["--local-three"],
    probeExpression: `(() => ({
      state: document.body?.dataset?.state ?? null,
      variant: document.body?.dataset?.variant ?? null,
      referenceIndependent:
        document.body?.dataset?.referenceIndependent === "true",
      semanticLayoutVersion: window.island?.semanticLayoutVersion ?? null,
      stats: window.island?.stats ?? null,
      error: window.island?.error ?? null
    }))()`,
  });

  assert.equal(
    result.state.semanticLayoutVersion,
    REFERENCE_LAYOUT.schemaVersion,
    `variant ${variant} did not use the measured semantic layout`,
  );
  const divisor = variant === "C" ? 2 : 1;
  const expectedCount = (key) => Math.ceil(REFERENCE_LAYOUT[key].length / divisor);
  assert.deepEqual(
    result.state.stats,
    {
      terrainVertices: result.state.stats.terrainVertices,
      palms: expectedCount("palms"),
      blossoms: expectedCount("blossoms"),
      bamboo: expectedCount("bamboo"),
      rocks: expectedCount("rocks"),
      buildings: REFERENCE_LAYOUT.structures.length,
      mountains: REFERENCE_LAYOUT.mountains.length,
      decorations: expectedCount("decorations"),
      wildlife: REFERENCE_LAYOUT.wildlife.length,
    },
    `variant ${variant} scene counts drifted from the measured layout`,
  );

  const runtimePaths = result.requests
    .map((requestUrl) => new URL(requestUrl))
    .filter((url) => ["127.0.0.1", "localhost"].includes(url.hostname))
    .map((url) => url.pathname);
  for (const runtimePath of runtimePaths) {
    assert.ok(
      permittedRuntimePaths.has(runtimePath),
      `variant ${variant} requested a non-code or unexpected resource: ${runtimePath}`,
    );
  }
  assert.ok(
    runtimePaths.includes("/full-island-prototype.js"),
    `variant ${variant} did not execute the procedural entrypoint`,
  );
  process.stdout.write(
    `full-island variant ${variant}: OK (${runtimePaths.length} local code requests, no authored assets)\n`,
  );
}
