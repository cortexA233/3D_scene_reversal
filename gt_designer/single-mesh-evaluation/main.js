import { createEvaluationHarness } from "./evaluation-harness.js";
import {
  createEvaluationManifest,
  EVALUATION_PASSES,
  EVALUATION_VIEWS,
} from "./evaluation-protocol.js";
import { loadAuthoredReference } from "./reference-loader.js";

const elements = {
  canvas: document.querySelector("#preview"),
  state: document.querySelector("#state"),
  mode: document.querySelector("#mode"),
  pass: document.querySelector("#pass"),
  view: document.querySelector("#view"),
  capture: document.querySelector("#capture-all"),
  download: document.querySelector("#download-manifest"),
  summary: document.querySelector("#summary"),
};

const state = {
  ready: false,
  error: null,
  unitId: "stone-path",
  manifest: null,
  harness: null,
  calibrationReport: null,
  stoneV2CalibrationRun: null,
  patternedAppearanceV2CalibrationRun: null,
  objectEvaluationReport: null,
};
window.singleMeshEvaluation = state;
const parameters = new URLSearchParams(window.location.search);
state.unitId = parameters.get("unit") ?? "stone-path";

const previewModes = [
  ["reference", "Reference"],
  ["replacement", "Replacement"],
  ["overlay", "Overlay"],
  ["difference", "Difference"],
  ["pass-preview", "Pass preview · split"],
];

function addOptions(select, options) {
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

addOptions(elements.mode, previewModes);
addOptions(
  elements.pass,
  EVALUATION_PASSES.map((pass) => [pass.id, pass.label]),
);
addOptions(
  elements.view,
  EVALUATION_VIEWS.map((view) => [
    view.id,
    `${view.id} · elev ${view.elevationDegrees}° · az ${view.azimuthDegrees}°`,
  ]),
);
elements.mode.value = "overlay";
elements.pass.value = "neutral-rgb";
elements.view.value = "low-045";

function selectedPreview() {
  state.harness.preview({
    viewId: elements.view.value,
    passId: elements.pass.value,
    mode: elements.mode.value,
  });
}

function setSummary(manifest) {
  elements.summary.textContent = [
    `Unit: ${manifest.unitId}`,
    `Views: ${manifest.views.length}`,
    `Passes: ${manifest.passes.length}`,
    `Captures: ${manifest.captures.length}`,
    `Replacement reframed: ${manifest.framing.replacementTransform.independentlyFramed}`,
  ].join("\n");
}

async function captureAll() {
  elements.capture.disabled = true;
  elements.state.textContent = "Capturing 12 views × 7 passes × 2 targets…";
  document.body.dataset.state = "capturing";
  try {
    state.manifest = await state.harness.captureAll();
    document.body.dataset.captureCount = String(state.manifest.captures.length);
    document.body.dataset.state = "ready";
    elements.state.textContent = "Protocol capture complete";
    elements.download.disabled = false;
    setSummary(state.manifest);
    selectedPreview();
    return state.manifest;
  } finally {
    elements.capture.disabled = false;
  }
}

function downloadManifest() {
  const blob = new Blob([`${JSON.stringify(state.manifest, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.unitId}-evaluation-manifest.json`;
  link.click();
  URL.revokeObjectURL(url);
}

for (const select of [elements.mode, elements.pass, elements.view]) {
  select.addEventListener("change", selectedPreview);
}
elements.capture.addEventListener("click", () => captureAll().catch(showError));
elements.download.addEventListener("click", downloadManifest);

function showError(error) {
  state.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.state = "error";
  elements.state.textContent = state.error;
  console.error(error);
}

async function initialize() {
  if (parameters.get("calibrate") === "patterned-appearance-v2") {
    for (const control of [
      elements.mode,
      elements.pass,
      elements.view,
      elements.capture,
      elements.download,
    ]) {
      control.disabled = true;
    }
    const runIndex = Number(parameters.get("run"));
    if (!Number.isInteger(runIndex) || runIndex < 1) {
      throw new Error(
        "Patterned appearance v2 calibration requires a positive run index",
      );
    }
    document.body.dataset.state = "patterned-appearance-v2-calibrating";
    const { runPatternedAppearanceV2ReferenceCalibration } = await import(
      "./patterned-appearance-v2-calibration-runner.js"
    );
    state.patternedAppearanceV2CalibrationRun =
      await runPatternedAppearanceV2ReferenceCalibration({
        canvas: elements.canvas,
        runIndex,
        onProgress(message) {
          elements.state.textContent = message;
          elements.summary.textContent =
            `Patterned Appearance Baseline v2\n${message}`;
        },
      });
    state.ready = true;
    document.body.dataset.state = "patterned-appearance-v2-calibrated";
    document.body.dataset.calibrationRun = String(runIndex);
    elements.state.textContent =
      "Patterned appearance v2 reference calibration run complete";
    elements.summary.textContent = [
      `Run: ${runIndex}`,
      `Scenarios: ${state.patternedAppearanceV2CalibrationRun.scenarios.length}`,
      "Candidate imports: prohibited",
    ].join("\n");
    return;
  }
  if (parameters.get("calibrate") === "stone-v2") {
    for (const control of [
      elements.mode,
      elements.pass,
      elements.view,
      elements.capture,
      elements.download,
    ]) {
      control.disabled = true;
    }
    const runIndex = Number(parameters.get("run"));
    if (!Number.isInteger(runIndex) || runIndex < 1) {
      throw new Error("Stone v2 calibration requires a positive run index");
    }
    document.body.dataset.state = "stone-v2-calibrating";
    const { runStoneGeometryV2ReferenceCalibration } = await import(
      "./stone-v2-calibration-runner.js"
    );
    state.stoneV2CalibrationRun =
      await runStoneGeometryV2ReferenceCalibration({
        canvas: elements.canvas,
        runIndex,
        onProgress(message) {
          elements.state.textContent = message;
          elements.summary.textContent = `Stone Geometry Baseline v2\n${message}`;
        },
      });
    state.ready = true;
    document.body.dataset.state = "stone-v2-calibrated";
    document.body.dataset.calibrationRun = String(runIndex);
    elements.state.textContent = "Stone v2 reference calibration run complete";
    elements.summary.textContent = [
      `Run: ${runIndex}`,
      `Scenarios: ${state.stoneV2CalibrationRun.scenarios.length}`,
      "Candidate imports: prohibited",
    ].join("\n");
    return;
  }
  if (parameters.get("calibrate") === "all") {
    for (const control of [
      elements.mode,
      elements.pass,
      elements.view,
      elements.capture,
      elements.download,
    ]) {
      control.disabled = true;
    }
    document.body.dataset.state = "calibrating";
    const { runQualityCalibration } = await import("./calibration-runner.js");
    state.calibrationReport = await runQualityCalibration({
      canvas: elements.canvas,
      onProgress(message) {
        elements.state.textContent = message;
        elements.summary.textContent = "Stage 1 Quality Baseline calibration\n" + message;
      },
    });
    state.ready = true;
    document.body.dataset.state = "calibrated";
    document.body.dataset.calibrationObjectCount = String(
      state.calibrationReport.objects.length,
    );
    elements.state.textContent = "Quality Baseline calibration complete";
    elements.summary.textContent = [
      `Schema: ${state.calibrationReport.schemaVersion}`,
      `Objects: ${state.calibrationReport.objects.length}`,
      `Perturbations: ${state.calibrationReport.objects.reduce(
        (sum, object) => sum + object.perturbations.length,
        0,
      )}`,
      `Corrections used: ${state.calibrationReport.calibrationPolicy.correctionsUsed}`,
    ].join("\n");
    return;
  }
  if (parameters.get("evaluate") === "object") {
    for (const control of [
      elements.mode,
      elements.pass,
      elements.view,
      elements.capture,
      elements.download,
    ]) {
      control.disabled = true;
    }
    document.body.dataset.state = "evaluating";
    const { runObjectEvaluation } = await import("./calibration-runner.js");
    const geometryBaselineId = parameters.get("geometry-baseline");
    const appearanceBaselineId = parameters.get("appearance-baseline");
    let geometryBaseline = null;
    let appearanceBaseline = null;
    if (geometryBaselineId && appearanceBaselineId) {
      throw new Error("geometry and appearance category baselines are exclusive");
    }
    if (geometryBaselineId) {
      if (geometryBaselineId !== "stone-v2" || state.unitId !== "stone") {
        throw new Error("unsupported category geometry baseline request");
      }
      const response = await fetch(
        "./baselines/stone-geometry-baseline-v2.json",
      );
      if (!response.ok) {
        throw new Error("Stone Geometry Baseline v2 could not be loaded");
      }
      geometryBaseline = await response.json();
    }
    if (appearanceBaselineId) {
      if (
        appearanceBaselineId !== "patterned-v2" ||
        state.unitId !== "umbrella"
      ) {
        throw new Error("unsupported category appearance baseline request");
      }
      const response = await fetch(
        "./baselines/patterned-appearance-baseline-v2.json",
      );
      if (!response.ok) {
        throw new Error("Patterned Appearance Baseline v2 could not be loaded");
      }
      appearanceBaseline = await response.json();
    }
    state.objectEvaluationReport = await runObjectEvaluation({
      canvas: elements.canvas,
      objectId: state.unitId,
      geometryBaseline,
      appearanceBaseline,
      onProgress(message) {
        elements.state.textContent = message;
        elements.summary.textContent = `Object acceptance\n${message}`;
      },
    });
    state.ready = true;
    document.body.dataset.state = "evaluated";
    document.body.dataset.objectId = state.unitId;
    elements.state.textContent = state.objectEvaluationReport.comparison.gate.passed
      ? "Object visual acceptance passed"
      : "Object visual acceptance failed";
    elements.summary.textContent = JSON.stringify(
      {
        objectId: state.unitId,
        passed: state.objectEvaluationReport.comparison.gate.passed,
        failures: state.objectEvaluationReport.comparison.gate.failures,
      },
      null,
      2,
    );
    return;
  }
  const [{ generateObject }, { getObjectDefinition }] = await Promise.all([
    import("../src/reconstruction/core/object-generator.js"),
    import("../src/reconstruction/objects/object-registry.js"),
  ]);
  const reference = await loadAuthoredReference(state.unitId);
  const replacementDefinition = getObjectDefinition(
    parameters.get("replacement") ?? "probe",
  );
  const replacement = generateObject(
    replacementDefinition.recipe,
    replacementDefinition.generator,
  );
  const manifest = createEvaluationManifest(
    state.unitId,
    reference.worldBounds,
  );
  state.manifest = manifest;
  state.harness = createEvaluationHarness({
    canvas: elements.canvas,
    referenceRoot: reference.root,
    replacementRoot: replacement,
    manifest,
  });
  state.capture = (request) => state.harness.capture(request);
  state.captureAll = captureAll;
  state.ready = true;
  document.body.dataset.state = "ready";
  document.body.dataset.captureCount = "0";
  elements.state.textContent =
    "Reference-framed protocol ready · replacement not independently reframed";
  setSummary(manifest);
  selectedPreview();

  if (parameters.get("capture") === "all") {
    await captureAll();
  }
}

try {
  await initialize();
} catch (error) {
  showError(error);
}
