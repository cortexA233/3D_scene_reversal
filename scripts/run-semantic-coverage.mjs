/**
 * Measure and classify the Assembled Authored Scene.
 *
 *   node scripts/run-semantic-coverage.mjs           # measure and record
 *   node scripts/run-semantic-coverage.mjs --check   # verify the frozen manifest
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  buildSemanticCoverageManifest,
  coverageFailures,
} from "../tools/reconstruction/semantic-coverage.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/semantic-coverage-v1.json",
);
/**
 * Development-only raw measurement of the Assembled Authored Scene. It is the
 * shared input for coverage, recipe construction, and later geometry evidence,
 * and it never reaches the Production Runtime.
 */
const INVENTORY_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json",
);
/**
 * Bounded reference surface samples, kept separate from the inventory because
 * they are the one dense development artifact in the evidence set.
 */
const SAMPLES_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-surface-samples-v1.json",
);
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

async function observe() {
  return runLocalSceneAutomation({
    label: "scene-inventory",
    serverFlag: "--scene-inventory",
    path: "/scene-inventory.html",
    query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 300_000,
    port: 8490,
    probeExpression: `(() => {
      const inventory = window.sceneInventory;
      return {
        state: inventory?.status === "error" ? "error" : null,
        status: inventory?.status ?? null,
        statusText: inventory?.error ?? null,
      };
    })()`,
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: "window.sceneInventory.complete()",
  });
}

function stableManifest(manifest) {
  const result = structuredClone(manifest);
  // Per-item rows stay in the run report; the frozen artifact keeps the
  // classification summary plus every unclassified item, which is what blocks.
  delete result.classified;
  return result;
}

async function main() {
  const run = await observe();
  assert.equal(run.state.status, "ready", run.state.error ?? "inventory did not complete");
  assert.equal(
    run.state.immutability.unchanged,
    true,
    "measuring the Assembled Authored Scene changed it",
  );
  const { samples, ...inventory } = run.state.report;
  assert.equal(inventory.schemaVersion, "scene-inventory-v1");
  if (!checkOnly) {
    await mkdir(path.dirname(INVENTORY_PATH), { recursive: true });
    await Promise.all([
      writeFile(INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}
`),
      writeFile(
        SAMPLES_PATH,
        `${JSON.stringify({ schemaVersion: "scene-surface-samples-v1", samples })}
`,
      ),
    ]);
  }

  const manifest = buildSemanticCoverageManifest(inventory, ISLAND_SCENE_RECIPE);
  const failures = coverageFailures(manifest);
  const serialized = `${JSON.stringify(stableManifest(manifest), null, 2)}\n`;

  if (checkOnly) {
    let frozen;
    try {
      frozen = await readFile(MANIFEST_PATH, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        assert.fail(
          "semantic-coverage-v1.json is not frozen; run node scripts/run-semantic-coverage.mjs",
        );
      }
      throw error;
    }
    assert.equal(frozen, serialized, "the Semantic Coverage Manifest drifted");
  } else {
    await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await writeFile(MANIFEST_PATH, serialized);
  }

  process.stdout.write(
    `Semantic coverage: ${inventory.totals.renderables} renderables, ` +
      `${inventory.totals.lights} lights, ` +
      `count ${(manifest.coverage.countFraction * 100).toFixed(2)}%, ` +
      `area ${(manifest.coverage.areaFraction * 100).toFixed(2)}%, ` +
      `pixels ${(manifest.coverage.pixelFraction * 100).toFixed(2)}%\n`,
  );
  if (failures.length > 0) {
    process.stderr.write(`Semantic coverage FAILED:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Semantic coverage: complete, no visible unclassified content\n");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
