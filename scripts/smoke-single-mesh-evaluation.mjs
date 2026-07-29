import { smokeLocalScene } from "./lib/smoke-local-scene.mjs";

await smokeLocalScene({
  label: "evaluation",
  serverFlag: "--evaluation",
  path: "/single-mesh-evaluation/",
  query: "?capture=all",
  readyState: {
    state: "ready",
    captureCount: "168",
    manifestCaptures: 168,
    captureByteLengthsValid: true,
    captureChecksumsValid: true,
    manifestViews: 12,
    manifestPasses: 7,
    replacementIndependentlyFramed: false,
  },
  timeoutMs: 60_000,
  port: 8400,
});
