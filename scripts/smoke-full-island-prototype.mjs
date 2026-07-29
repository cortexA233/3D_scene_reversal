import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";

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
const [entrySource, htmlSource] = await Promise.all([
  readFile(entryPath, "utf8"),
  readFile(htmlPath, "utf8"),
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

const permittedRuntimePaths = new Set([
  "/",
  "/full-island-prototype.js",
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
      error: window.island?.error ?? null
    }))()`,
  });

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
