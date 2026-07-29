import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const objectId = args.find((argument) => !argument.startsWith("--")) ?? "candle";
const check = args.includes("--check");
const outputIndex = args.indexOf("--output");
const output = outputIndex >= 0
  ? path.resolve(PROJECT_ROOT, args[outputIndex + 1])
  : path.join(
      PROJECT_ROOT,
      `gt_designer/single-mesh-evaluation/reports/${objectId}-material-aliasing-v1.json`,
    );
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
const report = {
  schemaVersion: "single-mesh-material-aliasing-evidence-v1",
  artifactRole: "development-only-material-scale-consistency-evidence",
  productionUse: "prohibited",
  objectId,
  referenceAssetPolicy:
    "development-only comparison; no asset bytes or sampled derivatives in Production Runtime",
  acceptance: {
    passed: result.state.report.passed,
    failures: result.state.report.failures,
  },
  scaleConsistency: result.state.report,
};
if (check) {
  const frozen = JSON.parse(await readFile(output, "utf8"));
  assert.equal(frozen.schemaVersion, report.schemaVersion);
  assert.equal(frozen.objectId, report.objectId);
  assert.equal(frozen.acceptance?.passed, true);
} else {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(
  `material aliasing: PASS (${objectId}, ${JSON.stringify(result.state.report.aggregate)})\n`,
);
