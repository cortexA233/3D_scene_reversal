import { smokeLocalScene } from "./lib/smoke-local-scene.mjs";

await smokeLocalScene({
  label: "replacement",
  serverFlag: "--replacement",
  path: "/single-mesh-replacement/",
  readyState: { state: "ready", objectId: "test.probe" },
});
