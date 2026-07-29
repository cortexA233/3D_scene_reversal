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
  patternedAppearanceV2CalibrationContractDefinition,
  validatePatternedAppearanceV2Contract,
} from "../tools/evaluation/patterned-appearance-v2-contract.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CONTRACT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/patterned-appearance-v2-calibration-contract.json",
);
const SNAPSHOT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/umbrella-v2-precalibration-snapshot.json",
);
const CANDIDATE_FILES = [
  "gt_designer/src/reconstruction/core/object-generator.js",
  "gt_designer/src/reconstruction/objects/object-registry.js",
  "gt_designer/src/reconstruction/objects/umbrella-generator.js",
  "gt_designer/src/reconstruction/objects/umbrella-recipe.js",
  "package-lock.json",
];
const EVIDENCE_FILES = [
  "gt_designer/single-mesh-evaluation/reports/umbrella-acceptance-v1.json",
  "gt_designer/single-mesh-runtime-audit/reports/umbrella-nonvisual-v2.json",
];
const BASELINE_FILES = [
  "gt_designer/single-mesh-evaluation/baselines/stage-1-quality-calibration-v1.json",
  "tools/evaluation/visual-metrics.mjs",
];

const argumentsList = process.argv.slice(2);
const check = argumentsList.includes("--check");
const checkSnapshot = argumentsList.includes("--check-calibration-snapshot");
if (
  argumentsList.some(
    (argument) =>
      argument !== "--check" && argument !== "--check-calibration-snapshot",
  )
) {
  throw new Error(
    "usage: node scripts/freeze-patterned-appearance-v2-contract.mjs [--check] [--check-calibration-snapshot]",
  );
}

const contract = patternedAppearanceV2CalibrationContractDefinition();
const validation = validatePatternedAppearanceV2Contract(contract);
if (!validation.passed) {
  throw new Error(`invalid patterned appearance contract: ${validation.failures.join(", ")}`);
}

if (check) {
  const frozen = JSON.parse(await readFile(CONTRACT_OUTPUT, "utf8"));
  if (JSON.stringify(frozen) !== JSON.stringify(contract)) {
    throw new Error(
      "frozen Patterned Appearance v2 contract differs from its source definition",
    );
  }
}

if (checkSnapshot) {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_OUTPUT, "utf8"));
  const snapshotVerification = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: snapshot,
  });
  if (!snapshotVerification.passed) {
    throw new Error(
      `Umbrella pre-calibration snapshot failed: ${JSON.stringify(snapshotVerification.failures)}`,
    );
  }
}

if (!check && !checkSnapshot) {
  const allFrozenFiles = [
    ...CANDIDATE_FILES,
    ...EVIDENCE_FILES,
    ...BASELINE_FILES,
  ];
  const candidateDiff = await execFile(
    "git",
    ["diff", "--quiet", "HEAD", "--", ...allFrozenFiles],
    { cwd: PROJECT_ROOT },
  ).then(() => null, (error) => error);
  if (candidateDiff) {
    throw new Error(
      "candidate, evidence, and v1 baseline files must be committed before calibration freeze",
    );
  }
  const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
    cwd: PROJECT_ROOT,
  });
  const snapshot = {
    schemaVersion: "umbrella-v2-precalibration-snapshot-v1",
    candidateId: "umbrella/radial-parasol-assembly-v1",
    artifactRole: "development-only-calibration-quarantine",
    productionUse: "prohibited",
    freezeCommit: stdout.trim(),
    policy: {
      calibrationInputUse: "prohibited",
      mutationDuringCalibration: "prohibited",
      mutationAfterCalibrationPass:
        "authorized only by Stage 1.5 resumption Ticket 02",
      verification: "sha256-and-byte-length-before-and-after-calibration",
    },
    candidateFiles: await describeFrozenFiles({
      projectRoot: PROJECT_ROOT,
      paths: CANDIDATE_FILES,
    }),
    evidenceFiles: await describeFrozenFiles({
      projectRoot: PROJECT_ROOT,
      paths: EVIDENCE_FILES,
    }),
    baselineFiles: await describeFrozenFiles({
      projectRoot: PROJECT_ROOT,
      paths: BASELINE_FILES,
    }),
  };
  await mkdir(path.dirname(CONTRACT_OUTPUT), { recursive: true });
  await writeFile(CONTRACT_OUTPUT, `${JSON.stringify(contract, null, 2)}\n`);
  await writeFile(SNAPSHOT_OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(
    "Patterned Appearance v2: wrote frozen contract and pre-calibration snapshot\n",
  );
} else {
  process.stdout.write(
    `Patterned Appearance v2 contract: PASS${checkSnapshot ? "; calibration snapshot intact" : ""}\n`,
  );
}
