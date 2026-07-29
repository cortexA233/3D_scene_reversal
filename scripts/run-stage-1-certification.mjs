import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { buildProductionBundle } from "../tools/acceptance/production-build.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OBJECT_IDS = Object.freeze(["stone-path", "stone", "vase", "umbrella"]);
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stage-1-certification-v1.json",
);
const DEFAULT_SUMMARY = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stage-1-evidence-summary-v1.md",
);

function parseArguments(args) {
  const options = {
    check: false,
    refreshObjects: true,
    output: DEFAULT_OUTPUT,
    summary: DEFAULT_SUMMARY,
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") options.check = true;
    else if (args[index] === "--skip-object-runs") {
      options.refreshObjects = false;
    } else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else if (args[index] === "--summary" && args[index + 1]) {
      options.summary = path.resolve(PROJECT_ROOT, args[++index]);
    } else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  return options;
}

async function refreshObjectEvidence(objectId, check) {
  const args = [
    "scripts/run-object-acceptance.mjs",
    "--object",
    objectId,
  ];
  if (check) args.push("--check");
  try {
    const result = await execFile(process.execPath, args, {
      cwd: PROJECT_ROOT,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { objectId, exitCode: 0, stdout: result.stdout.trim(), stderr: "" };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return {
      objectId,
      exitCode: error.code,
      stdout: error.stdout?.trim() ?? "",
      stderr: error.stderr?.trim() ?? "",
    };
  }
}

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"),
  );
}

function metricSummary(report) {
  const aggregate = report.visual.comparison.aggregate;
  return {
    passed: report.acceptance.passed,
    geometryPassed: report.visual.comparison.gate.geometryGate.passed,
    appearanceEvaluated:
      report.visual.comparison.gate.appearanceGate.evaluated,
    appearancePassed: report.visual.comparison.gate.appearanceGate.passed,
    meanSilhouetteIou: aggregate.geometry.silhouette.meanIou,
    worstSilhouetteIou: aggregate.geometry.silhouette.worstViewIou,
    depthP95: aggregate.geometry.depth.p95,
    meanDeltaE00: aggregate.appearance.meanDeltaE00,
    p90DeltaE00: aggregate.appearance.p90DeltaE00,
    meanMaskedSsim: aggregate.appearance.meanMaskedSsim,
    worstViewSsim: aggregate.appearance.worstViewSsim,
    failures: report.acceptance.failures,
  };
}

function humanSummary(report) {
  const rows = report.objects.map((object) => {
    const metrics = object.metrics;
    return `| ${object.objectId} | ${object.passed ? "PASS" : "FAIL"} | ${metrics.geometryPassed ? "PASS" : "FAIL"} | ${metrics.appearancePassed === null ? "not evaluated" : metrics.appearancePassed ? "PASS" : "FAIL"} | ${metrics.meanSilhouetteIou.toFixed(4)} | ${metrics.depthP95.toFixed(4)} | ${metrics.meanDeltaE00.toFixed(2)} | ${metrics.meanMaskedSsim.toFixed(3)} |`;
  });
  return `# Stage 1 evidence summary v1

Certification result: **${report.certification.passed ? "PASS" : "FAIL"}**.

The strict four-object hypothesis is not supported: ${report.certification.passedObjectCount} of ${report.certification.requiredObjectCount} Stage 1 objects passed every frozen hard gate. Stone fails frozen geometry thresholds; Umbrella passes geometry and nonvisual gates but fails frozen procedural-appearance thresholds. Strong aggregate performance does not compensate for either failure.

| Object | Overall | Geometry | Appearance | Mean IoU | Depth P95 | Mean Delta E 00 | Mean SSIM |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
${rows.join("\n")}

Aggregate gates:

- Combined production payload: ${report.aggregate.productionBundle.gzipBytes.toLocaleString()} / 40,960 gzip bytes, Three.js excluded — ${report.aggregate.productionBundle.passed ? "PASS" : "FAIL"}.
- Sequential warm generation p95: ${report.aggregate.sequentialGeneration.p95Milliseconds.toFixed(3)} / 25 ms — ${report.aggregate.sequentialGeneration.passed ? "PASS" : "FAIL"}.
- Runtime texture count: ${report.aggregate.referenceIndependence.runtimeTextureCount}; WASM detected: ${report.aggregate.referenceIndependence.wasmDetected} — ${report.aggregate.referenceIndependence.passed ? "PASS" : "FAIL"}.
- Isolated offline production render: ${report.aggregate.referenceIndependence.offlinePassed ? "PASS" : "FAIL"}.
- Chrome byte determinism plus JavaScriptCore/SpiderMonkey structural and bounds evidence: ${report.aggregate.determinism.passed ? "PASS" : "FAIL"}.
- Firefox/Safari GPU visual-tolerance rerun: ${report.aggregate.browserVisualTolerance.status}; skipped after normative object gates failed and therefore not evidence of a passing stage.

Retained evidence:

- Accepted production candidates: Stone Path shallow extrusion and Vase hollow lathe/procedural gradient.
- Negative experimental generators: Stone compact loft and Umbrella radial assembly/procedural flower shader.
- Retained infrastructure: Reconstruction Unit contract, registry, deterministic RNG, fixed-view Evaluation Harness, frozen Quality Baseline, nonvisual budgets, static audits, cross-engine signatures, isolated offline render, and stage certification runner.
- No production WASM, CSG, SDF, authored models, authored pixels, or new runtime dependency was introduced.

Architecture conclusion:

No geometry-library trigger was met: the completed generators did not duplicate a missing Boolean/SDF/CSG operation, and all compactness/runtime budgets passed. Umbrella instead exposes a procedural-appearance expressiveness limit under the current no-authored-pixels and 96-scalar boundary. That boundary and the meaning of exact-ish for hero textured props must be reviewed before treating full-island reversal as de-risked.

Formal Single Mesh Lab exit is not claimed. It still requires six of eight references including Bamboo Shoot and Mushroom, after a new decision/specification cycle prompted by these failures.
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const objectRuns = [];
  if (options.refreshObjects) {
    // Each object runner owns a fixed local port. Keep the certification order
    // deterministic and avoid racing those deliberately isolated servers.
    for (const objectId of OBJECT_IDS) {
      process.stdout.write(`Stage 1 certification: refreshing ${objectId}\n`);
      objectRuns.push(await refreshObjectEvidence(objectId, options.check));
    }
  }
  const objects = [];
  for (const objectId of OBJECT_IDS) {
    const acceptancePath =
      `gt_designer/single-mesh-evaluation/reports/${objectId}-acceptance-v1.json`;
    const nonvisualPath =
      `gt_designer/single-mesh-runtime-audit/reports/${objectId}-nonvisual-v1.json`;
    const acceptance = await readJson(acceptancePath);
    const nonvisual = await readJson(nonvisualPath);
    objects.push({
      objectId,
      passed: acceptance.acceptance.passed,
      metrics: metricSummary(acceptance),
      budgets: nonvisual.budgets,
      deterministicByteStable: nonvisual.runtime.deterministic.byteStable,
      runtimeTextureCount:
        nonvisual.runtime.deterministic.snapshot.runtimeTextureCount,
      offlinePassed: nonvisual.offline.passed,
      crossEnginePassed: nonvisual.crossEngine.passed,
      reports: { acceptance: acceptancePath, nonvisual: nonvisualPath },
    });
  }

  const stageRuntimeRun = await runLocalSceneAutomation({
    label: "stage-1-runtime",
    serverFlag: "--runtime-audit",
    path: "/single-mesh-runtime-audit/",
    query: "?object=stage-1",
    readyState: { state: "ready", objectId: "stage-1" },
    probeExpression: `({
      state: document.body?.dataset?.state ?? null,
      objectId: document.body?.dataset?.objectId ?? null,
      report: window.singleMeshRuntimeAudit?.report ?? null
    })`,
    timeoutMs: 30_000,
    port: 8480,
  });
  const stageRuntime = stageRuntimeRun.state.report;
  const productionBundle = await buildProductionBundle({
    entryPoint: "gt_designer/single-mesh-replacement/main.js",
    projectRoot: PROJECT_ROOT,
  });
  const bundleText = new TextDecoder().decode(productionBundle.contents);
  const wasmDetected = /WebAssembly|\.wasm\b/i.test(bundleText);
  const runtimeTextureCount = objects.reduce(
    (sum, object) => sum + object.runtimeTextureCount,
    0,
  );
  const objectPassCount = objects.filter((object) => object.passed).length;
  const aggregate = {
    productionBundle: {
      bytes: productionBundle.bytes,
      gzipBytes: productionBundle.gzipBytes,
      maximumGzipBytes: 40 * 1024,
      threeExcluded: !productionBundle.threeBundled,
      passed:
        productionBundle.gzipBytes <= 40 * 1024 &&
        !productionBundle.threeBundled,
    },
    sequentialGeneration: {
      ...stageRuntime.sequentialBenchmark,
      maximumP95Milliseconds: 25,
      passed: stageRuntime.sequentialBenchmark.p95Milliseconds <= 25,
    },
    referenceIndependence: {
      wasmDetected,
      runtimeTextureCount,
      offlinePassed: objects.every((object) => object.offlinePassed),
      passed:
        !wasmDetected &&
        runtimeTextureCount === 0 &&
        objects.every((object) => object.offlinePassed),
    },
    determinism: {
      normativeByteStable: objects.every(
        (object) => object.deterministicByteStable,
      ),
      crossEngineStructureAndBounds: objects.every(
        (object) => object.crossEnginePassed,
      ),
      engines: ["Chrome/V8", "Safari JavaScriptCore", "Firefox SpiderMonkey"],
      passed:
        objects.every((object) => object.deterministicByteStable) &&
        objects.every((object) => object.crossEnginePassed),
    },
    browserVisualTolerance: {
      status: "not-run-after-normative-hard-gate-failure",
      reason:
        "Firefox/Safari GPU visual reruns cannot make a stage pass after Stone and Umbrella fail normative frozen gates.",
      passed: false,
    },
  };
  const checks = [
    {
      id: "four-of-four-object-hard-gates",
      passed: objectPassCount === OBJECT_IDS.length,
      detail: { passed: objectPassCount, required: OBJECT_IDS.length },
    },
    {
      id: "combined-production-payload",
      passed: aggregate.productionBundle.passed,
      detail: aggregate.productionBundle,
    },
    {
      id: "sequential-warm-generation",
      passed: aggregate.sequentialGeneration.passed,
      detail: aggregate.sequentialGeneration,
    },
    {
      id: "reference-independence",
      passed: aggregate.referenceIndependence.passed,
      detail: aggregate.referenceIndependence,
    },
    {
      id: "deterministic-structure-and-bounds",
      passed: aggregate.determinism.passed,
      detail: aggregate.determinism,
    },
    {
      id: "supported-browser-visual-tolerance",
      passed: aggregate.browserVisualTolerance.passed,
      detail: aggregate.browserVisualTolerance,
    },
  ];
  const report = {
    schemaVersion: "single-mesh-stage-1-certification-v1",
    artifactRole: "development-only-stage-certification",
    productionUse: "prohibited",
    objectRuns,
    objects,
    aggregate,
    architectureEvidence: {
      repeatedMissingGeometryOperationCount: 0,
      generalGeometryLayerTriggerMet: false,
      thirdPartyGeometryRuntimeTriggerMet: false,
      productionDependencies: ["three"],
      proceduralAppearanceReviewRequired: true,
      evidence:
        "Umbrella geometry passes without CSG/SDF/WASM; its authored floral identity fails after compact vertex-color and shader representations.",
    },
    certification: {
      passed: checks.every((check) => check.passed),
      passedObjectCount: objectPassCount,
      requiredObjectCount: OBJECT_IDS.length,
      coreHypothesisSupported: objectPassCount === OBJECT_IDS.length,
      formalSingleMeshLabExitClaimed: false,
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
  const summary = humanSummary(report);
  if (options.check) {
    const frozen = JSON.parse(await readFile(options.output, "utf8"));
    if (
      frozen.schemaVersion !== report.schemaVersion ||
      frozen.certification.passed !== report.certification.passed ||
      frozen.certification.passedObjectCount !==
        report.certification.passedObjectCount
    ) {
      throw new Error("frozen Stage 1 certification conclusion differs");
    }
  } else {
    await mkdir(path.dirname(options.output), { recursive: true });
    await Promise.all([
      writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`),
      writeFile(options.summary, summary),
    ]);
  }
  process.stdout.write(
    `Stage 1 certification: ${report.certification.passed ? "PASS" : "FAIL"} ` +
      `(${objectPassCount}/${OBJECT_IDS.length} objects, ` +
      `${productionBundle.gzipBytes} gzip bytes, ` +
      `${stageRuntime.sequentialBenchmark.p95Milliseconds.toFixed(3)} ms p95)\n`,
  );
  if (!options.check) {
    process.stdout.write(
      `Stage 1 certification: wrote ${path.relative(PROJECT_ROOT, options.output)}\n`,
    );
  }
  if (!report.certification.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
