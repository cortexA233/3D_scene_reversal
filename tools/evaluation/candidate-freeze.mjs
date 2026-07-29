import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function describeFrozenFiles({ projectRoot, paths }) {
  return Promise.all(
    [...paths].sort().map(async (relativePath) => {
      const bytes = await readFile(path.join(projectRoot, relativePath));
      return {
        path: relativePath,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
      };
    }),
  );
}

export async function verifyCandidateFreeze({ projectRoot, manifest }) {
  const failures = [];
  for (const group of ["candidateFiles", "evidenceFiles", "baselineFiles"]) {
    const current = await describeFrozenFiles({
      projectRoot,
      paths: (manifest[group] ?? []).map((entry) => entry.path),
    });
    const expected = manifest[group] ?? [];
    current.forEach((entry, index) => {
      if (
        entry.byteLength !== expected[index]?.byteLength ||
        entry.sha256 !== expected[index]?.sha256
      ) {
        failures.push({ group, path: entry.path, expected: expected[index], actual: entry });
      }
    });
  }
  return { passed: failures.length === 0, failures };
}
