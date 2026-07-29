import { smokeLocalScene } from "./lib/smoke-local-scene.mjs";

await smokeLocalScene({
  label: "stage-1-5-scene",
  serverFlag: "--stage-1-5",
  path: "/stage-1-5-scene/",
  readyState: {
    state: "ready",
    objectCount: "4",
    layoutVersion: "stage-1-5-eight-slot-lab-layout-v2",
    layoutKind: "eight-slot-lab-reference",
    referenceSlotCount: "8",
    populatedSlotCount: "4",
    authoredSceneLoaded: false,
  },
  probeExpression: `({
    state: document.body?.dataset?.state ?? null,
    objectCount: document.body?.dataset?.objectCount ?? null,
    layoutVersion: document.body?.dataset?.layoutVersion ?? null,
    layoutKind: document.body?.dataset?.layoutKind ?? null,
    referenceSlotCount: document.body?.dataset?.referenceSlotCount ?? null,
    populatedSlotCount: document.body?.dataset?.populatedSlotCount ?? null,
    authoredSceneLoaded: (window.island?.authoredScene?.meshes ?? 0) > 0,
    statusText: document.querySelector('#state')?.textContent ?? null
  })`,
  timeoutMs: 45_000,
  port: 8490,
});
