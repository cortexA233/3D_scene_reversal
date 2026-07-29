import { smokeLocalScene } from "./lib/smoke-local-scene.mjs";

await smokeLocalScene({
  label: "eight-object-lab-scene",
  serverFlag: "--stage-1-5",
  path: "/stage-1-5-scene/",
  readyState: {
    state: "ready",
    objectCount: "8",
    layoutVersion: "stage-2-eight-object-lab-layout-v1",
    layoutKind: "eight-slot-lab-reference",
    referenceSlotCount: "8",
    populatedSlotCount: "8",
    deliveryStatus: "complete",
    historicalStage1: "2-of-4-fail",
    authoredSceneLoaded: false,
  },
  probeExpression: `({
    state: document.body?.dataset?.state ?? null,
    objectCount: document.body?.dataset?.objectCount ?? null,
    layoutVersion: document.body?.dataset?.layoutVersion ?? null,
    layoutKind: document.body?.dataset?.layoutKind ?? null,
    referenceSlotCount: document.body?.dataset?.referenceSlotCount ?? null,
    populatedSlotCount: document.body?.dataset?.populatedSlotCount ?? null,
    deliveryStatus: document.body?.dataset?.deliveryStatus ?? null,
    historicalStage1: document.body?.dataset?.historicalStage1 ?? null,
    authoredSceneLoaded: (window.island?.authoredScene?.meshes ?? 0) > 0,
    statusText: document.querySelector('#state')?.textContent ?? null
  })`,
  timeoutMs: 45_000,
  port: 8490,
});
