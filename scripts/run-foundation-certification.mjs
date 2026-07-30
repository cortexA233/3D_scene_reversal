/**
 * Certify Scene Parity Foundation and record the red baseline.
 *
 * Runs the complete workflow against the real candidate and separates two
 * questions that must never be confused: does the measuring foundation work,
 * and does the current island pass. The expected answer is yes and no.
 *
 *   node scripts/run-foundation-certification.mjs
 *   node scripts/run-foundation-certification.mjs --check
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  SCENE_GENERATOR_VERSION,
  generateScene,
} from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { evaluateSceneParityGateStack } from "../tools/acceptance/scene-parity-gates.mjs";
import { buildProductionBundle } from "../tools/acceptance/production-build.mjs";
import { auditProductionGraph } from "../tools/acceptance/static-audit.mjs";
import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { loadBaseline, loadEvidence } from "./run-scene-parity-report.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const REPORT_PATH = path.join(
  EVIDENCE_DIRECTORY,
  "foundation-certification-v1.json",
);
const ENTRYPOINT = "gt_designer/island-replacement/island-replacement.js";
const checkOnly = process.argv.includes("--check");

/**
 * Everything the delivered island is allowed to consist of. The isolated audit
 * copies exactly these files and nothing else, so a forgotten dependency on the
 * reference shows up as a failed load rather than as a silent pass.
 */
const PRODUCTION_FILES = [
  "gt_designer/island-replacement/index.html",
  "gt_designer/island-replacement/island-replacement.js",
  "gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js",
  "gt_designer/src/reconstruction/scene/environment-postprocessing.js",
  "gt_designer/src/reconstruction/scene/scene-generator.js",
  "gt_designer/src/reconstruction/scene/scene-recipe-contract.js",
  "gt_designer/src/reconstruction/scene/scene-seed.js",
  "gt_designer/src/reconstruction/scene/scene-object-generators.js",
  "gt_designer/src/reconstruction/scene/terrain-generator.js",
  "gt_designer/src/reconstruction/scene/terrain-program.js",
  "gt_designer/src/reconstruction/scene/material-families.js",
  "gt_designer/src/reconstruction/core/rng.js",
];

function geometrySignature(object) {
  object.updateMatrixWorld(true);
  const hash = createHash("sha256");
  object.traverse((child) => {
    if (!child.isMesh) return;
    hash.update(child.userData.semanticPart ?? "");
    hash.update(new Float32Array(child.matrixWorld.elements));
    hash.update(child.geometry.attributes.position.array);
  });
  return hash.digest("hex");
}

function sceneSignature(generated) {
  const rows = [];
  for (const [semanticId, record] of [...generated.semanticIndex.entries()].sort()) {
    if (!record.object?.isObject3D) continue;
    const bounds = new THREE.Box3().setFromObject(record.object);
    rows.push([
      semanticId,
      record.kind,
      record.group ?? "",
      JSON.stringify(record.seeds ?? null),
      bounds.min.toArray().map((v) => v.toFixed(6)).join(","),
      bounds.max.toArray().map((v) => v.toFixed(6)).join(","),
      geometrySignature(record.object),
    ].join("|"));
  }
  return {
    semanticIdCount: generated.semanticIndex.size,
    digest: createHash("sha256").update(rows.join("\n")).digest("hex"),
  };
}

/**
 * Builds and runs the island with the Authored Reference, its data, and every
 * development tool absent from the served root and from the import graph.
 */
async function isolatedProductionRun() {
  const bundle = await buildProductionBundle({
    entryPoint: ENTRYPOINT,
    projectRoot: PROJECT_ROOT,
  });
  const audit = await auditProductionGraph({
    projectRoot: PROJECT_ROOT,
    metafile: bundle.metafile,
  });
  assert.deepEqual(audit.failures, [], "the static production audit rejected the island runtime");

  const inputs = Object.keys(bundle.metafile.inputs)
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.startsWith("node_modules/"))
    .sort();
  assert.deepEqual(
    inputs,
    PRODUCTION_FILES.filter((file) => file.endsWith(".js")).sort(),
    "the production import graph is not the declared file set",
  );
  const thirdParty = Object.keys(bundle.metafile.inputs).filter((file) =>
    file.startsWith("node_modules/"),
  );
  assert.deepEqual(
    thirdParty.filter((file) => !file.startsWith("node_modules/three/")),
    [],
    "an unapproved production dependency reached the runtime",
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "island-production-audit-"));
  try {
    for (const file of PRODUCTION_FILES) {
      const target = path.join(root, path.relative("gt_designer", file));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(PROJECT_ROOT, file), target);
    }
    // The isolated package's entry is its own index, pointing at the same
    // module by a root-relative path.
    const entryHtml = await readFile(
      path.join(root, "island-replacement/index.html"),
      "utf8",
    );
    await writeFile(
      path.join(root, "index.html"),
      entryHtml.replace(
        './island-replacement.js',
        './island-replacement/island-replacement.js',
      ),
    );

    const run = await runLocalSceneAutomation({
      label: "island-production-audit",
      serverFlag: null,
      serverArguments: ["--production-audit-root", root, "--local-three"],
      path: "/",
      query: "?dpr=1",
      readyState: { state: "ready", referenceIndependent: true },
      port: 8520,
      timeoutMs: 300_000,
      viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
      blockExternalNetwork: true,
      probeExpression: `(() => ({
        state: document.body?.dataset?.state ?? null,
        referenceIndependent: document.body?.dataset?.referenceIndependent === "true",
        entityCount: window.islandReplacement?.entityCount ?? null,
        semanticIdCount: window.islandReplacement?.semanticIdCount ?? null,
        triangles: window.islandReplacement?.triangles ?? null,
        drawCalls: window.islandReplacement?.drawCalls ?? null,
        generationMs: window.islandReplacement?.generationMs ?? null,
        error: window.islandReplacement?.error ?? null
      }))()`,
    });

    assert.equal(run.state.entityCount, ISLAND_SCENE_RECIPE.entities.length);
    assert.deepEqual(run.externalRequests, [], "the isolated island reached the network");
    const requested = run.requests
      .map((url) => new URL(url).pathname)
      .filter((pathname) => pathname !== "/favicon.ico");
    for (const pathname of requested) {
      assert.ok(
        pathname.endsWith(".js") || pathname === "/",
        `the isolated island requested a non-code resource: ${pathname}`,
      );
    }
    return {
      served: PRODUCTION_FILES.length,
      requests: requested.length,
      externalRequests: 0,
      bundleBytes: bundle.bytes,
      bundleGzipBytes: bundle.gzipBytes,
      thirdPartyInputs: thirdParty.length,
      triangles: run.state.triangles,
      drawCalls: run.state.drawCalls,
      generationMs: run.state.generationMs,
      auditPassed: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** The largest remaining discrepancies, ranked for the next milestone. */
function rankResiduals(evidence) {
  const rows = [];
  const push = (area, detail, magnitude) =>
    rows.push({ area, detail, magnitude: Number(magnitude.toFixed(6)) });

  const passes = evidence.passes.aggregate;
  push(
    "fixed-camera silhouette",
    `worst group ${passes.groupSilhouetteIoU.worst.label} on ${passes.groupSilhouetteIoU.worst.camera} at IoU ${passes.groupSilhouetteIoU.worst.value}`,
    1 - passes.groupSilhouetteIoU.mean,
  );
  push(
    "object surfaces",
    `symmetric distance p95 mean ${evidence.correspondence.surface.p95.mean}, worst entity ${evidence.correspondence.surface.p95.max}`,
    evidence.correspondence.surface.p95.mean,
  );
  push(
    "semantic structure",
    `mean component delta ${evidence.correspondence.semanticStructure.componentDelta.mean}, ${evidence.correspondence.semanticStructure.entitiesMissingComponents} entities missing parts`,
    evidence.correspondence.semanticStructure.componentDelta.mean,
  );
  push(
    "terrain elevation",
    `height p95 ${evidence.geography.height.full.p95}, shore ${evidence.geography.height.shore.p95}`,
    evidence.geography.height.full.p95,
  );
  push(
    "skyline",
    `profile p95 ${evidence.horizon.profile.angularError.p95} rad, worst azimuth ${evidence.horizon.profile.angularError.max}`,
    evidence.horizon.profile.angularError.p95 * 100,
  );
  push(
    "native appearance",
    `mean DeltaE ${passes.appearanceDeltaE.meanMean}, worst camera ${passes.appearanceDeltaE.worst.camera} at ${passes.appearanceDeltaE.worst.value}`,
    passes.appearanceDeltaE.meanMean,
  );
  push(
    "distributed cover",
    `worst group IoU ${passes.groupSilhouetteIoU.worst.value}, cover populations still mostly unaligned`,
    1,
  );
  return rows.sort((a, b) => b.magnitude - a.magnitude);
}

async function main() {
  const evidence = await loadEvidence();
  const baseline = await loadBaseline();

  // ── Determinism ──────────────────────────────────────────────────────────
  const first = sceneSignature(generateScene(ISLAND_SCENE_RECIPE));
  const second = sceneSignature(generateScene(ISLAND_SCENE_RECIPE));
  assert.deepEqual(second, first, "repeated generation is not deterministic");

  // ── Production isolation ─────────────────────────────────────────────────
  const isolation = await isolatedProductionRun();

  // ── Frozen gate stack against the real candidate ─────────────────────────
  const stack = evaluateSceneParityGateStack({ evidence, baseline });
  assert.equal(
    stack.infrastructure.passed,
    true,
    `the measuring foundation itself failed:\n- ${stack.infrastructure.failures.join("\n- ")}`,
  );
  // The Foundation is certified by an honest red candidate, never by a green
  // one it was not built to produce.
  assert.equal(
    stack.candidate.passed,
    false,
    "the candidate unexpectedly passed; Foundation certification records an honest red baseline and cannot rubber-stamp a green one it did not verify",
  );
  assert.equal(stack.exitStatus, "candidate-failure");

  // The candidate evaluation command must itself fail.
  let candidateCommandExit = 0;
  try {
    execFileSync(
      process.execPath,
      [path.join(PROJECT_ROOT, "scripts/run-scene-parity-report.mjs"), "--check"],
      { cwd: PROJECT_ROOT, stdio: "pipe" },
    );
  } catch (error) {
    candidateCommandExit = error.status ?? 1;
  }
  assert.equal(
    candidateCommandExit,
    1,
    "the candidate evaluation command must exit non-zero while the gates are red",
  );

  const report = {
    schemaVersion: "scene-parity-foundation-certification-v1",
    foundation: {
      passed: true,
      note: "The measuring foundation is complete and self-consistent. This result is independent of the candidate's quality, which is red and recorded below.",
      evidenceFamilies: Object.fromEntries(
        ["coverage", "correspondence", "geography", "horizon", "passes"].map((family) => [
          family,
          evidence[family].schemaVersion,
        ]),
      ),
      determinism: {
        repeatedGenerations: 2,
        semanticIdCount: first.semanticIdCount,
        sceneDigest: first.digest,
        identical: true,
      },
      productionIsolation: isolation,
      candidateCommandExitStatus: candidateCommandExit,
    },
    candidate: {
      passed: false,
      exitStatus: stack.exitStatus,
      failedLayers: stack.candidate.failedLayers,
      layers: Object.fromEntries(
        Object.entries(stack.layers).map(([name, layer]) => [
          name,
          {
            evaluated: layer.evaluated,
            passed: layer.passed,
            failures: layer.failures ?? [],
            reason: layer.reason ?? null,
          },
        ]),
      ),
    },
    redBaseline: {
      layout: {
        entities: evidence.correspondence.structural.referenceEntities,
        anchorErrorMax: evidence.correspondence.placement.anchorError.max,
        extentRelativeMax: evidence.correspondence.placement.extentRelative.max,
        orientationErrorMax: evidence.correspondence.placement.orientationError.max,
        zoneDeltaMax: evidence.correspondence.zones.delta.max,
        overlapRankErrorMax: evidence.correspondence.overlapOrdering.rankError.max,
      },
      surface: evidence.correspondence.surface.p95,
      surfaceWorstEntities: evidence.correspondence.surface.worstP95,
      semanticStructure: evidence.correspondence.semanticStructure,
      geography: {
        height: evidence.geography.height,
        coastline: {
          symmetricP95: evidence.geography.coastline.symmetricDistance.p95,
          areaRelativeError: evidence.geography.coastline.areaRelativeError,
        },
        classification: evidence.geography.classification.agreementFraction,
      },
      horizon: {
        groups: evidence.horizon.groups.reference,
        profileP95: evidence.horizon.profile.angularError.p95,
        worstAzimuths: evidence.horizon.profile.worstAzimuths,
        worstSilhouette: evidence.horizon.groups.worstSilhouette,
      },
      fixedCamera: evidence.passes.aggregate,
      appearanceByRegion: Object.fromEntries(
        Object.entries(
          evidence.passes.views.find((view) => view.camera === "authoredOverview").appearance
            .regions,
        ).map(([region, statistics]) => [region, statistics.mean]),
      ),
    },
    nextMilestoneResiduals: rankResiduals(evidence),
    environment: {
      branch: "experiment/claude-full-island-scene",
      recipeVersion: ISLAND_SCENE_RECIPE.schemaVersion,
      generatorVersion: SCENE_GENERATOR_VERSION,
      rngVersion: ISLAND_SCENE_RECIPE.rngVersion,
      seedVersion: ISLAND_SCENE_RECIPE.seedVersion,
      sceneSeed: ISLAND_SCENE_RECIPE.sceneSeed,
      terrainProgram: ISLAND_SCENE_RECIPE.terrain.version,
      baselineVersion: baseline.version,
      observationHost: evidence.observation.host ?? null,
      gpu: evidence.observation.environment.gpu,
      browser: evidence.observation.environment.browser.userAgentData,
      threeRevision: evidence.observation.environment.threeRevision,
      capture: evidence.passes.capture,
    },
    humanReviewPackage: {
      contactSheet: ".scratch/scene-parity-foundation/review/index.html",
      gateSummary: ".scratch/scene-parity-foundation/review/parity.html",
      cameras: evidence.passes.views.map((view) => view.camera),
      note: "Human Parity Review runs only after the automated stack passes. It cannot waive a failed gate.",
    },
    deferred: [
      "Native Firefox and Safari GPU scene gates: neither browser is installed on this normative host, so they are a real blocker rather than a passed check.",
      // Read from the stack rather than written down. An uncalibrated layer is a
      // real deferral and has to be listed, but a sentence saying so outlives the
      // condition it describes: this list still claimed the two rendered layers
      // were uncalibrated after ADR-0051 froze them.
      ...Object.entries(stack.layers)
        .filter(([, layer]) => /no frozen thresholds/.test(layer.reason ?? ""))
        .map(
          ([name]) =>
            `${name} has no calibrated thresholds, so it cannot pass and is reported as not evaluated.`,
        ),
    ],
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    assert.equal(
      await readFile(REPORT_PATH, "utf8"),
      serialized,
      "the Foundation certification report drifted",
    );
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  process.stdout.write(
    `Scene Parity Foundation: foundation=PASS candidate=RED (${stack.candidate.failedLayers.join(", ")})\n` +
      `  determinism: ${first.semanticIdCount} semantic IDs, identical across repeated generation\n` +
      `  isolation: ${isolation.served} production files, ${isolation.requests} local code requests, ` +
      `${isolation.externalRequests} external, ${isolation.bundleGzipBytes} B gzip\n` +
      `  top residual: ${report.nextMilestoneResiduals[0].area} — ${report.nextMilestoneResiduals[0].detail}\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
