import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  budgetFor,
  measureReferenceComplexity,
} from "../packages/mesh-to-code/src/budget/index.mjs";
import {
  freezeBaseline,
  runCalibrationBracket,
  satisfies,
} from "../packages/mesh-to-code/src/baseline/index.mjs";
import { createMesh } from "../packages/mesh-to-code/src/geometry/mesh.mjs";
import { aggregateGeometryEvidence } from "../packages/mesh-to-code/src/measurement/index.mjs";
import {
  GEOMETRY_METRIC_PATHS,
  geometryThresholdsFor,
  getMetric,
} from "../tools/decompiler/baseline-thresholds.mjs";
import {
  loadReferenceGeometry,
  REGRESSION_UNIT_IDS,
} from "../tools/decompiler/regression-corpus.mjs";

/**
 * Phase A: generate each unit's acceptance baseline from the reference alone and
 * compare the automatic verdicts against the eight frozen hand-written baselines.
 *
 * Metric eligibility is a computed verdict rather than a human call: a metric that
 * cannot separate declared mild perturbations from declared destructive controls
 * becomes diagnostic instead of being loosened. The bracket runs reference-only —
 * no candidate is present while a threshold is being decided.
 *
 * Every divergence from a frozen baseline is explained here. None is tuned away:
 * this script never adjusts a ladder, a guard fraction, or a threshold to make a
 * comparison look better.
 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = path.join(PROJECT_ROOT, "gt_designer/single-mesh-evaluation/reports");
const OUTPUT = path.join(REPORTS, "decompiler-automatic-baseline-v1.json");
const BUDGET_REPORT = path.join(REPORTS, "decompiler-budget-formula-v1.json");
const SCHEMA_VERSION = "decompiler-automatic-baseline-v1";

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

function parseArguments(args) {
  const options = { check: false, stage: "final" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") options.check = true;
    else if (args[index] === "--stage" && args[index + 1]) {
      options.stage = args[index + 1];
      index += 1;
    } else {
      throw new Error(
        "usage: node scripts/run-decompiler-baseline-calibration.mjs [--check] [--stage coarse|fine|final]",
      );
    }
  }
  return options;
}

/**
 * Classify and explain one divergence between the automatic verdict and the
 * frozen baseline. Every branch says what the numbers mean; none suggests a
 * change to the automatic rule.
 */
function explainDivergence({ metricPath, automatic, frozen, acceptedValue }) {
  if (automatic.eligibility === "diagnostic") {
    return {
      kind: "automatic-diagnostic-frozen-hard",
      explanation:
        `The frozen baseline gates on ${metricPath}; the bracket makes it diagnostic because ${automatic.reason}. ` +
        "The Calibration Bracket rule is that a metric which cannot separate mild from destructive is demoted rather than loosened, so this is the rule working, not a miscalibration. The consequence is a weaker automatic gate on this unit than the hand-written one, which is the price of deriving eligibility mechanically.",
    };
  }

  const automaticPasses = satisfies({
    value: acceptedValue,
    operator: automatic.direction,
    threshold: automatic.threshold,
  });
  const stricter =
    automatic.direction === ">="
      ? automatic.threshold > frozen.threshold
      : automatic.threshold < frozen.threshold;

  if (!automaticPasses) {
    return {
      kind: "automatic-would-reject-accepted-candidate",
      explanation:
        `The automatic threshold ${automatic.direction} ${automatic.threshold} rejects the accepted candidate's measured ${acceptedValue}. ` +
        "The bracket derives this from reference-only evidence, so it is a statement about what a reference-derived rule demands, not about the candidate's quality. It means the automatic baseline is not a drop-in replacement for this unit's frozen baseline, and it is left standing: no threshold is relaxed to accommodate a candidate.",
    };
  }

  return {
    kind: stricter ? "automatic-stricter" : "automatic-looser",
    explanation: stricter
      ? `The automatic threshold ${automatic.direction} ${automatic.threshold} is stricter than the frozen ${frozen.operator} ${frozen.threshold}, because the bracket's mild envelope on this reference is tighter than the hand-set value. The accepted candidate still passes.`
      : `The automatic threshold ${automatic.direction} ${automatic.threshold} is looser than the frozen ${frozen.operator} ${frozen.threshold}, because the destructive boundary on this reference sits further from the mild envelope than the hand-set value assumed. The accepted candidate passes both.`,
  };
}

async function buildReport({ stageId }) {
  const budgetReport = JSON.parse(await readFile(BUDGET_REPORT, "utf8"));
  const units = [];

  for (const unitId of REGRESSION_UNIT_IDS) {
    const reference = await loadReferenceGeometry(unitId);
    const mesh = createMesh({
      positions: reference.positions,
      indices: reference.indices,
      name: unitId,
    });

    const bracket = runCalibrationBracket({ mesh, stageId });
    const complexity = measureReferenceComplexity({
      mesh,
      materialRoleCount: reference.materialCount,
    });
    const applied = budgetFor(complexity);
    const budgetUnit = budgetReport.units.find((entry) => entry.unitId === unitId);

    const baseline = freezeBaseline({
      unitId,
      version: `${unitId}-automatic-geometry-baseline-v1`,
      bracket,
      budget: applied.budget,
      reachabilityBound: budgetUnit?.reachabilityBound ?? null,
    });

    const acceptance = JSON.parse(
      await readFile(path.join(REPORTS, ACCEPTANCE_REPORTS[unitId]), "utf8"),
    );
    const acceptedAggregate = aggregateGeometryEvidence(
      acceptance.visual.comparison.perView.map((view) => ({ geometry: view.geometry })),
    );
    const frozenThresholds = geometryThresholdsFor({
      objectId: unitId,
      qualityBaseline: acceptance.visual.qualityBaseline,
    });

    const comparison = {};
    for (const metricPath of GEOMETRY_METRIC_PATHS) {
      const automatic = baseline.record.metrics[metricPath];
      const frozen = frozenThresholds.get(metricPath);
      const acceptedValue = getMetric(acceptedAggregate, metricPath);
      const frozenPasses = satisfies({
        value: acceptedValue,
        operator: frozen.operator,
        threshold: frozen.threshold,
      });
      const automaticPasses =
        automatic.eligibility === "hard"
          ? satisfies({
              value: acceptedValue,
              operator: automatic.direction,
              threshold: automatic.threshold,
            })
          : null;
      const agrees =
        automatic.eligibility === "hard" && automaticPasses === frozenPasses;

      comparison[metricPath] = {
        automaticEligibility: automatic.eligibility,
        automaticThreshold: automatic.threshold,
        automaticReason: automatic.reason,
        mildEnvelope: automatic.mildEnvelope,
        destructiveBoundary: automatic.destructiveBoundary,
        identityValue: automatic.identityValue,
        frozenOperator: frozen.operator,
        frozenThreshold: frozen.threshold,
        frozenSource: frozen.source,
        acceptedCandidateValue: acceptedValue,
        acceptedCandidatePassesFrozen: frozenPasses,
        acceptedCandidatePassesAutomatic: automaticPasses,
        verdictsAgree: agrees,
        divergence: agrees
          ? null
          : explainDivergence({ metricPath, automatic, frozen, acceptedValue }),
        reachability: automatic.reachability,
      };
    }

    const hardCount = Object.values(comparison).filter(
      (entry) => entry.automaticEligibility === "hard",
    ).length;
    units.push({
      unitId,
      label: reference.label,
      baselineVersion: baseline.record.version,
      baselineHash: baseline.baselineHash,
      calibratedBeforeFitting: baseline.record.calibratedBeforeFitting,
      candidateInformed: baseline.record.candidateInformed,
      fittingStarted: baseline.fittingStarted,
      budget: applied.budget,
      hardMetricCount: hardCount,
      diagnosticMetricCount: GEOMETRY_METRIC_PATHS.length - hardCount,
      controls: bracket.controls,
      appearanceDomain: bracket.appearanceDomain,
      comparison,
    });

    process.stdout.write(
      `  · ${unitId.padEnd(13)} ${hardCount}/8 hard  ` +
        `${Object.values(comparison).filter((entry) => entry.divergence !== null).length} divergence(s) from the frozen baseline\n`,
    );
  }

  const divergences = units.flatMap((unit) =>
    Object.entries(unit.comparison)
      .filter(([, entry]) => entry.divergence !== null)
      .map(([metricPath, entry]) => ({
        unitId: unit.unitId,
        metricPath,
        kind: entry.divergence.kind,
        explanation: entry.divergence.explanation,
      })),
  );
  const byKind = {};
  for (const divergence of divergences) {
    byKind[divergence.kind] = (byKind[divergence.kind] ?? 0) + 1;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    artifactRole: "development-only-phase-a-calibration",
    productionUse: "prohibited",
    program: "Decompiler Program",
    phase: "Phase A",
    purpose:
      "Generate each unit's acceptance baseline from the reference alone, compute metric eligibility mechanically, and compare the automatic verdicts against the eight frozen hand-written baselines.",
    bracket: {
      stageId,
      candidatePresent: false,
      manifestVersion: units[0]?.controls ? "decompiler-generic-perturbation-manifest-v1" : null,
      manifestGeneration: "from the mesh alone; no per-object manifest is authored",
      mildLadders:
        "uniform scale at 0.5% and 1%, pivot shift at 0.4% and 0.8% of the longest dimension, and rotation about y and x at 1 and 2.5 degrees",
      destructiveControls:
        "uniform scale at +/-5%, anisotropic x at 110%, squash y at 80%, pivot shift at 10%, component deletion, family reduction, structural collapse to the bounding box, radial quantization to six segments, appearance flattening, and palette corruption",
      responsibilityRule:
        "a mild control must be tolerated by every geometry metric; a destructive control is judged only against the metrics it names as responsible for rejecting it. Pooling controls per metric group was tried and was wrong: uniform scaling leaves the bottom anchor untouched and a pivot shift leaves every extent untouched, so each bounds metric is blind to one control by construction, and pooling made every bounds and depth metric look non-separable for a reason that was an artefact of the pooling.",
      eligibilityRule:
        "mild-pass plus destructive-fail makes a metric hard; inability to separate makes it diagnostic. A metric is never loosened until both pass.",
      guardFraction: 0.25,
      appearanceDomainNote:
        "appearance controls are generated so the manifest is complete, and name no geometry metric because they leave geometry untouched. No appearance metric is declared hard or diagnostic here: the L1 stack scores geometry only.",
    },
    structuralEnforcement: {
      mechanism:
        "a fitting entry point takes a frozen-baseline handle, the handle can only be produced by freezeBaseline, and its identity is checked against a module-private registry so a caller cannot fabricate one",
      plainObjectAccepted: false,
      frozenBaselineDeeplyImmutable: true,
      looseningAfterFittingPossible: false,
      note: "there is no overload accepting a plain object and no flag that skips the check, so calibrate-before-fitting is not a convention that review has to catch",
    },
    reachabilityCombination: {
      source: "decompiler-budget-formula-v1.json",
      rule:
        "a Budget Proxy bound that fails an automatic threshold is recorded as a signal that the budget formula or the Operator Library is inadequate; the threshold is not relaxed",
    },
    finding: {
      headline:
        "An automatic reference-only Calibration Bracket produces geometry thresholds that four of the eight already-accepted candidates cannot meet, and demotes 21 of 64 metric slots to diagnostic.",
      mechanism:
        "The bracket calibrates the interval between a barely-perturbed reference and a damaged reference. A compact Procedural Replacement is not inside that interval: Stone's accepted candidate scores mean silhouette IoU 0.89308 while the best destructive control on that metric scores 0.92440, so the candidate is further from the reference than the declared damage is. Mushroom is the same shape of result at 0.83110 against 0.86222. The frozen human-anchored thresholds for those units sit far looser at 0.84470 and 0.82000 precisely because a human supplied the reachability estimate a reference cannot.",
      relationToTheBudgetProxy:
        "The Budget Proxy exists to supply that reachability estimate without a human. On this corpus it cannot: every unit's triangle budget already holds its whole reference, so the proxy is the reference, its bound is perfect, and it relaxes nothing. The mitigation is implemented and does not bite here.",
      diagnosticDemotions:
        "The 21 demotions are genuine non-separability, not a threshold that needs loosening. On a many-component reference a two-and-a-half-degree rotation can cost more silhouette agreement than deleting a component does, so the mild envelope and the destructive boundary overlap and the rule demotes the metric rather than widening it.",
      whatThisDoesAndDoesNotBlock:
        "Phase B's exit is measured under each unit's existing frozen baseline version, not under this automatic baseline, so this does not block it. What it bears on is Phase C and any new unit: an automatic reference-only baseline will be unreachably strict for a compact reconstruction unless the Budget Proxy binds, which means the reachability side of the automatic acceptance story is the open problem rather than the eligibility side.",
      notTunedAway:
        "No ladder rung, guard fraction, or threshold was adjusted in response to this. Loosening a reference-derived threshold to admit a candidate is the exact move the calibrate-before-fitting rule exists to prevent.",
    },
    units,
    divergenceSummary: {
      total: divergences.length,
      byKind,
      divergences,
      policy:
        "every divergence is explained and none is tuned away. No ladder, guard fraction, or threshold was adjusted to improve a comparison.",
    },
    verdict: {
      everyBaselineCalibratedBeforeFitting: units.every(
        (unit) => unit.calibratedBeforeFitting && unit.fittingStarted === false,
      ),
      noBaselineIsCandidateInformed: units.every((unit) => unit.candidateInformed === false),
      unitsWithAnAutomaticRejectionOfAnAcceptedCandidate: divergences
        .filter((entry) => entry.kind === "automatic-would-reject-accepted-candidate")
        .map((entry) => `${entry.unitId}/${entry.metricPath}`),
    },
    checkPolicy:
      "--check recomputes the bracket, the eligibility verdicts, the thresholds, the baseline hashes, and the comparison against the frozen baselines and requires them to match the frozen report exactly.",
  };
}

const options = parseArguments(process.argv.slice(2));
process.stdout.write(
  `Decompiler Program Phase A baseline calibration (${REGRESSION_UNIT_IDS.length} units, ${options.stage} stage)\n`,
);
const report = await buildReport({ stageId: options.stage });
const serialized = `${JSON.stringify(report, null, 2)}\n`;

process.stdout.write(
  `  divergences: ${report.divergenceSummary.total} — ` +
    `${Object.entries(report.divergenceSummary.byKind)
      .map(([kind, count]) => `${kind} x${count}`)
      .join(", ") || "none"}\n`,
);

if (options.check) {
  const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
  if (JSON.stringify(frozen) !== JSON.stringify(report)) {
    process.stderr.write(
      "automatic baseline: FAIL — the recomputed bracket, eligibility, thresholds, or comparison differ from the frozen report\n",
    );
    process.exitCode = 1;
  } else if (!report.verdict.everyBaselineCalibratedBeforeFitting) {
    process.stderr.write(
      "automatic baseline: FAIL — a baseline was not frozen before fitting could begin\n",
    );
    process.exitCode = 1;
  } else if (!report.verdict.noBaselineIsCandidateInformed) {
    process.stderr.write("automatic baseline: FAIL — a baseline is candidate-informed\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `automatic baseline: PASS (${report.units.length} units, every baseline reference-only and frozen before fitting, ` +
        `${report.divergenceSummary.total} explained divergence(s))\n`,
    );
  }
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, serialized);
  process.stdout.write(`automatic baseline: wrote ${path.relative(PROJECT_ROOT, OUTPUT)}\n`);
}
