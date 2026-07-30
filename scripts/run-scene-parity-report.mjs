/**
 * Scene Parity Gate Stack report.
 *
 * Loads every frozen evidence family and the immutable Scene Quality Baseline,
 * evaluates the four independently blocking layers, and emits one
 * schema-versioned machine-readable report plus the matching human-review
 * artifact index.
 *
 * It reads only. It cannot change a threshold, the Scene Recipe, a generator,
 * the reference, or the candidate, and it exits non-zero when the candidate
 * fails — distinguishing that from an infrastructure or protocol failure.
 *
 *   node scripts/run-scene-parity-report.mjs
 *   node scripts/run-scene-parity-report.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { SCENE_GENERATOR_VERSION } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { evaluateSceneParityGateStack } from "../tools/acceptance/scene-parity-gates.mjs";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";
import { verifyScenePassProtocol } from "../tools/evaluation/scene-pass-protocol.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const REVIEW_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/review",
);
const BASELINE_PATH = path.join(
  PROJECT_ROOT,
  "tools/acceptance/baselines/scene-quality-baseline-v1.json",
);
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "scene-parity-report-v1.json");
const checkOnly = process.argv.includes("--check");

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function readEvidence(name) {
  return JSON.parse(await readFile(path.join(EVIDENCE_DIRECTORY, name), "utf8"));
}

export async function loadEvidence() {
  const [coverage, correspondence, geography, horizon, passes, observation] =
    await Promise.all([
      readEvidence("semantic-coverage-v1.json"),
      readEvidence("scene-correspondence-v1.json"),
      readEvidence("geography-evidence-v1.json"),
      readEvidence("horizon-evidence-v1.json"),
      readEvidence("scene-passes-v1.json"),
      readEvidence("reference-observation-v1.json"),
    ]);
  return {
    coverage,
    correspondence,
    geography,
    horizon,
    passes,
    observation,
    protocolFailures: verifyScenePassProtocol({
      report: passes,
      contract: createReferenceObservationContract(),
    }),
  };
}

export async function loadBaseline() {
  let raw;
  try {
    raw = await readFile(BASELINE_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "scene-quality-baseline-v1.json is not frozen yet; acceptance cannot invent thresholds",
      );
    }
    throw error;
  }
  return deepFreeze(JSON.parse(raw));
}

async function writeReviewIndex(report) {
  await mkdir(REVIEW_DIRECTORY, { recursive: true });
  let images = [];
  try {
    images = (await readdir(REVIEW_DIRECTORY)).filter((name) => name.endsWith(".png")).sort();
  } catch {
    images = [];
  }
  const cameras = [...new Set(images.map((name) => name.split(".")[0]))];
  const layerRows = Object.values(report.layers)
    .map((layer) => {
      const status = layer.evaluated ? (layer.passed ? "PASS" : "FAIL") : "NOT EVALUATED";
      const detail = layer.evaluated
        ? layer.metrics
            .map(
              (metric) =>
                `<tr class="${metric.passed ? "ok" : "bad"}"><td>${metric.name}</td><td>${metric.scope}</td><td>${
                  metric.value ?? "missing"
                }</td><td>${metric.direction === "atMost" ? "&le;" : "&ge;"} ${metric.threshold}</td></tr>`,
            )
            .join("")
        : `<tr class="bad"><td colspan="4">${layer.reason}</td></tr>`;
      return `<section><h2>${layer.layer} — ${status}</h2><table><thead><tr><th>metric</th><th>scope</th><th>measured</th><th>frozen limit</th></tr></thead><tbody>${detail}</tbody></table></section>`;
    })
    .join("\n");

  await writeFile(
    path.join(REVIEW_DIRECTORY, "parity.html"),
    `<!doctype html>
<meta charset="utf-8">
<title>Scene Parity Gate Stack — ${report.exitStatus}</title>
<style>
  body { font: 14px system-ui; background: #10161d; color: #e8eef5; margin: 24px; max-width: 1100px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  th, td { text-align: left; padding: 5px 9px; border-bottom: 1px solid #26313d; font-variant-numeric: tabular-nums; }
  .ok td { color: #9fe0b4; }
  .bad td { color: #ffb0ae; }
  h2 { font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; margin: 26px 0 8px; }
  .status { font-size: 20px; font-weight: 600; }
  a { color: #8fd0ff; }
</style>
<h1>Scene Parity Gate Stack</h1>
<p class="status">${report.exitStatus}</p>
<p>Baseline <code>${report.baselineVersion}</code> · recipe <code>${report.subject.recipeVersion}</code> · generator <code>${report.subject.generatorVersion}</code> · seed <code>${report.subject.sceneSeed}</code></p>
<p>Trend index ${report.trendIndex.value} — ${report.trendIndex.note}.</p>
${layerRows}
<h2>Six-camera comparison</h2>
<p><a href="./index.html">Open the contact sheet</a> (${cameras.length} cameras, ${images.length} images).</p>
`,
  );
  return { images: images.length, cameras: cameras.length };
}

async function main() {
  const evidence = await loadEvidence();
  const baseline = await loadBaseline();
  const stack = evaluateSceneParityGateStack({ evidence, baseline });

  const report = {
    ...stack,
    subject: {
      recipeVersion: ISLAND_SCENE_RECIPE.schemaVersion,
      generatorVersion: SCENE_GENERATOR_VERSION,
      rngVersion: ISLAND_SCENE_RECIPE.rngVersion,
      seedVersion: ISLAND_SCENE_RECIPE.seedVersion,
      sceneSeed: ISLAND_SCENE_RECIPE.sceneSeed,
      entities: ISLAND_SCENE_RECIPE.entities.length,
      populations: ISLAND_SCENE_RECIPE.populations.length,
      semanticLights: ISLAND_SCENE_RECIPE.semanticLights.length,
      terrainProgram: ISLAND_SCENE_RECIPE.terrain.version,
    },
    observation: {
      host: evidence.observation.host ?? evidence.observation.environment?.os,
      environment: evidence.observation.environment,
      capture: evidence.passes.capture,
    },
    evidenceVersions: Object.fromEntries(
      ["coverage", "correspondence", "geography", "horizon", "passes"].map((family) => [
        family,
        evidence[family].schemaVersion,
      ]),
    ),
  };

  const review = await writeReviewIndex(report);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    const frozen = await readFile(REPORT_PATH, "utf8");
    assert.equal(frozen, serialized, "the Scene Parity report drifted");
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  const layerStatus = Object.values(report.layers)
    .map(
      (layer) =>
        `${layer.layer}=${layer.evaluated ? (layer.passed ? "pass" : "fail") : "blocked"}`,
    )
    .join(" ");
  process.stdout.write(
    `Scene parity: ${report.exitStatus} · ${layerStatus} · review ${review.images} images\n`,
  );
  if (report.exitStatus !== "pass") {
    for (const layer of Object.values(report.layers)) {
      for (const failure of layer.failures ?? []) {
        process.stderr.write(`  ${layer.layer}: ${failure}\n`);
      }
    }
    for (const failure of report.infrastructure.failures) {
      process.stderr.write(`  infrastructure: ${failure}\n`);
    }
    // A failing candidate is a real, expected outcome during Foundation, and it
    // must still exit non-zero so no workflow can treat red as green.
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
