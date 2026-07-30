/**
 * Capture fixed scene passes and native appearance.
 *
 *   node scripts/run-scene-passes.mjs           # capture and record
 *   node scripts/run-scene-passes.mjs --check   # verify the recorded evidence
 *
 * Both subjects are hosted in one browser context so every pass is
 * pixel-aligned by construction, and both are rendered through the exact frozen
 * camera matrices at the Normative Scene Capture size.
 */

import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../tools/reference/frozen-observation-clock.mjs";
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
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "scene-passes-v1.json");
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

async function capture() {
  return runLocalSceneAutomation({
    label: "scene-passes",
    serverFlag: "--scene-passes",
    path: "/scene-passes.html",
    query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 900_000,
    port: 8500,
    probeExpression: `(() => {
      const passes = window.scenePasses;
      return {
        state: passes?.status === "error" ? "error" : null,
        status: passes?.status ?? null,
        statusText: passes?.error ?? null,
      };
    })()`,
    // The reference's renderer and composer are handed to the pass module so
    // the assembled scene is never re-uploaded into a second WebGL context and
    // the native capture goes through the authored post-processing chain.
    runtimeObjectAttachment: {
      whenState: { status: "awaiting-reference-renderer" },
      prototypeExpressions: [
        "window.__scenePassTypes.WebGLRenderer.prototype",
        "window.__scenePassTypes.EffectComposer.prototype",
      ],
      targetExpression: "window.scenePasses",
      functionDeclaration: `function (renderers, composers) {
        const renderer = Array.from(renderers).find(
          (candidate) => candidate.domElement === document.querySelector("canvas"),
        );
        const composer = Array.from(composers).find(
          (candidate) => candidate.renderer === renderer,
        );
        return this.attachReferenceRenderer({ renderer, composer });
      }`,
    },
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: "window.scenePasses.complete()",
    followUpExpression: "window.scenePasses.takePreviews()",
  });
}

async function writeReviewPackage(previews) {
  await rm(REVIEW_DIRECTORY, { recursive: true, force: true });
  await mkdir(REVIEW_DIRECTORY, { recursive: true });
  const cameras = Object.keys(previews);
  const files = [];
  for (const camera of cameras) {
    for (const [pass, dataUrl] of Object.entries(previews[camera])) {
      const name = `${camera}.${pass}.png`;
      await writeFile(
        path.join(REVIEW_DIRECTORY, name),
        Buffer.from(dataUrl.split(",")[1], "base64"),
      );
      files.push(name);
    }
  }
  const rows = cameras
    .map(
      (camera) => `<section><h2>${camera}</h2><div class="grid">${[
        "referenceLitRgb",
        "candidateLitRgb",
        "referenceSilhouette",
        "candidateSilhouette",
        "referenceSemantic",
        "candidateSemantic",
        "referenceWorldNormal",
        "candidateWorldNormal",
      ]
        .map(
          (pass) =>
            `<figure><img src="${camera}.${pass}.png" alt="${camera} ${pass}"><figcaption>${pass}</figcaption></figure>`,
        )
        .join("")}</div></section>`,
    )
    .join("\n");
  await writeFile(
    path.join(REVIEW_DIRECTORY, "index.html"),
    `<!doctype html>
<meta charset="utf-8">
<title>Scene Parity Foundation — Human Review Contact Sheet</title>
<style>
  body { font: 14px system-ui; background: #10161d; color: #e8eef5; margin: 24px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  figure { margin: 0; }
  img { width: 100%; image-rendering: pixelated; border: 1px solid #2a3440; }
  figcaption { font-size: 12px; opacity: 0.75; padding-top: 4px; }
  h2 { margin: 28px 0 10px; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; }
</style>
<h1>Six-camera comparison</h1>
<p>Reference and candidate side by side for every frozen camera and pass.</p>
${rows}
`,
  );
  return files.length;
}

async function main() {
  const run = await capture();
  assert.equal(run.state.status, "ready", run.state.error ?? "scene passes did not complete");

  const report = run.state.report;
  assert.equal(report.schemaVersion, "scene-pass-evidence-v1");
  assert.deepEqual(
    verifyScenePassProtocol({ report, contract }),
    [],
    "the scene pass protocol was violated",
  );

  const previewCount = run.followUp ? await writeReviewPackage(run.followUp) : 0;
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    const frozen = await readFile(REPORT_PATH, "utf8");
    assert.equal(frozen, serialized, "scene pass evidence drifted");
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  const { aggregate } = report;
  process.stdout.write(
    `Scene passes: ${report.protocol.length} cameras, ` +
      `${previewCount} review images; ` +
      `silhouette IoU mean ${aggregate.silhouetteIoU.mean} (worst ${aggregate.silhouetteIoU.worst.camera} ${aggregate.silhouetteIoU.worst.value}), ` +
      `contour p95 mean ${aggregate.contourDistance.meanP95}, ` +
      `depth p95 mean ${aggregate.depthWorldUnits.meanP95}, ` +
      `normal p95 mean ${aggregate.worldNormalDegrees.meanP95} deg, ` +
      `semantic agreement mean ${aggregate.semanticAgreement.mean}, ` +
      `appearance DeltaE mean ${aggregate.appearanceDeltaE.meanMean}\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
