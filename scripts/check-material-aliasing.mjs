import assert from "node:assert/strict";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";

const objectId = process.argv[2] ?? "candle";
const result = await runLocalSceneAutomation({
  label: `${objectId}-material-aliasing`,
  serverFlag: "--evaluation",
  path: "/single-mesh-evaluation/",
  query: `?unit=${encodeURIComponent(objectId)}&replacement=${encodeURIComponent(objectId)}&diagnose=material-aliasing`,
  readyState: {
    state: "material-aliasing-complete",
    objectId,
  },
  probeExpression: `({
    state: document.body?.dataset?.state ?? null,
    objectId: document.body?.dataset?.objectId ?? null,
    report: window.singleMeshEvaluation?.materialAliasingReport ?? null
  })`,
  timeoutMs: 30_000,
  port: 8470,
});

assert.equal(
  result.state.report?.passed,
  true,
  `material scale consistency failed: ${JSON.stringify(result.state.report)}`,
);
process.stdout.write(
  `material aliasing: PASS (${objectId}, ${JSON.stringify(result.state.report.aggregate)})\n`,
);
