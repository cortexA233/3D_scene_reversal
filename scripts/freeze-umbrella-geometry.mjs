import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { umbrellaGeometryFreezeEvidence } from "../tools/evaluation/umbrella-geometry-freeze.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/umbrella-geometry-freeze-v1.json",
);
const argumentsList = process.argv.slice(2);
const check = argumentsList.includes("--check");
if (argumentsList.some((argument) => argument !== "--check")) {
  throw new Error("usage: node scripts/freeze-umbrella-geometry.mjs [--check]");
}

const evidence = umbrellaGeometryFreezeEvidence();
if (check) {
  const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
  if (JSON.stringify(frozen) !== JSON.stringify(evidence)) {
    throw new Error("Umbrella geometry or semantic structure drifted from its freeze");
  }
  process.stdout.write(
    `Umbrella geometry freeze: PASS (${evidence.drawBatchCount} batches, ${evidence.meshes.reduce((sum, mesh) => sum + mesh.geometry.triangleCount, 0)} triangles)\n`,
  );
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(
    `Umbrella geometry freeze: wrote ${path.relative(PROJECT_ROOT, OUTPUT)}\n`,
  );
}
