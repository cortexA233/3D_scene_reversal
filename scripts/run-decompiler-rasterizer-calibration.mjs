import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateGeometryEvidence } from "../packages/mesh-to-code/src/measurement/index.mjs";
import {
  bakeToEvaluationSpace,
  CANONICAL_MAX_DIMENSION,
  createReferenceBufferCache,
  rasterizeCandidatesInParallel,
  rasterizeView,
  RESOLUTION_STAGES,
  scoreCandidateGeometry,
  stagePoses,
} from "../packages/mesh-to-code/src/rasterizer/index.mjs";
import {
  GEOMETRY_METRIC_PATHS,
  geometryThresholdsFor,
  getMetric,
} from "../tools/decompiler/baseline-thresholds.mjs";
import {
  boundsOf,
  buildReplacementGeometry,
  loadReferenceGeometry,
  REGRESSION_UNIT_IDS,
} from "../tools/decompiler/regression-corpus.mjs";

/**
 * Phase A: quantify CPU-rasterizer-versus-browser geometry divergence, declare a
 * per-metric tolerance, and publish measured wall-clock against a declared
 * budget.
 *
 * This closes the single largest risk in the Decompiler Program. If the CPU
 * rasterizer and the browser disagree by more than the fitting loop's
 * discrimination margin, the inner loop is optimising an unproven ruler and every
 * downstream result is suspect.
 *
 * The browser side is read from the frozen acceptance reports' per-view geometry
 * evidence. No browser runs here, nothing is recaptured, and no frozen report,
 * baseline, or gate is modified.
 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = path.join(PROJECT_ROOT, "gt_designer/single-mesh-evaluation/reports");
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/decompiler-rasterizer-divergence-v1.json",
);
const SCHEMA_VERSION = "decompiler-rasterizer-divergence-v1";

/** The acceptance report holding each unit's current accepted browser evidence. */
const ACCEPTANCE_REPORTS = Object.freeze({
  "stone-path": "stone-path-acceptance-v1.json",
  stone: "stone-acceptance-v3.json",
  "bamboo-shoot": "bamboo-shoot-acceptance-v2.json",
  "blue-hat": "blue-hat-acceptance-v2.json",
  vase: "vase-acceptance-v1.json",
  candle: "candle-acceptance-v3.json",
  mushroom: "mushroom-acceptance-v2.json",
  umbrella: "umbrella-acceptance-v4.json",
});

/**
 * The tolerance guard. The observed maximum is a single measurement on one
 * machine, so the frozen tolerance carries headroom for hardware and engine
 * variation rather than sitting exactly on what happened to be seen.
 */
const TOLERANCE_GUARD_FACTOR = 1.5;

/**
 * Declared before measuring, and derived rather than picked: the search shape is
 * K≈3 mutually dissimilar structure candidates over R≈3 rounds with a
 * per-candidate fitting iteration cap, so a unit costs roughly
 * 3 × 3 × 40 = 360 coarse-stage scored iterations plus a handful of final-stage
 * scores. A 150 ms coarse iteration puts that at 54 s, and a 2 s final score
 * puts three of them at 6 s, both comfortably inside a ten-minute per-unit
 * ceiling that leaves room for decomposition, baseline generation, and emission.
 *
 * Exceeding these is evidence for revisiting the backend. It is never grounds for
 * weakening a gate.
 */
const WALL_CLOCK_BUDGET = Object.freeze({
  coarseIterationMillisecondsMaximum: 150,
  finalScoreMillisecondsMaximum: 2000,
  perUnitMillisecondsMaximum: 600_000,
  derivation:
    "K=3 structure candidates x R=3 rounds x 40 fitting iterations = 360 coarse-stage scores per unit; 360 x 150 ms = 54 s, plus 3 final-stage scores at 2 s = 6 s, inside a 600 s per-unit ceiling.",
});

const COARSE_ITERATION_REPEATS = 5;

function parseArguments(args) {
  const options = { check: false, units: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") {
      options.check = true;
    } else if (args[index] === "--units" && args[index + 1]) {
      options.units = args[index + 1].split(",");
      index += 1;
    } else {
      throw new Error(
        "usage: node scripts/run-decompiler-rasterizer-calibration.mjs [--check] [--units a,b]",
      );
    }
  }
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bufferChecksums(buffers) {
  return {
    silhouette: sha256(buffers.silhouette),
    depth: sha256(buffers.depth),
    worldNormal: sha256(buffers.worldNormal),
  };
}

function roundUpToSignificant(value, digits = 3) {
  if (!(value > 0)) return 0;
  const magnitude = Math.floor(Math.log10(value));
  const scale = 10 ** (digits - 1 - magnitude);
  return Math.ceil(value * scale) / scale;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function bakeUnit({ reference, replacement }) {
  const { framing } = stagePoses({
    referenceWorldBounds: reference.worldBounds,
    stageId: "final",
  });
  const referenceGeometry = bakeToEvaluationSpace({
    positions: reference.positions,
    normals: reference.normals,
    indices: reference.indices,
    transform: framing.referenceTransform,
  });
  const replacementGeometry = bakeToEvaluationSpace({
    positions: replacement.positions,
    normals: replacement.normals,
    indices: replacement.indices,
    transform: framing.replacementTransform,
  });
  return {
    framing,
    referenceGeometry,
    replacementGeometry,
    referenceBounds: boundsOf(referenceGeometry.positions),
    replacementBounds: boundsOf(replacementGeometry.positions),
  };
}

async function measureUnit({ unitId }) {
  const reference = await loadReferenceGeometry(unitId);
  const replacement = buildReplacementGeometry(unitId);
  const baked = bakeUnit({ reference, replacement });

  const unitStart = performance.now();
  const referenceCache = createReferenceBufferCache({
    geometry: baked.referenceGeometry,
    referenceWorldBounds: reference.worldBounds,
  });

  // Warm the coarse stage once so the per-iteration measurement reflects a
  // fitting loop with the reference already cached, which is how it runs.
  referenceCache.buffersFor("coarse");
  const coarseDurations = [];
  for (let repeat = 0; repeat < COARSE_ITERATION_REPEATS; repeat += 1) {
    const start = performance.now();
    scoreCandidateGeometry({
      referenceCache,
      referenceBounds: baked.referenceBounds,
      candidateGeometry: baked.replacementGeometry,
      candidateBounds: baked.replacementBounds,
      stageId: "coarse",
      canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
    });
    coarseDurations.push(performance.now() - start);
  }

  const finalStart = performance.now();
  const scored = scoreCandidateGeometry({
    referenceCache,
    referenceBounds: baked.referenceBounds,
    candidateGeometry: baked.replacementGeometry,
    candidateBounds: baked.replacementBounds,
    stageId: "final",
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
  });
  const finalMilliseconds = performance.now() - finalStart;
  const unitMilliseconds = performance.now() - unitStart;

  // Byte stability, both across two runs and between the serial path and the
  // worker-thread path.
  const { poses } = stagePoses({
    referenceWorldBounds: reference.worldBounds,
    stageId: "coarse",
  });
  const serial = poses.map((pose) => ({
    viewId: pose.id,
    checksums: bufferChecksums(
      rasterizeView({
        positions: baked.replacementGeometry.positions,
        normals: baked.replacementGeometry.normals,
        indices: baked.replacementGeometry.indices,
        pose,
        width: 128,
        height: 128,
      }),
    ),
  }));
  const repeated = poses.map((pose) => ({
    viewId: pose.id,
    checksums: bufferChecksums(
      rasterizeView({
        positions: baked.replacementGeometry.positions,
        normals: baked.replacementGeometry.normals,
        indices: baked.replacementGeometry.indices,
        pose,
        width: 128,
        height: 128,
      }),
    ),
  }));
  const [parallel] = await rasterizeCandidatesInParallel({
    candidates: [{ candidateId: unitId, geometry: baked.replacementGeometry }],
    poses,
    size: 128,
  });
  const parallelChecksums = parallel.views.map((view) => ({
    viewId: view.viewId,
    checksums: bufferChecksums(view.buffers),
  }));

  return {
    reference,
    replacement,
    baked,
    scored,
    referenceCacheStats: referenceCache.stats,
    wallClock: {
      coarseIterationMillisecondsMean:
        coarseDurations.reduce((sum, value) => sum + value, 0) / coarseDurations.length,
      coarseIterationMillisecondsP95: percentile(coarseDurations, 0.95),
      coarseIterationRepeats: COARSE_ITERATION_REPEATS,
      finalScoreMilliseconds: finalMilliseconds,
      perUnitMilliseconds: unitMilliseconds,
    },
    byteStability: {
      serial,
      twoRunsIdentical:
        JSON.stringify(serial) === JSON.stringify(repeated),
      serialMatchesWorkerThreads:
        JSON.stringify(serial) === JSON.stringify(parallelChecksums),
    },
  };
}

async function buildReport(unitIds) {
  const environment = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    note: "Wall-clock is hardware-dependent and is published as measured evidence, not as a frozen value a check reproduces.",
  };

  const units = [];
  for (const unitId of unitIds) {
    const measured = await measureUnit({ unitId });
    const browserReport = JSON.parse(
      await readFile(path.join(REPORTS, ACCEPTANCE_REPORTS[unitId]), "utf8"),
    );
    const browserPerView = browserReport.visual.comparison.perView;
    const browserAggregate = aggregateGeometryEvidence(
      browserPerView.map((view) => ({ geometry: view.geometry })),
    );
    const thresholds = geometryThresholdsFor({
      objectId: unitId,
      qualityBaseline: browserReport.visual.qualityBaseline,
    });

    const perMetric = {};
    for (const metricPath of GEOMETRY_METRIC_PATHS) {
      const cpu = getMetric(measured.scored.aggregate, metricPath);
      const browser = getMetric(browserAggregate, metricPath);
      const threshold = thresholds.get(metricPath);
      const passesWithCpu =
        threshold.operator === ">=" ? cpu >= threshold.threshold : cpu <= threshold.threshold;
      const passesWithBrowser =
        threshold.operator === ">="
          ? browser >= threshold.threshold
          : browser <= threshold.threshold;
      perMetric[metricPath] = {
        cpu,
        browser,
        absoluteDivergence: Math.abs(cpu - browser),
        threshold: threshold.threshold,
        operator: threshold.operator,
        thresholdSource: threshold.source,
        acceptanceHeadroom: Math.abs(browser - threshold.threshold),
        cpuVerdictMatchesBrowserVerdict: passesWithCpu === passesWithBrowser,
      };
    }

    const perViewMaxDivergence = {};
    for (const metricPath of GEOMETRY_METRIC_PATHS) {
      const viewPath = metricPath.replace(/^geometry\./, "");
      let maximum = 0;
      let atView = null;
      measured.scored.views.forEach((cpuView, index) => {
        const cpuValue = getMetric(cpuView.geometry, viewPath);
        const browserValue = getMetric(browserPerView[index].geometry, viewPath);
        if (!Number.isFinite(cpuValue) || !Number.isFinite(browserValue)) return;
        const divergence = Math.abs(cpuValue - browserValue);
        if (divergence > maximum) {
          maximum = divergence;
          atView = browserPerView[index].viewId;
        }
      });
      perViewMaxDivergence[metricPath] = { maximum, atView };
    }

    units.push({
      unitId,
      label: measured.replacement.label,
      referenceTriangleCount: measured.reference.indices.length / 3,
      referenceNormalSource: measured.reference.normalSource,
      replacementTriangleCount: measured.replacement.triangleCount,
      replacementDrawCallCount: measured.replacement.drawCallCount,
      rootPositionDiscardedByFrame: measured.replacement.rootPositionDiscardedByFrame,
      discardedRootPosition: measured.replacement.discardedRootPosition,
      browserEvidence: ACCEPTANCE_REPORTS[unitId],
      geometryBaselineSource: thresholds.get("geometry.silhouette.meanIou").source,
      perMetric,
      perViewMaxDivergence,
      wallClock: measured.wallClock,
      referenceCache: measured.referenceCacheStats,
      byteStability: {
        twoRunsIdentical: measured.byteStability.twoRunsIdentical,
        serialMatchesWorkerThreads: measured.byteStability.serialMatchesWorkerThreads,
        coarseStageChecksums: measured.byteStability.serial,
      },
    });
    process.stdout.write(
      `  · ${unitId.padEnd(13)} silhouette meanIou cpu ${perMetric["geometry.silhouette.meanIou"].cpu.toFixed(5)} vs browser ${perMetric["geometry.silhouette.meanIou"].browser.toFixed(5)}  (${measured.wallClock.coarseIterationMillisecondsMean.toFixed(1)} ms/coarse iteration)\n`,
    );
  }

  const divergenceTolerance = {};
  const discriminationMargin = {};
  const verdict = { perMetric: {}, toleranceBelowMargin: true };

  for (const metricPath of GEOMETRY_METRIC_PATHS) {
    let observedMaximum = 0;
    let observedAtUnit = null;
    let margin = Infinity;
    let marginAtUnit = null;
    for (const unit of units) {
      const record = unit.perMetric[metricPath];
      if (record.absoluteDivergence > observedMaximum) {
        observedMaximum = record.absoluteDivergence;
        observedAtUnit = unit.unitId;
      }
      if (record.acceptanceHeadroom < margin) {
        margin = record.acceptanceHeadroom;
        marginAtUnit = unit.unitId;
      }
    }
    const tolerance = roundUpToSignificant(observedMaximum * TOLERANCE_GUARD_FACTOR);
    divergenceTolerance[metricPath] = {
      frozenTolerance: tolerance,
      observedMaximumDivergence: observedMaximum,
      observedAtUnit,
      guardFactor: TOLERANCE_GUARD_FACTOR,
      rule: "observed maximum absolute divergence across the eight regression units, times the guard factor, rounded up to three significant digits",
    };
    discriminationMargin[metricPath] = {
      margin,
      atUnit: marginAtUnit,
      definition:
        "the smallest distance, across the eight units, between an accepted candidate's browser-measured aggregate and the hard threshold it was accepted under; a divergence larger than this could flip an accepted verdict",
    };
    const below = tolerance < margin;
    verdict.perMetric[metricPath] = {
      toleranceBelowMargin: below,
      tolerance,
      margin,
      ratio: margin === 0 ? null : tolerance / margin,
    };
    if (!below) verdict.toleranceBelowMargin = false;
  }

  const wallClock = {
    declaredBudget: WALL_CLOCK_BUDGET,
    measured: {
      coarseIterationMillisecondsMaximum: Math.max(
        ...units.map((unit) => unit.wallClock.coarseIterationMillisecondsMean),
      ),
      coarseIterationMillisecondsMaximumAtUnit: units.reduce((worst, unit) =>
        unit.wallClock.coarseIterationMillisecondsMean >
        worst.wallClock.coarseIterationMillisecondsMean
          ? unit
          : worst,
      ).unitId,
      finalScoreMillisecondsMaximum: Math.max(
        ...units.map((unit) => unit.wallClock.finalScoreMilliseconds),
      ),
      perUnitMillisecondsMaximum: Math.max(
        ...units.map((unit) => unit.wallClock.perUnitMilliseconds),
      ),
    },
  };
  wallClock.withinBudget = {
    coarseIteration:
      wallClock.measured.coarseIterationMillisecondsMaximum <=
      WALL_CLOCK_BUDGET.coarseIterationMillisecondsMaximum,
    finalScore:
      wallClock.measured.finalScoreMillisecondsMaximum <=
      WALL_CLOCK_BUDGET.finalScoreMillisecondsMaximum,
    perUnit:
      wallClock.measured.perUnitMillisecondsMaximum <=
      WALL_CLOCK_BUDGET.perUnitMillisecondsMaximum,
  };
  wallClock.overBudgetFactor = {
    coarseIteration:
      wallClock.measured.coarseIterationMillisecondsMaximum /
      WALL_CLOCK_BUDGET.coarseIterationMillisecondsMaximum,
    finalScore:
      wallClock.measured.finalScoreMillisecondsMaximum /
      WALL_CLOCK_BUDGET.finalScoreMillisecondsMaximum,
    perUnit:
      wallClock.measured.perUnitMillisecondsMaximum /
      WALL_CLOCK_BUDGET.perUnitMillisecondsMaximum,
  };
  wallClock.policy =
    "Exceeding the declared budget is backend evidence, reported as measured. It never weakens a gate, a threshold, or a tier.";

  verdict.byteStability = {
    twoRunsIdentical: units.every((unit) => unit.byteStability.twoRunsIdentical),
    serialMatchesWorkerThreads: units.every(
      (unit) => unit.byteStability.serialMatchesWorkerThreads,
    ),
  };
  verdict.cpuVerdictMatchesBrowserVerdictEverywhere = units.every((unit) =>
    GEOMETRY_METRIC_PATHS.every(
      (metricPath) => unit.perMetric[metricPath].cpuVerdictMatchesBrowserVerdict,
    ),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    artifactRole: "development-only-phase-a-calibration",
    productionUse: "prohibited",
    program: "Decompiler Program",
    phase: "Phase A",
    purpose:
      "Quantify CPU-rasterizer-versus-browser geometry divergence, freeze a per-metric tolerance, and publish measured wall-clock against a declared budget.",
    rasterizer: {
      backend: "pure-javascript-cpu",
      nativeDependencies: 0,
      passes: ["silhouette", "linear-depth", "world-normal"],
      captureSize: 512,
      viewCount: 12,
      matchedConventions: [
        "every pass material is THREE.DoubleSide, so nothing is culled and back faces flip their normal",
        "captures read from a WebGLRenderTarget with no samples option, so they are not multisampled",
        "depth carries -viewPosition.z, the view-space distance, clamped to [0,1] over (far-near)",
        "world normals use normalize(mat3(modelMatrix) * normal), not the inverse transpose",
        "framing is derived from the Authored Reference bounds alone and never reframed from the replacement",
      ],
      progressiveResolution: RESOLUTION_STAGES.map((stage) => ({
        id: stage.id,
        size: stage.size,
        viewCount: stage.viewIds.length,
        purpose: stage.purpose,
      })),
    },
    browserEvidenceSource: {
      kind: "frozen acceptance reports, read only",
      field: "visual.comparison.perView",
      reports: ACCEPTANCE_REPORTS,
      note: "No browser was run and no capture was retaken. No frozen report, baseline, or gate was modified.",
    },
    environment,
    units,
    divergenceTolerance,
    discriminationMargin,
    wallClock,
    verdict,
    checkPolicy:
      "--check recomputes the divergence, the tolerances, and the margins and requires them to match the frozen values exactly. Wall-clock is re-measured and compared against the declared budget rather than against the frozen measurement, because a frozen wall-clock number would drift with hardware.",
  };
}

function deterministicSlice(report) {
  return {
    schemaVersion: report.schemaVersion,
    rasterizer: report.rasterizer,
    browserEvidenceSource: report.browserEvidenceSource,
    units: report.units.map((unit) => ({
      unitId: unit.unitId,
      referenceTriangleCount: unit.referenceTriangleCount,
      replacementTriangleCount: unit.replacementTriangleCount,
      rootPositionDiscardedByFrame: unit.rootPositionDiscardedByFrame,
      perMetric: unit.perMetric,
      perViewMaxDivergence: unit.perViewMaxDivergence,
      byteStability: unit.byteStability,
    })),
    divergenceTolerance: report.divergenceTolerance,
    discriminationMargin: report.discriminationMargin,
    verdict: {
      perMetric: report.verdict.perMetric,
      toleranceBelowMargin: report.verdict.toleranceBelowMargin,
      byteStability: report.verdict.byteStability,
      cpuVerdictMatchesBrowserVerdictEverywhere:
        report.verdict.cpuVerdictMatchesBrowserVerdictEverywhere,
    },
  };
}

function summarize(report) {
  const lines = [];
  for (const metricPath of GEOMETRY_METRIC_PATHS) {
    const tolerance = report.divergenceTolerance[metricPath];
    const margin = report.discriminationMargin[metricPath];
    const verdict = report.verdict.perMetric[metricPath];
    lines.push(
      `  ${verdict.toleranceBelowMargin ? "ok  " : "FAIL"} ${metricPath.replace("geometry.", "").padEnd(34)} ` +
        `divergence ${tolerance.observedMaximumDivergence.toExponential(3)}  ` +
        `tolerance ${tolerance.frozenTolerance.toExponential(3)}  ` +
        `margin ${margin.margin.toExponential(3)}  ` +
        `ratio ${verdict.ratio === null ? "n/a" : verdict.ratio.toFixed(4)}`,
    );
  }
  lines.push(
    `  wall-clock: coarse iteration ${report.wallClock.measured.coarseIterationMillisecondsMaximum.toFixed(1)} ms ` +
      `(budget ${report.wallClock.declaredBudget.coarseIterationMillisecondsMaximum} ms, factor ${report.wallClock.overBudgetFactor.coarseIteration.toFixed(2)}x); ` +
      `final score ${report.wallClock.measured.finalScoreMillisecondsMaximum.toFixed(0)} ms ` +
      `(budget ${report.wallClock.declaredBudget.finalScoreMillisecondsMaximum} ms, factor ${report.wallClock.overBudgetFactor.finalScore.toFixed(2)}x)`,
  );
  return lines.join("\n");
}

const options = parseArguments(process.argv.slice(2));
const unitIds = options.units ?? REGRESSION_UNIT_IDS;

process.stdout.write(`Decompiler Program Phase A rasterizer calibration (${unitIds.length} units)\n`);
const report = await buildReport(unitIds);
process.stdout.write(`${summarize(report)}\n`);

const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (options.check) {
  const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
  const frozenSlice = JSON.stringify(deterministicSlice(frozen));
  const currentSlice = JSON.stringify(deterministicSlice(report));
  if (frozenSlice !== currentSlice) {
    process.stderr.write(
      "rasterizer divergence: FAIL — the recomputed divergence, tolerances, or margins differ from the frozen report\n",
    );
    process.exitCode = 1;
  } else if (!report.verdict.toleranceBelowMargin) {
    process.stderr.write(
      "rasterizer divergence: FAIL — a frozen tolerance is not below its discrimination margin\n",
    );
    process.exitCode = 1;
  } else if (!report.verdict.byteStability.twoRunsIdentical) {
    process.stderr.write("rasterizer divergence: FAIL — output is not byte-stable across two runs\n");
    process.exitCode = 1;
  } else {
    const overBudget = Object.entries(report.wallClock.withinBudget)
      .filter(([, within]) => !within)
      .map(([name]) => `${name} (${report.wallClock.overBudgetFactor[name].toFixed(2)}x)`);
    process.stdout.write(
      `rasterizer divergence: PASS (${GEOMETRY_METRIC_PATHS.length} metrics within tolerance, tolerance below margin)` +
        (overBudget.length > 0
          ? `; wall-clock over declared budget: ${overBudget.join(", ")} — backend evidence, no gate weakened\n`
          : "; wall-clock within declared budget\n"),
    );
  }
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, serialized);
  process.stdout.write(
    `rasterizer divergence: wrote ${path.relative(PROJECT_ROOT, OUTPUT)}\n`,
  );
}
