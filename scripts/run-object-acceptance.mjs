import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";

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
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") options.check = true;
    else if (args[index] === "--object" && args[index + 1]) {
      options.objectId = args[++index];
    } else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else if (args[index] === "--evidence-version" && args[index + 1]) {
      options.evidenceVersion = args[++index];
    } else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  if (!options.objectId) throw new Error("--object is required");
  if (!/^v\d+$/.test(options.evidenceVersion)) {
    throw new Error("--evidence-version must use the form v<number>");
  }
  options.output ??= path.join(
    PROJECT_ROOT,
    `gt_designer/single-mesh-evaluation/reports/${options.objectId}-acceptance-${options.evidenceVersion}.json`,
  );
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
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
    query: `?evaluate=object&unit=${encodeURIComponent(options.objectId)}`,
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
  ];
  const report = {
    schemaVersion: `single-mesh-object-acceptance-${options.evidenceVersion}`,
    evidenceVersion: options.evidenceVersion,
    artifactRole: "development-only-object-acceptance",
    productionUse: "prohibited",
    objectId: options.objectId,
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
