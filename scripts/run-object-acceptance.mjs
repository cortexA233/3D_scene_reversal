import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArguments(args) {
  const options = {
    objectId: null,
    check: false,
    output: null,
    evidenceVersion: "v1",
    geometryBaseline: null,
    appearanceBaseline: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") options.check = true;
    else if (args[index] === "--object" && args[index + 1]) {
      options.objectId = args[++index];
    } else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else if (args[index] === "--evidence-version" && args[index + 1]) {
      options.evidenceVersion = args[++index];
    } else if (args[index] === "--geometry-baseline" && args[index + 1]) {
      options.geometryBaseline = args[++index];
    } else if (args[index] === "--appearance-baseline" && args[index + 1]) {
      options.appearanceBaseline = args[++index];
    } else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  if (!options.objectId) throw new Error("--object is required");
  if (!/^v\d+$/.test(options.evidenceVersion)) {
    throw new Error("--evidence-version must use the form v<number>");
  }
  if (options.geometryBaseline && options.appearanceBaseline) {
    throw new Error("category geometry and appearance baselines are exclusive");
  }
  options.output ??= path.join(
    PROJECT_ROOT,
    `gt_designer/single-mesh-evaluation/reports/${options.objectId}-acceptance-${options.evidenceVersion}.json`,
  );
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const checkUmbrellaGeometry = async () => {
    if (!["patterned-v2", "patterned-v3"].includes(options.appearanceBaseline)) {
      return { passed: true, detail: null };
    }
    try {
      const result = await execFile(
        process.execPath,
        ["scripts/freeze-umbrella-geometry.mjs", "--check"],
        { cwd: PROJECT_ROOT },
      );
      return { passed: true, detail: result.stdout.trim() };
    } catch (error) {
      return { passed: false, detail: error.stderr ?? error.message };
    }
  };
  const umbrellaGeometryBefore = await checkUmbrellaGeometry();
  if (!umbrellaGeometryBefore.passed) {
    throw new Error(`Umbrella geometry freeze failed before evaluation: ${umbrellaGeometryBefore.detail}`);
  }
  const candidateManifest = options.geometryBaseline === "stone-v2"
    ? JSON.parse(
        await readFile(
          path.join(
            PROJECT_ROOT,
            "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
          ),
          "utf8",
        ),
      )
    : options.appearanceBaseline === "patterned-v3"
      ? JSON.parse(
          await readFile(
            path.join(
              PROJECT_ROOT,
              "gt_designer/single-mesh-evaluation/baselines/umbrella-v3-approved-candidate-freeze.json",
            ),
            "utf8",
          ),
        )
      : null;
  const candidateBefore = candidateManifest
    ? await verifyCandidateFreeze({
        projectRoot: PROJECT_ROOT,
        manifest: candidateManifest,
      })
    : { passed: true, failures: [] };
  if (!candidateBefore.passed) {
    throw new Error(
      `candidate quarantine failed before evaluation: ${JSON.stringify(candidateBefore.failures)}`,
    );
  }
  const nonvisualOutput = path.join(
    PROJECT_ROOT,
    `gt_designer/single-mesh-runtime-audit/reports/${options.objectId}-nonvisual-${options.evidenceVersion}.json`,
  );
  const nonvisualArguments = [
    "scripts/run-nonvisual-acceptance.mjs",
    "--object",
    options.objectId,
    "--output",
    nonvisualOutput,
  ];
  if (options.check) nonvisualArguments.push("--check");
  const nonvisualRun = await execFile(process.execPath, nonvisualArguments, {
    cwd: PROJECT_ROOT,
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(nonvisualRun.stdout);
  const nonvisual = JSON.parse(await readFile(nonvisualOutput, "utf8"));

  const browser = await runLocalSceneAutomation({
    label: `${options.objectId}-visual-acceptance`,
    serverFlag: "--evaluation",
    path: "/single-mesh-evaluation/",
    query: `?evaluate=object&unit=${encodeURIComponent(options.objectId)}${
      options.geometryBaseline
        ? `&geometry-baseline=${encodeURIComponent(options.geometryBaseline)}`
        : ""
    }${
      options.appearanceBaseline
        ? `&appearance-baseline=${encodeURIComponent(options.appearanceBaseline)}`
        : ""
    }`,
    readyState: { state: "evaluated", objectId: options.objectId },
    probeExpression: `({
      state: document.body?.dataset?.state ?? null,
      objectId: document.body?.dataset?.objectId ?? null,
      report: window.singleMeshEvaluation?.objectEvaluationReport ?? null
    })`,
    timeoutMs: 60_000,
    port: 8460,
  });
  const visual = browser.state.report;
  const umbrellaGeometryAfter = await checkUmbrellaGeometry();
  const candidateAfter = candidateManifest
    ? await verifyCandidateFreeze({
        projectRoot: PROJECT_ROOT,
        manifest: candidateManifest,
      })
    : { passed: true, failures: [] };
  const checks = [
    {
      id: "visual-quality-gate",
      passed: visual.comparison.gate.passed,
      detail: visual.comparison.gate.failures,
    },
    {
      id: "nonvisual-acceptance",
      passed: nonvisual.acceptance.passed,
      detail: nonvisual.acceptance.failures,
    },
    {
      id: "complete-fixed-capture-set",
      passed:
        visual.captures.expectedCount === 168 &&
        Object.keys(visual.captures.referenceChecksums).length === 84 &&
        Object.keys(visual.captures.replacementChecksums).length === 84,
      detail: visual.captures.expectedCount,
    },
    {
      id: "reference-derived-framing",
      passed:
        visual.manifest.framing.replacementTransform.independentlyFramed ===
        false,
      detail: visual.manifest.framing.replacementTransform,
    },
    {
      id: "versioned-geometry-and-appearance-baselines",
      passed: options.geometryBaseline
        ? visual.comparison.gate.baselineVersions?.geometry ===
            "stone-geometry-baseline-v2" &&
          visual.comparison.gate.baselineVersions?.appearance ===
            "single-mesh-quality-baseline-v1"
        : options.appearanceBaseline
          ? visual.comparison.gate.baselineVersions?.geometry ===
              "single-mesh-quality-baseline-v1" &&
            visual.comparison.gate.baselineVersions?.appearance ===
              (options.appearanceBaseline === "patterned-v3"
                ? "patterned-appearance-baseline-v3"
                : "patterned-appearance-baseline-v2")
          : visual.comparison.gate.baselineVersion ===
              "single-mesh-quality-baseline-v1",
      detail: visual.comparison.gate.baselineVersions ??
        visual.comparison.gate.baselineVersion,
    },
    {
      id: "candidate-quarantine-before-and-after",
      passed: candidateBefore.passed && candidateAfter.passed,
      detail: [...candidateBefore.failures, ...candidateAfter.failures],
    },
    {
      id: "umbrella-geometry-freeze-before-and-after",
      passed: umbrellaGeometryBefore.passed && umbrellaGeometryAfter.passed,
      detail: [umbrellaGeometryBefore.detail, umbrellaGeometryAfter.detail],
    },
  ];
  const report = {
    schemaVersion: `single-mesh-object-acceptance-${options.evidenceVersion}`,
    evidenceVersion: options.evidenceVersion,
    artifactRole: "development-only-object-acceptance",
    productionUse: "prohibited",
    objectId: options.objectId,
    geometryBaseline: options.geometryBaseline,
    appearanceBaseline: options.appearanceBaseline,
    visual,
    nonvisual,
    acceptance: {
      passed: checks.every((check) => check.passed),
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };

  if (options.check) {
    const frozen = JSON.parse(await readFile(options.output, "utf8"));
    if (
      frozen.schemaVersion !== report.schemaVersion ||
      frozen.objectId !== report.objectId
    ) {
      throw new Error("frozen object acceptance report identity differs");
    }
  } else {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (!report.acceptance.passed) {
    for (const failure of report.acceptance.failures) {
      process.stderr.write(
        `object acceptance failure: ${failure.id}: ${JSON.stringify(failure.detail)}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `object acceptance: PASS (${options.objectId}, ${checks.length} checks)\n`,
  );
  if (!options.check) {
    process.stdout.write(
      `object acceptance: wrote ${path.relative(PROJECT_ROOT, options.output)}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
