import { execFile as execFileCallback } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import {
  runJavaScriptCoreStructure,
  runSpiderMonkeyStructure,
} from "../tools/acceptance/cross-engine-runner.mjs";
import {
  NONVISUAL_REPORT_SCHEMA_VERSION,
  evaluateObjectBudgets,
} from "../tools/acceptance/nonvisual-contract.mjs";
import {
  buildProductionBundle,
  buildProductionSource,
} from "../tools/acceptance/production-build.mjs";
import {
  compareCrossEngineSignatures,
  crossEngineSignature,
} from "../tools/acceptance/runtime-evidence.mjs";
import { auditObjectScalars } from "../tools/acceptance/object-scalar-audit.mjs";
import {
  auditProductionGraph,
  auditSourceText,
} from "../tools/acceptance/static-audit.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-runtime-audit/reports/nonvisual-gates-v1.json",
);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OBJECT_CONFIGS = Object.freeze({
  probe: Object.freeze({
    semanticId: "test.probe",
    sourceFiles: [
      "gt_designer/src/reconstruction/testing/probe-generator.js",
    ],
  }),
  "stone-path": Object.freeze({
    semanticId: "island.path.stone-path",
    sourceFiles: [
      "gt_designer/src/reconstruction/objects/stone-path-recipe.js",
      "gt_designer/src/reconstruction/objects/stone-path-generator.js",
    ],
  }),
  stone: Object.freeze({
    semanticId: "island.nature.stone",
    sourceFiles: [
      "gt_designer/src/reconstruction/objects/stone-recipe.js",
      "gt_designer/src/reconstruction/objects/stone-generator.js",
    ],
  }),
  vase: Object.freeze({
    semanticId: "island.decor.vase",
    sourceFiles: [
      "gt_designer/src/reconstruction/objects/vase-recipe.js",
      "gt_designer/src/reconstruction/objects/vase-generator.js",
    ],
  }),
  umbrella: Object.freeze({
    semanticId: "island.prop.umbrella",
    sourceFiles: [
      "gt_designer/src/reconstruction/objects/umbrella-recipe.js",
      "gt_designer/src/reconstruction/objects/umbrella-generator.js",
    ],
  }),
});

function parseArguments(args) {
  const options = { check: false, objectId: "probe", output: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") options.check = true;
    else if (args[index] === "--object" && args[index + 1]) {
      options.objectId = args[++index];
    }
    else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  if (!OBJECT_CONFIGS[options.objectId]) {
    throw new Error(`Unsupported acceptance object: ${options.objectId}`);
  }
  options.output ??= options.objectId === "probe"
    ? DEFAULT_OUTPUT
    : path.join(
        PROJECT_ROOT,
        `gt_designer/single-mesh-runtime-audit/reports/${options.objectId}-nonvisual-v1.json`,
      );
  return options;
}

async function commandOutput(command, args) {
  const result = await execFile(command, args, { cwd: PROJECT_ROOT });
  return result.stdout.trim();
}

async function machineEnvironment(browserReport) {
  const hardwareText = await commandOutput("system_profiler", [
    "SPHardwareDataType",
  ]);
  const field = (label) =>
    hardwareText.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"))?.[1] ?? null;
  const powerText = await commandOutput("pmset", ["-g", "batt"]);
  return {
    normativeBaseline: {
      model: "Apple M5 MacBook Pro",
      operatingSystem: "macOS 26.2",
      browser: "Google Chrome 150.0.7871.184",
      three: "0.170.0",
    },
    actual: {
      modelName: field("Model Name"),
      modelIdentifier: field("Model Identifier"),
      chip: field("Chip"),
      cores: field("Total Number of Cores"),
      memory: field("Memory"),
      operatingSystem: `macOS ${await commandOutput("sw_vers", ["-productVersion"])}`,
      operatingSystemBuild: await commandOutput("sw_vers", ["-buildVersion"]),
      browser: await commandOutput(CHROME, ["--version"]),
      three: `0.${browserReport.environment.threeRevision}.0`,
      powerState: powerText.split("\n").map((line) => line.trim()),
    },
    migrationRequired: false,
  };
}

function isolatedHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script></head>
<body data-state="loading"><p id="state">Loading isolated production bundle…</p>
<script type="module" src="/bundle.js"></script></body></html>\n`;
}

async function runIsolatedProduction(bundle, objectId, semanticId) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "single-mesh-production-audit-"),
  );
  try {
    await Promise.all([
      writeFile(path.join(directory, "index.html"), isolatedHtml()),
      writeFile(path.join(directory, "bundle.js"), bundle.contents),
      copyFile(
        path.join(PROJECT_ROOT, "node_modules/three/build/three.module.min.js"),
        path.join(directory, "three.module.js"),
      ),
    ]);
    const result = await runLocalSceneAutomation({
      label: "isolated-production",
      serverFlag: null,
      serverArguments: ["--production-audit-root", directory],
      path: "/",
      query: `?object=${encodeURIComponent(objectId)}`,
      readyState: { state: "ready", objectId: semanticId },
      threeProbePath: "/three.module.js",
      timeoutMs: 30_000,
      port: 8430,
    });
    return {
      passed: true,
      servedFiles: (await readdir(directory)).sort(),
      authoredDirectoriesAvailableToServer: false,
      emptyBrowserProfile: true,
      networkResolutionBlocked: true,
      localRequestCount: result.requestCount,
    };
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const objectConfig = OBJECT_CONFIGS[options.objectId];
  const runtimeResult = await runLocalSceneAutomation({
    label: "nonvisual-runtime",
    serverFlag: "--runtime-audit",
    path: "/single-mesh-runtime-audit/",
    query: `?object=${encodeURIComponent(options.objectId)}`,
    readyState: { state: "ready", objectId: options.objectId },
    probeExpression: `(() => ({
      state: document.body?.dataset?.state ?? null,
      statusText: document.querySelector('#state')?.textContent ?? null,
      objectId: document.body?.dataset?.objectId ?? null,
      report: window.singleMeshRuntimeAudit?.report ?? null
    }))()`,
    timeoutMs: 30_000,
    port: 8420,
  });
  const runtime = runtimeResult.state.report;
  const productionBundle = await buildProductionBundle({
    entryPoint: "gt_designer/single-mesh-replacement/main.js",
    projectRoot: PROJECT_ROOT,
  });
  const objectEntry = objectConfig.sourceFiles
    .map(
      (sourceFile, index) =>
        `import * as objectModule${index} from "./${sourceFile}";`,
    )
    .join("\n");
  const objectBundle = await buildProductionSource({
    source: objectEntry,
    sourcefile: `${options.objectId}-object-entry.js`,
    projectRoot: PROJECT_ROOT,
  });
  const sharedSource = `
    import * as objectGenerator from "./gt_designer/src/reconstruction/core/object-generator.js";
    import * as seededRng from "./gt_designer/src/reconstruction/core/rng.js";
    globalThis.__singleMeshShared = { objectGenerator, seededRng };
  `;
  const sharedBundle = await buildProductionSource({
    source: sharedSource,
    sourcefile: "shared-framework-entry.js",
    projectRoot: PROJECT_ROOT,
  });
  const combinedBundle = await buildProductionSource({
    source: `${sharedSource}
      ${objectEntry}
      globalThis.__singleMeshObject = { ${objectConfig.sourceFiles
        .map((_, index) => `objectModule${index}`)
        .join(", ")} };
    `,
    sourcefile: "combined-object-entry.js",
    projectRoot: PROJECT_ROOT,
  });
  const objectBundleDeltaGzipBytes = Math.max(
    0,
    combinedBundle.gzipBytes - sharedBundle.gzipBytes,
  );
  const groundTruth = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        "gt_designer/single-mesh-lab/ground-truth/evidence-v1.json",
      ),
      "utf8",
    ),
  );
  const staticAudit = await auditProductionGraph({
    projectRoot: PROJECT_ROOT,
    metafile: productionBundle.metafile,
    sourceNodeIds: groundTruth.objects.map(
      (object) => object.developmentSourceNode,
    ),
  });
  const bundleAudit = auditSourceText(
    new TextDecoder().decode(productionBundle.contents),
    {
      sourceNodeIds: groundTruth.objects.map(
        (object) => object.developmentSourceNode,
      ),
    },
  );
  const sourceScalars = await auditObjectScalars({
    projectRoot: PROJECT_ROOT,
    objectId: options.objectId,
  });
  const budgets = evaluateObjectBudgets({
    objectId: options.objectId,
    sourceScalarCount: sourceScalars.count,
    runtime,
    bundleGzipBytes: objectBundleDeltaGzipBytes,
  });
  const chromeSignature = crossEngineSignature(
    runtime.deterministic.snapshot,
  );
  const [javaScriptCore, spiderMonkey] = await Promise.all([
    runJavaScriptCoreStructure({
      projectRoot: PROJECT_ROOT,
      objectId: options.objectId,
    }),
    runSpiderMonkeyStructure({
      projectRoot: PROJECT_ROOT,
      objectId: options.objectId,
    }),
  ]);
  const crossEngine = {
    boundsToleranceCanonical: 0.000007,
    normative: { engine: "Chrome/V8", signature: chromeSignature },
    candidates: [javaScriptCore, spiderMonkey].map((candidate) => ({
      engine: candidate.engine,
      comparison: compareCrossEngineSignatures(
        chromeSignature,
        candidate.signature,
        0.000007,
      ),
      signature: candidate.signature,
    })),
  };
  crossEngine.passed = crossEngine.candidates.every(
    (candidate) => candidate.comparison.passed,
  );
  const offline = await runIsolatedProduction(
    productionBundle,
    options.objectId,
    objectConfig.semanticId,
  );
  const environment = await machineEnvironment(runtime);
  environment.migrationRequired = !(
    environment.actual.modelName === "MacBook Pro" &&
    environment.actual.chip === "Apple M5" &&
    environment.actual.operatingSystem === "macOS 26.2" &&
    environment.actual.browser === "Google Chrome 150.0.7871.184" &&
    environment.actual.three === "0.170.0"
  );
  const checks = [
    {
      id: "complete-source-scalar-audit",
      passed: sourceScalars.passed,
      detail: {
        value: sourceScalars.count,
        maximum: sourceScalars.maximum,
      },
    },
    { id: "object-budgets", passed: budgets.passed, detail: budgets.failures },
    { id: "static-source-audit", passed: staticAudit.passed, detail: staticAudit.failures },
    { id: "minified-bundle-audit", passed: bundleAudit.passed, detail: bundleAudit.failures },
    { id: "isolated-offline-render", passed: offline.passed, detail: offline },
    {
      id: "cross-engine-structure-and-bounds",
      passed: crossEngine.passed,
      detail: crossEngine.candidates.map((candidate) => ({
        engine: candidate.engine,
        comparison: candidate.comparison,
      })),
    },
    {
      id: "normative-environment",
      passed: !environment.migrationRequired,
      detail: environment.actual,
    },
  ];
  const report = {
    schemaVersion: NONVISUAL_REPORT_SCHEMA_VERSION,
    artifactRole: "development-only-nonvisual-acceptance",
    productionUse: "prohibited",
    objectId: options.objectId,
    runtime,
    sourceScalars,
    bundles: {
      production: {
        bytes: productionBundle.bytes,
        gzipBytes: productionBundle.gzipBytes,
        minified: productionBundle.minified,
        sourceMapBytes: productionBundle.sourceMapBytes,
        threeExcluded: !productionBundle.threeBundled,
      },
      objectIncrement: {
        measurement:
          "gzip difference between the minified source-map-free object bundle and shared Object Generator/RNG bundle, with Three.js external",
        bytes: objectBundle.bytes,
        objectBundleGzipBytes: objectBundle.gzipBytes,
        combinedBundleGzipBytes: combinedBundle.gzipBytes,
        sharedFrameworkGzipBytes: sharedBundle.gzipBytes,
        gzipBytes: objectBundleDeltaGzipBytes,
      },
    },
    budgets,
    staticAudit,
    bundleAudit,
    offline,
    crossEngine,
    environment,
    acceptance: {
      passed: checks.every((check) => check.passed),
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.check) {
    const frozen = JSON.parse(await readFile(options.output, "utf8"));
    if (frozen.schemaVersion !== report.schemaVersion) {
      throw new Error("frozen nonvisual report schema differs from live audit");
    }
  } else {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized);
  }
  if (!report.acceptance.passed) {
    for (const failure of report.acceptance.failures) {
      process.stderr.write(
        `nonvisual failure: ${failure.id}: ${JSON.stringify(failure.detail)}\n`,
      );
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `nonvisual acceptance: PASS (${checks.length} checks, ${runtime.benchmark.p95Milliseconds.toFixed(3)} ms p95)\n`,
    );
    if (!options.check) {
      process.stdout.write(
        `nonvisual acceptance: wrote ${path.relative(PROJECT_ROOT, options.output)}\n`,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
