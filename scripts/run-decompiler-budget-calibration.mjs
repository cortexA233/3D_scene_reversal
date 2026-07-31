import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMesh } from "../packages/mesh-to-code/src/geometry/mesh.mjs";
import {
  AXIS_FLOOR,
  AXIS_GRANULARITY,
  BUDGET_AXES,
  budgetFor,
  buildBudgetProxy,
  COARSE_CEILING_MULTIPLE,
  complexityGate,
  FEATURE_NAMES,
  featureVector,
  fitNonNegativeLeastSquares,
  FORMULA_COEFFICIENTS,
  GLOBAL_CEILING,
  linkForward,
  LINK_FUNCTION,
  measureReferenceComplexity,
} from "../packages/mesh-to-code/src/budget/index.mjs";
import {
  bakeToEvaluationSpace,
  CANONICAL_MAX_DIMENSION,
  computeVertexNormals,
  createReferenceBufferCache,
  scoreCandidateGeometry,
  stagePoses,
} from "../packages/mesh-to-code/src/rasterizer/index.mjs";
import { OBJECT_BUDGETS } from "../tools/acceptance/nonvisual-contract.mjs";
import { GEOMETRY_METRIC_PATHS, getMetric } from "../tools/decompiler/baseline-thresholds.mjs";
import {
  boundsOf,
  loadReferenceGeometry,
  REGRESSION_UNIT_IDS,
} from "../tools/decompiler/regression-corpus.mjs";

/**
 * Phase A: back-calibrate the Complexity Budget Formula on the eight regression
 * units, declare the global ceiling, and publish each unit's Budget Proxy
 * reachability bound.
 *
 * The formula answers "what budget does this object get" without a human sizing
 * it. The Budget Proxy answers "what score is reachable at that budget" without a
 * human approving a candidate — it is reference-derived, so it can be frozen
 * before fitting, which is what keeps automatic baselines legitimate under the
 * calibrate-before-fitting rule.
 *
 * Nothing here reads a candidate's score. The hand-set budgets and the accepted
 * units' measured consumption are read only to publish the side-by-side comparison
 * and to size the safety lift, never to set an acceptance threshold.
 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = path.join(PROJECT_ROOT, "gt_designer/single-mesh-evaluation/reports");
const OUTPUT = path.join(REPORTS, "decompiler-budget-formula-v1.json");
const SCHEMA_VERSION = "decompiler-budget-formula-v1";

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
  const options = { check: false, fit: false };
  for (const argument of args) {
    if (argument === "--check") options.check = true;
    else if (argument === "--fit") options.fit = true;
    else {
      throw new Error(
        "usage: node scripts/run-decompiler-budget-calibration.mjs [--check] [--fit]",
      );
    }
  }
  return options;
}

function roundTo(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

async function loadCorpus() {
  const corpus = [];
  for (const unitId of REGRESSION_UNIT_IDS) {
    const reference = await loadReferenceGeometry(unitId);
    const mesh = createMesh({
      positions: reference.positions,
      indices: reference.indices,
      name: unitId,
    });
    const complexity = measureReferenceComplexity({
      mesh,
      materialRoleCount: reference.materialCount,
    });
    const acceptance = JSON.parse(
      await readFile(path.join(REPORTS, ACCEPTANCE_REPORTS[unitId]), "utf8"),
    );
    corpus.push({
      unitId,
      label: reference.label,
      reference,
      mesh,
      complexity,
      handSetBudget: OBJECT_BUDGETS[unitId],
      measuredConsumption: acceptance.nonvisual.budgets.actual,
    });
    process.stdout.write(
      `  · ${unitId.padEnd(13)} components ${String(complexity.connectedComponentCount).padStart(3)}  ` +
        `distinct parts ${String(complexity.symmetryReducedPartCount).padStart(2)}  ` +
        `roles ${complexity.materialRoleCount}  ` +
        `contour ${complexity.contourCurvatureComplexity.toFixed(4)}\n`,
    );
  }
  return corpus;
}

/**
 * Fit each axis against the hand-set budgets, then pick a single safety lift so
 * no unit's formula budget falls below the consumption an accepted candidate
 * already has. The lift is one number applied identically to every axis and every
 * unit, so it cannot become a per-object override.
 */
function fitCoefficients(corpus) {
  const featureRows = corpus.map((unit) => featureVector(unit.complexity));
  const axes = {};
  const axisFits = {};
  let excludedFeatureNames = [];
  for (const axis of BUDGET_AXES) {
    const targets = corpus.map((unit) => linkForward(unit.handSetBudget[axis]));
    const fit = fitNonNegativeLeastSquares({ featureRows, targets });
    axes[axis] = fit.coefficients.map((value) => roundTo(value, 6));
    axisFits[axis] = {
      activeFeatureNames: fit.activeFeatureNames,
      residualSumOfSquares: roundTo(fit.residualSumOfSquares, 6),
      residualUnits: "squared log2 budget",
    };
    excludedFeatureNames = fit.excludedFeatureNames;
  }

  const candidate = { version: FORMULA_COEFFICIENTS.version, featureNames: FEATURE_NAMES, safetyLiftFactor: 1, axes };
  let requiredLift = 1;
  for (const unit of corpus) {
    const applied = budgetFor(unit.complexity, candidate);
    for (const axis of BUDGET_AXES) {
      const needed = unit.measuredConsumption[axis];
      const granted = applied.budget[axis];
      if (granted <= 0) continue;
      if (needed > granted) requiredLift = Math.max(requiredLift, needed / granted);
    }
  }
  const safetyLiftFactor = Math.ceil(requiredLift * 100) / 100;
  return {
    ...candidate,
    safetyLiftFactor,
    excludedFeatureNames,
    axisFits,
  };
}

function scoreProxy({ unit }) {
  const applied = budgetFor(unit.complexity);
  const proxy = buildBudgetProxy({
    mesh: unit.mesh,
    triangleBudget: applied.budget.triangles,
    materialRoles:
      unit.reference.materialCount === 1
        ? [{ roleId: "role-0", color: null }]
        : Array.from({ length: unit.reference.materialCount }, (_, index) => ({
            roleId: `role-${index}`,
            color: null,
          })),
  });
  if (!proxy.constructed) {
    return { applied, proxy, reachability: null };
  }

  const { framing } = stagePoses({
    referenceWorldBounds: unit.complexity.worldBounds,
    stageId: "final",
  });
  const referenceGeometry = bakeToEvaluationSpace({
    positions: unit.mesh.positions,
    indices: unit.mesh.indices,
    transform: framing.referenceTransform,
  });
  referenceGeometry.normals = computeVertexNormals(referenceGeometry);

  // The proxy is framed by the reference transform because it lives in the
  // reference's source-world space, and the camera is never reframed from it.
  const proxyGeometry = bakeToEvaluationSpace({
    positions: proxy.mesh.positions,
    indices: proxy.mesh.indices,
    transform: framing.referenceTransform,
  });
  proxyGeometry.normals = computeVertexNormals(proxyGeometry);

  const cache = createReferenceBufferCache({
    geometry: referenceGeometry,
    referenceWorldBounds: unit.complexity.worldBounds,
  });
  const scored = scoreCandidateGeometry({
    referenceCache: cache,
    referenceBounds: boundsOf(referenceGeometry.positions),
    candidateGeometry: proxyGeometry,
    candidateBounds: boundsOf(proxyGeometry.positions),
    stageId: "final",
    canonicalMaxDimension: CANONICAL_MAX_DIMENSION,
  });

  return {
    applied,
    proxy,
    reachability: Object.fromEntries(
      GEOMETRY_METRIC_PATHS.map((metricPath) => [
        metricPath,
        getMetric(scored.aggregate, metricPath),
      ]),
    ),
  };
}

async function buildReport(corpus) {
  const freshFit = fitCoefficients(corpus);
  const frozenMatchesFit =
    JSON.stringify({ axes: freshFit.axes, safetyLiftFactor: freshFit.safetyLiftFactor }) ===
    JSON.stringify({
      axes: FORMULA_COEFFICIENTS.axes,
      safetyLiftFactor: FORMULA_COEFFICIENTS.safetyLiftFactor,
    });

  const units = [];
  for (const unit of corpus) {
    const { applied, proxy, reachability } = scoreProxy({ unit });
    const gate = complexityGate(unit.complexity);
    const comparison = Object.fromEntries(
      BUDGET_AXES.map((axis) => [
        axis,
        {
          formula: applied.budget[axis],
          handSet: unit.handSetBudget[axis],
          measuredConsumption: unit.measuredConsumption[axis],
          formulaOverHandSet: unit.handSetBudget[axis]
            ? applied.budget[axis] / unit.handSetBudget[axis]
            : null,
          formulaCoversConsumption:
            unit.measuredConsumption[axis] <= applied.budget[axis],
          withinGlobalCeiling: applied.budget[axis] <= GLOBAL_CEILING[axis],
        },
      ]),
    );
    units.push({
      unitId: unit.unitId,
      label: unit.label,
      complexity: {
        triangleCount: unit.complexity.triangleCount,
        connectedComponentCount: unit.complexity.connectedComponentCount,
        symmetryReducedPartCount: unit.complexity.symmetryReducedPartCount,
        materialRoleCount: unit.complexity.materialRoleCount,
        contourCurvatureComplexity: unit.complexity.contourCurvatureComplexity,
        contourCurvatureComplexityWorstView:
          unit.complexity.contourCurvatureComplexityWorstView,
        contourMeasurement: unit.complexity.contourMeasurement,
      },
      features: applied.features,
      formulaBudget: applied.budget,
      formulaDetail: applied.detail,
      complexityGate: gate,
      budgetComparison: comparison,
      budgetProxy: proxy.constructed
        ? {
            constructed: true,
            budgetIsBinding: proxy.budgetIsBinding,
            triangleBudget: proxy.triangleBudget,
            triangleCount: proxy.triangleCount,
            vertexCount: proxy.vertexCount,
            lattice: proxy.lattice,
            budgetUtilization: proxy.budgetUtilization,
            construction: proxy.construction,
            materialRoles: proxy.materialRoles,
            materialRoleNote: proxy.materialRoleNote,
          }
        : { constructed: false, reason: proxy.reason },
      reachabilityBound: reachability,
    });
    process.stdout.write(
      `  · ${unit.unitId.padEnd(13)} budget tri ${String(applied.budget.triangles).padStart(6)} ` +
        `(hand-set ${String(unit.handSetBudget.triangles).padStart(5)}, used ${String(unit.measuredConsumption.triangles).padStart(5)})  ` +
        `proxy ${proxy.constructed ? `${proxy.triangleCount} tri, meanIou ${reachability["geometry.silhouette.meanIou"].toFixed(5)}` : "not constructed"}\n`,
    );
  }

  const fitQuality = Object.fromEntries(
    BUDGET_AXES.map((axis) => {
      const ratios = units.map((unit) => unit.budgetComparison[axis].formulaOverHandSet);
      const worst = units.reduce((carry, unit) =>
        unit.budgetComparison[axis].formulaOverHandSet >
        carry.budgetComparison[axis].formulaOverHandSet
          ? unit
          : carry,
      );
      const tightest = units.reduce((carry, unit) =>
        unit.budgetComparison[axis].formulaOverHandSet <
        carry.budgetComparison[axis].formulaOverHandSet
          ? unit
          : carry,
      );
      return [
        axis,
        {
          meanFormulaOverHandSet:
            ratios.reduce((sum, value) => sum + value, 0) / ratios.length,
          maxFormulaOverHandSet: worst.budgetComparison[axis].formulaOverHandSet,
          maxAtUnit: worst.unitId,
          minFormulaOverHandSet: tightest.budgetComparison[axis].formulaOverHandSet,
          minAtUnit: tightest.unitId,
        },
      ];
    }),
  );

  const allCoveredByFormula = units.every((unit) =>
    BUDGET_AXES.every((axis) => unit.budgetComparison[axis].formulaCoversConsumption),
  );
  const allWithinCeiling = units.every((unit) =>
    BUDGET_AXES.every((axis) => unit.budgetComparison[axis].withinGlobalCeiling),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    artifactRole: "development-only-phase-a-calibration",
    productionUse: "prohibited",
    program: "Decompiler Program",
    phase: "Phase A",
    purpose:
      "Back-calibrate the Complexity Budget Formula on the eight regression units, declare the global ceiling, and publish each unit's Budget Proxy reachability bound.",
    formula: {
      version: FORMULA_COEFFICIENTS.version,
      featureNames: FEATURE_NAMES,
      featureTransform:
        "counts enter as log2(1 + count); the contour ratio is already dimensionless and enters directly",
      linkFunction: LINK_FUNCTION,
      linkFunctionReason:
        "the fit is linear in log2(budget) and the prediction exponentiates. The hand-set budgets span a 60x range while the transformed features span 6x, so a model linear in the budget itself cannot hold both ends: it granted Stone Path 1,600 triangles against a hand-set 96. Fitting the logarithm makes the model multiplicative in complexity, which is how the budgets behave, and makes every prediction positive by construction.",
      coefficients: FORMULA_COEFFICIENTS.axes,
      safetyLiftFactor: FORMULA_COEFFICIENTS.safetyLiftFactor,
      safetyLiftRule:
        "one factor applied identically to every axis and every unit, the smallest that keeps each unit's formula budget at or above the consumption an accepted candidate already has",
      axisGranularity: AXIS_GRANULARITY,
      axisFloor: AXIS_FLOOR,
      fitMethod:
        "non-negative least squares against the eight hand-set budgets by exhaustive active-set search, with zero-variance feature columns excluded",
      fitConstraintReason:
        "coefficients are constrained non-negative because a budget must not shrink as the reference gets more complex. Unconstrained least squares on this corpus produces large opposite-signed pairs, because component count and distinct-part count move together; those cancel on the eight calibration points and extrapolate absurdly, which matters because extrapolation risk is this formula's named weakness and the global ceiling is its only backstop.",
      axisFits: freshFit.axisFits,
      excludedFeatureNames: freshFit.excludedFeatureNames,
      excludedFeatureReason:
        "all eight regression references declare exactly one material, so log2MaterialRoles has no variance on this corpus and its coefficient is not identifiable from it. The term stays in the formula with a zero coefficient and is re-fit when appearance-derived role clustering exists; fitting a constant column would produce a number that looks calibrated and is not.",
      frozenCoefficientsMatchFreshFit: frozenMatchesFit,
      appliedIdentically:
        "budgetFor takes a complexity measurement and nothing else, so no per-object override path exists",
    },
    globalCeiling: {
      ...Object.fromEntries(BUDGET_AXES.map((axis) => [axis, GLOBAL_CEILING[axis]])),
      derivation: GLOBAL_CEILING.derivation,
      policy: "no unit may exceed this for any reason; budgetFor clamps and reports the clamp",
      coarseCeilingMultiple: COARSE_CEILING_MULTIPLE,
    },
    budgetProxy: {
      purpose:
        "a reference-derived reachability bound, so acceptance thresholds stay reference-only and freeze before fitting",
      method: "deterministic vertex-cluster decimation of the Authored Reference to the triangle budget",
      scoredThrough: "the same L1 stack a candidate is scored through: CPU rasterizer plus the copied metric functions, final twelve-view stage",
      appearanceNote:
        "L1 scores geometry only, because a Bounded Semantic Pattern Program executes as a shader. Role colours are part of the construction and no appearance reachability is claimed here.",
    },
    fitQuality: {
      perAxis: fitQuality,
      reading:
        "The formula reproduces the hand-set budgets loosely, and most loosely for the simplest units: with eight calibration points and three identifiable features the fit is pulled by the larger objects, so a trivially simple reference is granted several times the budget a human set for it. It never grants less than an accepted candidate already consumes, and it never exceeds the global ceiling. The consequence to carry forward is that the compactness axis of the Reconstruction Tier is permissive on simple inputs and the global ceiling is the real backstop, which is the extrapolation risk this formula was already known to carry, now measured.",
    },
    units,
    verdict: {
      frozenCoefficientsMatchFreshFit: frozenMatchesFit,
      everyFormulaBudgetCoversAcceptedConsumption: allCoveredByFormula,
      everyFormulaBudgetWithinGlobalCeiling: allWithinCeiling,
      everyProxyConstructed: units.every((unit) => unit.budgetProxy.constructed),
      unitsWhereTheTriangleBudgetIsBinding: units
        .filter((unit) => unit.budgetProxy.budgetIsBinding)
        .map((unit) => unit.unitId),
      bindingBudgetNote:
        "where the triangle budget already holds the whole reference the proxy is the reference, so the reachability bound is exactly perfect and the reading is that compactness is not what limits geometric fidelity for that unit.",
    },
    checkPolicy:
      "--check recomputes the complexity measurements, the formula budgets, the proxy construction, and the proxy scores and requires them to match the frozen report exactly.",
  };
}

const options = parseArguments(process.argv.slice(2));
process.stdout.write(
  `Decompiler Program Phase A budget calibration (${REGRESSION_UNIT_IDS.length} units)\n`,
);
const corpus = await loadCorpus();

if (options.fit) {
  const fit = fitCoefficients(corpus);
  process.stdout.write(
    `\nfitted coefficients (paste into packages/mesh-to-code/src/budget/formula.mjs):\n` +
      `  safetyLiftFactor: ${fit.safetyLiftFactor},\n  axes: Object.freeze({\n` +
      BUDGET_AXES.map(
        (axis) => `    ${axis}: Object.freeze([${fit.axes[axis].join(", ")}]),`,
      ).join("\n") +
      `\n  }),\n\nexcluded features: ${fit.excludedFeatureNames.join(", ") || "(none)"}\n`,
  );
} else {
  const report = await buildReport(corpus);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.check) {
    const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
    if (JSON.stringify(frozen) !== JSON.stringify(report)) {
      process.stderr.write(
        "budget formula: FAIL — the recomputed formula, budgets, or proxy scores differ from the frozen report\n",
      );
      process.exitCode = 1;
    } else if (!report.verdict.frozenCoefficientsMatchFreshFit) {
      process.stderr.write(
        "budget formula: FAIL — the frozen coefficients no longer match a fresh fit on the regression corpus\n",
      );
      process.exitCode = 1;
    } else if (!report.verdict.everyFormulaBudgetCoversAcceptedConsumption) {
      process.stderr.write(
        "budget formula: FAIL — a formula budget is below the consumption of an already-accepted candidate\n",
      );
      process.exitCode = 1;
    } else if (!report.verdict.everyFormulaBudgetWithinGlobalCeiling) {
      process.stderr.write("budget formula: FAIL — a formula budget exceeds the global ceiling\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `budget formula: PASS (${report.units.length} units, coefficients match a fresh fit, every budget covers accepted consumption and sits within the global ceiling)\n`,
      );
    }
  } else {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, serialized);
    process.stdout.write(`budget formula: wrote ${path.relative(PROJECT_ROOT, OUTPUT)}\n`);
  }
}
