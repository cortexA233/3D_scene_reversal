import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { findAssetDependencies } from "./asset-freedom.mjs";

/**
 * Contract constraints hard-block emission. Quality constraints never do — they
 * set the Reconstruction Tier. This module owns only the five hard ones:
 * asset dependency, non-determinism, unexecutable code, global complexity
 * ceiling exceeded, and multi-scale material inconsistency.
 *
 * A constraint that this build cannot yet measure is reported
 * `not-applicable` with a reason. It is never reported `pass`.
 */
export const CONTRACT_CONSTRAINTS = Object.freeze([
  "asset-dependency",
  "determinism",
  "executability",
  "global-complexity-ceiling",
  "multi-scale-material-consistency",
]);

function geometryHash(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part.semanticId);
    hash.update(Buffer.from(Float32Array.from(part.positions).buffer));
    hash.update(Buffer.from(Uint32Array.from(part.indices).buffer));
  }
  return hash.digest("hex");
}

export async function runContractAudit({
  modules,
  generatorFile,
  globalCeiling = null,
  multiScaleMaterial = null,
  scalarAudit = null,
}) {
  const constraints = [];

  const assetFindings = Object.entries(modules).flatMap(([name, source]) =>
    findAssetDependencies(source).map((finding) => ({ module: name, ...finding })),
  );
  constraints.push({
    id: "asset-dependency",
    status: assetFindings.length === 0 ? "pass" : "fail",
    detail:
      assetFindings.length === 0
        ? "no asset load, no bare module import, no encoded blob"
        : assetFindings.map((finding) => `${finding.module}: ${finding.id}`).join("; "),
    measured: { findings: assetFindings },
  });

  let firstHash = null;
  let secondHash = null;
  let executabilityDetail = null;
  let parts = null;
  try {
    const moduleUrl = pathToFileURL(generatorFile).href;
    const loaded = await import(moduleUrl);
    if (typeof loaded.buildParts !== "function") {
      throw new TypeError("emitted generator does not export buildParts");
    }
    parts = loaded.buildParts();
    firstHash = geometryHash(parts);
    // A second import under a distinct specifier forces a fresh module
    // instance, so module-level state cannot hide non-determinism.
    const reloaded = await import(`${moduleUrl}?determinism-probe=1`);
    secondHash = geometryHash(reloaded.buildParts());
  } catch (error) {
    executabilityDetail = error instanceof Error ? error.message : String(error);
  }

  constraints.push({
    id: "executability",
    status: executabilityDetail === null ? "pass" : "fail",
    detail: executabilityDetail ?? "emitted generator imported and produced parts",
    measured: {
      partCount: parts?.length ?? null,
      triangleCount:
        parts === null
          ? null
          : parts.reduce((sum, part) => sum + part.indices.length / 3, 0),
    },
  });

  constraints.push({
    id: "determinism",
    status:
      executabilityDetail !== null
        ? "not-applicable"
        : firstHash === secondHash
          ? "pass"
          : "fail",
    detail:
      executabilityDetail !== null
        ? "not evaluated because the emitted generator did not execute"
        : firstHash === secondHash
          ? "two fresh module instances produced identical geometry"
          : "two fresh module instances produced different geometry",
    measured: { firstGeometrySha256: firstHash, secondGeometrySha256: secondHash },
  });

  constraints.push(
    globalCeiling === null
      ? {
          id: "global-complexity-ceiling",
          status: "not-applicable",
          detail: "no global ceiling supplied to this run",
          measured: null,
        }
      : {
          id: "global-complexity-ceiling",
          status: globalCeiling.withinCeiling ? "pass" : "fail",
          detail: globalCeiling.detail ?? null,
          measured: globalCeiling.measured ?? null,
        },
  );

  constraints.push(
    multiScaleMaterial === null
      ? {
          id: "multi-scale-material-consistency",
          status: "not-applicable",
          detail:
            "no procedural appearance program was emitted, so there is nothing for a sampled-appearance check to catch",
          measured: null,
        }
      : {
          id: "multi-scale-material-consistency",
          status: multiScaleMaterial.consistent ? "pass" : "fail",
          detail: multiScaleMaterial.detail ?? null,
          measured: multiScaleMaterial.measured ?? null,
        },
  );

  if (scalarAudit !== null) {
    constraints.push({
      id: "object-specific-scalar-audit",
      status: scalarAudit.withinBudget ? "pass" : "fail",
      detail: scalarAudit.detail ?? null,
      measured: scalarAudit.measured ?? null,
    });
  }

  const hardFailures = constraints.filter(
    (constraint) =>
      constraint.status === "fail" && CONTRACT_CONSTRAINTS.includes(constraint.id),
  );

  return {
    passed: hardFailures.length === 0,
    constraints,
    geometrySha256: firstHash,
    parts,
    hardFailures: hardFailures.map((constraint) => constraint.id),
  };
}
