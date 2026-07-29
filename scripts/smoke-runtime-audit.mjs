import assert from "node:assert/strict";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";

const result = await runLocalSceneAutomation({
  label: "runtime-audit",
  serverFlag: "--runtime-audit",
  path: "/single-mesh-runtime-audit/",
  query: "?object=probe",
  readyState: { state: "ready", objectId: "probe", reportValid: true },
  probeExpression: `(() => {
    const report = window.singleMeshRuntimeAudit?.report;
    return {
      state: document.body?.dataset?.state ?? null,
      statusText: document.querySelector('#state')?.textContent ?? null,
      objectId: document.body?.dataset?.objectId ?? null,
      reportValid: Boolean(
        report?.deterministic?.byteStable === true &&
        report?.benchmark?.warmups === 10 &&
        report?.benchmark?.repetitions === 100 &&
        report?.deterministic?.snapshot?.runtimeTextureCount === 0
      ),
      report
    };
  })()`,
  timeoutMs: 30_000,
  port: 8420,
});

assert.equal(result.state.report.environment.threeRevision, "170");
assert.ok(result.state.report.benchmark.p95Milliseconds < 20);
process.stdout.write(
  `runtime audit smoke: OK (${result.state.report.benchmark.p95Milliseconds.toFixed(3)} ms p95)\n`,
);
