import { smokeLocalScene } from "./lib/smoke-local-scene.mjs";

await smokeLocalScene({
  label: "stage-1-5-scene",
  serverFlag: "--stage-1-5",
  path: "/stage-1-5-scene/",
  readyState: {
    state: "ready",
    objectCount: "4",
    layoutVersion: "stage-1-5-reference-layout-v1",
    referenceContext: "true",
    sourceMeshesHidden: "4",
    authoredSceneLoaded: true,
  },
  probeExpression: `({
    state: document.body?.dataset?.state ?? null,
    objectCount: document.body?.dataset?.objectCount ?? null,
    layoutVersion: document.body?.dataset?.layoutVersion ?? null,
    referenceContext: document.body?.dataset?.referenceContext ?? null,
    sourceMeshesHidden: document.body?.dataset?.sourceMeshesHidden ?? null,
    authoredSceneLoaded: (window.island?.authoredScene?.meshes ?? 0) > 0,
    statusText: document.querySelector('#state')?.textContent ?? null
  })`,
  timeoutMs: 45_000,
  port: 8490,
});
