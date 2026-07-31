import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const VENDOR_ROOT = path.join(
  PROJECT_ROOT,
  "packages/mesh-to-code/src/measurement/vendor",
);

/**
 * The Decompiler Program package owns byte-identical copies of the generic
 * measurement modules so the fitting loop and the terminal acceptance gates score
 * with one ruler. This check is what makes that duplication safe.
 *
 * The repository originals cannot change — `tools/evaluation/visual-metrics.mjs`
 * is a frozen baseline entry in two calibration contracts, and those contracts
 * also assert their files are git-clean. So drift can only originate in the
 * package copy, and this check catches it before it lands.
 *
 * Every vendored file is compared two ways where possible: against the current
 * repository original, and against the `sha256` recorded in a frozen contract
 * manifest. The second comparison matters because it binds the package copy to
 * the hash the certification was issued under, not merely to whatever the working
 * tree holds today.
 */
const FROZEN_MANIFESTS = [
  "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
  "gt_designer/single-mesh-evaluation/baselines/umbrella-v3-approved-candidate-freeze.json",
  "gt_designer/single-mesh-evaluation/baselines/bamboo-shoot-v2-approved-candidate-freeze.json",
  "gt_designer/single-mesh-evaluation/baselines/mushroom-v2-approved-candidate-freeze.json",
  "gt_designer/single-mesh-evaluation/baselines/blue-hat-v2-approved-candidate-freeze.json",
  "gt_designer/single-mesh-evaluation/baselines/candle-v3-approved-candidate-freeze.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function walk(directory, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else if (entry.name.endsWith(".mjs")) {
      results.push(full);
    }
  }
  return results;
}

async function readFrozenHashes() {
  const hashes = new Map();
  for (const relative of FROZEN_MANIFESTS) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(PROJECT_ROOT, relative), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const group of ["candidateFiles", "evidenceFiles", "baselineFiles"]) {
      for (const entry of manifest[group] ?? []) {
        const existing = hashes.get(entry.path);
        if (existing && existing.sha256 !== entry.sha256) {
          throw new Error(
            `frozen manifests disagree about ${entry.path}: ${existing.sha256} and ${entry.sha256}`,
          );
        }
        hashes.set(entry.path, {
          sha256: entry.sha256,
          byteLength: entry.byteLength,
          manifests: [...(existing?.manifests ?? []), relative],
        });
      }
    }
  }
  return hashes;
}

const vendored = (await walk(VENDOR_ROOT)).sort();
if (vendored.length === 0) {
  process.stderr.write("measurement drift: FAIL\n  × the vendor directory holds no module\n");
  process.exitCode = 1;
} else {
  const frozen = await readFrozenHashes();
  const failures = [];
  const rows = [];

  for (const copy of vendored) {
    const originalRelative = path
      .relative(VENDOR_ROOT, copy)
      .split(path.sep)
      .join("/");
    const original = path.join(PROJECT_ROOT, originalRelative);

    let originalBytes;
    try {
      originalBytes = await readFile(original);
    } catch (error) {
      if (error.code === "ENOENT") {
        failures.push(
          `${originalRelative}: the package carries a copy of a module that no longer exists in the repository`,
        );
        continue;
      }
      throw error;
    }
    const copyBytes = await readFile(copy);
    const originalHash = sha256(originalBytes);
    const copyHash = sha256(copyBytes);
    const frozenEntry = frozen.get(originalRelative);

    if (originalHash !== copyHash) {
      failures.push(
        `${originalRelative}: package copy has drifted\n      repository ${originalHash} (${originalBytes.byteLength} bytes)\n      package    ${copyHash} (${copyBytes.byteLength} bytes)`,
      );
    }
    if (frozenEntry && frozenEntry.sha256 !== copyHash) {
      failures.push(
        `${originalRelative}: package copy does not match the hash frozen in ${frozenEntry.manifests.join(", ")}\n      frozen  ${frozenEntry.sha256}\n      package ${copyHash}`,
      );
    }

    rows.push({
      path: originalRelative,
      sha256: copyHash,
      byteLength: copyBytes.byteLength,
      frozenIn: frozenEntry ? frozenEntry.manifests.length : 0,
    });
  }

  for (const row of rows) {
    process.stdout.write(
      `  · ${row.path}  ${row.sha256.slice(0, 16)}…  ${row.byteLength} bytes  ` +
        `${row.frozenIn > 0 ? `frozen in ${row.frozenIn} contract manifest(s)` : "not in a frozen contract"}\n`,
    );
  }

  if (failures.length > 0) {
    process.stderr.write("measurement drift: FAIL\n");
    for (const failure of failures) process.stderr.write(`  × ${failure}\n`);
    process.stderr.write(
      "\n  The repository originals are frozen, so drift originates in the package copy.\n" +
        "  Restore byte-identity; do not edit the original and do not re-freeze a contract.\n" +
        "  A metric that genuinely needs to change belongs in a new module beside the copy.\n",
    );
    process.exitCode = 1;
  } else {
    const frozenCount = rows.filter((row) => row.frozenIn > 0).length;
    process.stdout.write(
      `measurement drift: PASS (${rows.length} vendored modules byte-identical; ` +
        `${frozenCount} also match their frozen contract hash)\n`,
    );
  }
}
