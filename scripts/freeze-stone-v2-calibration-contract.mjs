import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  describeFrozenFiles,
  verifyCandidateFreeze,
} from "../tools/evaluation/candidate-freeze.mjs";
import {
  stoneGeometryV2CalibrationContractDefinition,
  validateStoneGeometryV2CalibrationContract,
} from "../tools/evaluation/stone-v2-calibration-contract.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CONTRACT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stone-geometry-v2-calibration-contract.json",
);
const CANDIDATE_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
);
const CANDIDATE_FILES = [
  "gt_designer/src/reconstruction/core/object-generator.js",
  "gt_designer/src/reconstruction/core/rng.js",
  "gt_designer/src/reconstruction/objects/object-registry.js",
  "gt_designer/src/reconstruction/objects/stone-generator.js",
  "gt_designer/src/reconstruction/objects/stone-recipe.js",
  "package-lock.json",
];
const EVIDENCE_FILES = [
  "gt_designer/single-mesh-evaluation/reports/stone-acceptance-v2.json",
  "gt_designer/single-mesh-runtime-audit/reports/stone-nonvisual-v2.json",
  "tools/development/fit-stone-supports.mjs",
];
const BASELINE_FILES = [
  "gt_designer/single-mesh-evaluation/baselines/stage-1-quality-calibration-v1.json",
  "tools/evaluation/visual-metrics.mjs",
];

const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("usage: node scripts/freeze-stone-v2-calibration-contract.mjs [--check]");
}

const contract = stoneGeometryV2CalibrationContractDefinition();
const contractValidation = validateStoneGeometryV2CalibrationContract(contract);
if (!contractValidation.passed) {
  throw new Error(`invalid contract: ${contractValidation.failures.join(", ")}`);
}

if (check) {
  const frozenContract = JSON.parse(await readFile(CONTRACT_OUTPUT, "utf8"));
  if (JSON.stringify(frozenContract) !== JSON.stringify(contract)) {
    throw new Error("frozen Stone v2 calibration contract differs from its source definition");
  }
  const manifest = JSON.parse(await readFile(CANDIDATE_OUTPUT, "utf8"));
  const verification = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest,
  });
  if (!verification.passed) {
    throw new Error(`Stone candidate freeze failed: ${JSON.stringify(verification.failures)}`);
  }
  process.stdout.write(
    `Stone v2 contract: PASS (${manifest.candidateFiles.length} candidate files, ${manifest.evidenceFiles.length} evidence files)\n`,
  );
} else {
  const candidateDiff = await execFile(
    "git",
    ["diff", "--quiet", "HEAD", "--", ...CANDIDATE_FILES, ...EVIDENCE_FILES, ...BASELINE_FILES],
    { cwd: PROJECT_ROOT },
  ).then(() => null, (error) => error);
  if (candidateDiff) {
    throw new Error("candidate, evidence, or baseline files must be committed before freeze");
  }
  const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
    cwd: PROJECT_ROOT,
  });
  const manifest = {
    schemaVersion: "stone-v2-candidate-freeze-v1",
    candidateId: "stone/bounded-support-polyhedron-v2",
    artifactRole: "development-only-candidate-quarantine",
    productionUse: "prohibited",
    freezeCommit: stdout.trim(),
    policy: {
      mutationAfterFreeze: "prohibited",
      calibrationInputUse: "prohibited",
      verification: "sha256-and-byte-length-before-and-after-evaluation",
    },
    candidateFiles: await describeFrozenFiles({ projectRoot: PROJECT_ROOT, paths: CANDIDATE_FILES }),
    evidenceFiles: await describeFrozenFiles({ projectRoot: PROJECT_ROOT, paths: EVIDENCE_FILES }),
    baselineFiles: await describeFrozenFiles({ projectRoot: PROJECT_ROOT, paths: BASELINE_FILES }),
  };
  await mkdir(path.dirname(CONTRACT_OUTPUT), { recursive: true });
  await writeFile(CONTRACT_OUTPUT, `${JSON.stringify(contract, null, 2)}\n`);
  await writeFile(CANDIDATE_OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Stone v2 contract: wrote ${path.relative(PROJECT_ROOT, CONTRACT_OUTPUT)} and ${path.relative(PROJECT_ROOT, CANDIDATE_OUTPUT)}\n`,
  );
}
