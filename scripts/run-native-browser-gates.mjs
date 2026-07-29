import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runWebDriverLocalScene } from "./lib/webdriver-local-scene.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const QUALIFICATION_OBJECTS = Object.freeze(["stone-path", "vase"]);

function parseArguments(args) {
  const options = {
    browser: null,
    objects: [],
    repetitions: 2,
    output: null,
    categoryBaseline: null,
    geometryBaseline: null,
    appearanceBaseline: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--browser" && args[index + 1]) {
      options.browser = args[++index];
    } else if (args[index] === "--object" && args[index + 1]) {
      options.objects.push(args[++index]);
    } else if (args[index] === "--repetitions" && args[index + 1]) {
      options.repetitions = Number(args[++index]);
    } else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else if (args[index] === "--category-baseline" && args[index + 1]) {
      options.categoryBaseline = args[++index];
    } else if (args[index] === "--geometry-baseline" && args[index + 1]) {
      options.geometryBaseline = args[++index];
    } else if (args[index] === "--appearance-baseline" && args[index + 1]) {
      options.appearanceBaseline = args[++index];
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (!["firefox", "safari"].includes(options.browser)) {
    throw new Error("--browser must be firefox or safari");
  }
  if (options.objects.length === 0) {
    options.objects = [...QUALIFICATION_OBJECTS];
  }
  if ([options.categoryBaseline, options.geometryBaseline, options.appearanceBaseline].filter(Boolean).length > 1) {
    throw new Error("category, geometry, and appearance baselines are exclusive");
  }
  if (!Number.isInteger(options.repetitions) || options.repetitions < 2) {
    throw new Error("--repetitions must be an integer of at least 2");
  }
  options.output ??= path.join(
    PROJECT_ROOT,
    `gt_designer/single-mesh-evaluation/reports/${options.browser}-native-gpu-gates-v1.json`,
  );
  return options;
}

async function firstExisting(candidates, label) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the declared vendor locations.
    }
  }
  throw new Error(`${label} not found; configure its environment variable`);
}

async function browserConfiguration(browserName) {
  if (browserName === "safari") {
    return {
      browserBinary: "/Applications/Safari.app/Contents/MacOS/Safari",
      driverBinary: await firstExisting(
        [process.env.SAFARIDRIVER_BIN, "/usr/bin/safaridriver"],
        "safaridriver",
      ),
    };
  }
  return {
    browserBinary: await firstExisting(
      [
        process.env.FIREFOX_BIN,
        "/Applications/Firefox.app/Contents/MacOS/firefox",
        path.join(
          PROJECT_ROOT,
          ".scratch/browser-tooling/Firefox.app/Contents/MacOS/firefox",
        ),
      ],
      "Firefox",
    ),
    driverBinary: await firstExisting(
      [
        process.env.GECKODRIVER_BIN,
        "/opt/homebrew/bin/geckodriver",
        "/usr/local/bin/geckodriver",
        path.join(PROJECT_ROOT, ".scratch/browser-tooling/geckodriver"),
      ],
      "geckodriver",
    ),
  };
}

function stableRepetitions(runs) {
  const first = runs[0].report;
  const comparable = (report) => JSON.stringify({
    reference: report.captures.referenceChecksums,
    replacement: report.captures.replacementChecksums,
    aggregate: report.comparison.aggregate,
  });
  return runs.every((run) => comparable(run.report) === comparable(first));
}

async function evaluateObject(options, configuration, objectId, objectIndex) {
  const runs = [];
  for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
    process.stdout.write(
      `${options.browser} native GPU: ${objectId} repetition ${repetition + 1}/${options.repetitions}\n`,
    );
    const automation = await runWebDriverLocalScene({
      browserName: options.browser,
      ...configuration,
      driverPort: 8580 + objectIndex * 10 + repetition,
      serverPort: 8680 + objectIndex * 10 + repetition,
      scenePath: "/single-mesh-evaluation/",
      query: `?evaluate=object&unit=${encodeURIComponent(objectId)}${
        options.categoryBaseline
          ? `&category-baseline=${encodeURIComponent(options.categoryBaseline)}`
          : ""
      }${
        options.geometryBaseline
          ? `&geometry-baseline=${encodeURIComponent(options.geometryBaseline)}`
          : ""
      }${
        options.appearanceBaseline
          ? `&appearance-baseline=${encodeURIComponent(options.appearanceBaseline)}`
          : ""
      }`,
      readyState: { state: "evaluated", objectId },
      probeExpression: `({
        state: document.body?.dataset?.state ?? null,
        statusText: document.querySelector('#state')?.textContent ?? null,
        objectId: document.body?.dataset?.objectId ?? null,
        report: window.singleMeshEvaluation?.objectEvaluationReport ?? null
      })`,
    });
    const report = automation.state.report;
    runs.push({
      repetition: repetition + 1,
      capabilities: automation.capabilities,
      headless: automation.headless,
      softwareRenderingRequested: automation.softwareRenderingRequested,
      report,
    });
  }
  const checks = [
    {
      id: "two-stable-fresh-repetitions",
      passed: stableRepetitions(runs),
    },
    {
      id: "full-fixed-protocol",
      passed: runs.every(
        ({ report }) =>
          report.manifest.views.length === 12 &&
          report.manifest.passes.length === 7 &&
          report.captures.expectedCount === 168 &&
          Object.keys(report.captures.referenceChecksums).length === 84 &&
          Object.keys(report.captures.replacementChecksums).length === 84,
      ),
    },
    {
      id: "visual-quality-gate",
      passed: runs.every(({ report }) => report.comparison.gate.passed),
      detail: runs.map(({ report }) => report.comparison.gate.failures),
    },
    {
      id: "versioned-geometry-and-appearance-baselines",
      passed: options.categoryBaseline
        ? runs.every(
            ({ report }) =>
              report.comparison.gate.baselineVersions?.geometry ===
                (options.categoryBaseline === "stage2-v3"
                  ? `${objectId}-compact-geometry-baseline-v2`
                  : `${objectId}-category-baseline-v1`) &&
              report.comparison.gate.baselineVersions?.appearance ===
                (["stage2-v2", "stage2-v3"].includes(options.categoryBaseline)
                  ? `${objectId}-semantic-category-baseline-v2`
                  : `${objectId}-category-baseline-v1`),
          )
        : options.geometryBaseline
        ? runs.every(
            ({ report }) =>
              report.comparison.gate.baselineVersions?.geometry ===
                "stone-geometry-baseline-v2" &&
              report.comparison.gate.baselineVersions?.appearance ===
                "single-mesh-quality-baseline-v1",
          )
        : options.appearanceBaseline
          ? runs.every(
            ({ report }) =>
              report.comparison.gate.baselineVersions?.geometry ===
                "single-mesh-quality-baseline-v1" &&
              report.comparison.gate.baselineVersions?.appearance ===
                  (options.appearanceBaseline === "patterned-v3"
                    ? "patterned-appearance-baseline-v3"
                    : "patterned-appearance-baseline-v2"),
            )
          : true,
      detail: runs.map(
        ({ report }) =>
          report.comparison.gate.baselineVersions ??
          report.comparison.gate.baselineVersion,
      ),
    },
    {
      id: "hardware-accelerated-webgl",
      passed: runs.every(
        ({ report }) => report.environment.gpu.hardwareAccelerated === true,
      ),
      detail: runs.map(({ report }) => report.environment.gpu),
    },
    {
      id: "native-headful-vendor-driver",
      passed: runs.every(
        (run) => run.headless === false && run.softwareRenderingRequested === false,
      ),
    },
  ];
  return {
    objectId,
    runs,
    acceptance: {
      passed: checks.every((check) => check.passed),
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configuration = await browserConfiguration(options.browser);
  const objects = [];
  for (let index = 0; index < options.objects.length; index += 1) {
    objects.push(
      await evaluateObject(options, configuration, options.objects[index], index),
    );
  }
  const qualification = QUALIFICATION_OBJECTS.every((objectId) =>
    objects.some(
      (object) => object.objectId === objectId && object.acceptance.passed,
    ),
  );
  const report = {
    schemaVersion: "single-mesh-native-browser-gates-v1",
    artifactRole: "development-only-native-gpu-evidence",
    productionUse: "prohibited",
    browser: options.browser,
    categoryBaseline: options.categoryBaseline,
    geometryBaseline: options.geometryBaseline,
    appearanceBaseline: options.appearanceBaseline,
    configuration: {
      browserBinary: configuration.browserBinary,
      driverBinary: configuration.driverBinary,
      requestedRepetitions: options.repetitions,
      headless: false,
      softwareRenderingRequested: false,
    },
    objects,
    qualification: {
      requiredObjects: [...QUALIFICATION_OBJECTS],
      passed: qualification,
      scope: qualification
        ? "browser qualified for subsequent Stone and Umbrella evidence"
        : "object evidence only; qualification requires Stone Path and Vase",
    },
    acceptance: {
      passed: objects.every((object) => object.acceptance.passed),
      failures: objects.filter((object) => !object.acceptance.passed),
    },
  };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.acceptance.passed) {
    throw new Error(`native browser gates failed; see ${options.output}`);
  }
  process.stdout.write(
    `${options.browser} native GPU gates: PASS (${objects.length} objects)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
