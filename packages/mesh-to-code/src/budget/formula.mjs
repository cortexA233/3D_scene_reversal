import { FEATURE_NAMES, featureVector } from "./complexity.mjs";

/**
 * The Complexity Budget Formula and the global ceiling.
 *
 * The formula is applied identically to every unit. There is no per-object
 * override path: `budgetFor` takes a complexity measurement and nothing else, so
 * a caller cannot name a unit and get a different answer. The coefficients are
 * frozen data, back-calibrated once on the eight regression units.
 *
 * The global ceiling is the only backstop against extrapolation, because the
 * formula is calibrated on eight points. No unit may exceed it for any reason, so
 * `budgetFor` clamps and reports the clamp rather than letting a formula output
 * through.
 */

export const BUDGET_AXES = Object.freeze([
  "scalars",
  "recipeBytes",
  "bundleGzipBytes",
  "triangles",
  "drawCalls",
  "geometryMemoryBytes",
  "warmGenerationP95Milliseconds",
]);

/**
 * Rounding granularity per axis, so a frozen budget is a stable readable number
 * rather than a fitted decimal.
 */
export const AXIS_GRANULARITY = Object.freeze({
  scalars: 8,
  recipeBytes: 256,
  bundleGzipBytes: 512,
  triangles: 64,
  drawCalls: 1,
  geometryMemoryBytes: 4096,
  warmGenerationP95Milliseconds: 1,
});

/**
 * A single global ceiling no unit may exceed for any reason. Declared as twice
 * the largest budget any accepted unit was granted: the eight units are the only
 * calibration data, so the backstop is twice the most expensive thing that has
 * ever been accepted.
 */
export const GLOBAL_CEILING = Object.freeze({
  scalars: 192,
  recipeBytes: 4096,
  bundleGzipBytes: 20480,
  triangles: 11520,
  drawCalls: 6,
  geometryMemoryBytes: 524288,
  warmGenerationP95Milliseconds: 24,
  derivation:
    "twice the largest hand-set budget across the eight regression units, per axis, rounded up to the axis granularity",
});

/** A floor per axis, so a trivial input still gets a workable budget. */
export const AXIS_FLOOR = Object.freeze({
  scalars: 16,
  recipeBytes: 256,
  bundleGzipBytes: 1024,
  triangles: 64,
  drawCalls: 1,
  geometryMemoryBytes: 4096,
  warmGenerationP95Milliseconds: 2,
});

/**
 * Frozen coefficients, one row per axis in `FEATURE_NAMES` order.
 *
 * `log2MaterialRoles` is zero throughout and that is a finding, not an omission:
 * all eight regression references declare exactly one material, so the feature
 * has no variance on this corpus and its coefficient is not identifiable from it.
 * The term stays in the formula and will be re-fit when appearance-derived role
 * clustering exists. Fitting it to a constant column would have produced a number
 * that looks calibrated and is not.
 *
 * Produced by `scripts/run-decompiler-budget-calibration.mjs --fit`.
 */
export const FORMULA_COEFFICIENTS = Object.freeze({
  version: "decompiler-complexity-budget-formula-v1",
  featureNames: FEATURE_NAMES,
  safetyLiftFactor: 1.5,
  axes: Object.freeze({
    scalars: Object.freeze([5.074889, 0.128606, 0.034551, 0, 0.336387]),
    recipeBytes: Object.freeze([9.748606, 0, 0.1787, 0, 0.242498]),
    bundleGzipBytes: Object.freeze([11.880284, 0.17214, 0, 0, 0.192229]),
    triangles: Object.freeze([7.445798, 0.603561, 0, 0, 0.816475]),
    drawCalls: Object.freeze([0, 0, 0.198507, 0, 0.173433]),
    geometryMemoryBytes: Object.freeze([13.20691, 0, 0.765449, 0, 0.706015]),
    warmGenerationP95Milliseconds: Object.freeze([2.094418, 0.084381, 0.131154, 0, 0.197897]),
  }),
});

function roundUpTo(value, granularity) {
  return Math.ceil(value / granularity) * granularity;
}

/**
 * The link function is `log2`: the fit is linear in `log2(budget)` and the
 * prediction exponentiates.
 *
 * This is not a preprocessing convenience. The hand-set budgets span two orders
 * of magnitude — 96 triangles for Stone Path against 5,760 for Umbrella, a ratio
 * of 60 — while the transformed component counts span a ratio of 6. A model
 * linear in the budget itself cannot hold both ends and settles on the middle,
 * which showed up concretely: it granted Stone Path 1,600 triangles against a
 * hand-set 96. Fitting the logarithm makes the model multiplicative in complexity,
 * which is how the budgets actually behave, and makes every prediction positive
 * by construction.
 */
export const LINK_FUNCTION = "log2";

export function rawAxisValue({ coefficients, features }) {
  const linear = coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * features[index],
    0,
  );
  return 2 ** linear;
}

export function linkForward(value) {
  return Math.log2(value);
}

/**
 * Apply the formula. Identical for every unit: the only input is a complexity
 * measurement.
 */
export function budgetFor(complexity, coefficients = FORMULA_COEFFICIENTS) {
  const features = featureVector(complexity);
  const budget = {};
  const detail = {};
  for (const axis of BUDGET_AXES) {
    const raw = rawAxisValue({ coefficients: coefficients.axes[axis], features });
    const lifted = raw * coefficients.safetyLiftFactor;
    const rounded = roundUpTo(Math.max(lifted, AXIS_FLOOR[axis]), AXIS_GRANULARITY[axis]);
    const clamped = Math.min(rounded, GLOBAL_CEILING[axis]);
    budget[axis] = clamped;
    detail[axis] = {
      raw,
      lifted,
      rounded,
      clampedToCeiling: clamped < rounded,
      liftedToFloor: lifted < AXIS_FLOOR[axis],
    };
  }
  return {
    formulaVersion: coefficients.version,
    features: Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, features[index]])),
    budget,
    detail,
    globalCeiling: Object.fromEntries(BUDGET_AXES.map((axis) => [axis, GLOBAL_CEILING[axis]])),
  };
}

/**
 * The complexity gate: the formula pre-estimates the total budget and assigns a
 * path. Within ceiling is `full`; up to the declared multiple of the ceiling is
 * `coarse` with a conservative fast path; beyond that is `rejected` with a split
 * recommendation.
 */
export const COARSE_CEILING_MULTIPLE = 3;

export function complexityGate(complexity, coefficients = FORMULA_COEFFICIENTS) {
  const features = featureVector(complexity);
  const overruns = [];
  let worstRatio = 0;
  for (const axis of BUDGET_AXES) {
    const raw =
      rawAxisValue({ coefficients: coefficients.axes[axis], features }) *
      coefficients.safetyLiftFactor;
    const ratio = raw / GLOBAL_CEILING[axis];
    if (ratio > worstRatio) worstRatio = ratio;
    if (ratio > 1) overruns.push({ axis, raw, ceiling: GLOBAL_CEILING[axis], ratio });
  }
  if (worstRatio <= 1) {
    return { tier: "full", worstCeilingRatio: worstRatio, overruns };
  }
  if (worstRatio <= COARSE_CEILING_MULTIPLE) {
    return {
      tier: "coarse",
      worstCeilingRatio: worstRatio,
      overruns,
      note: "the conservative fast path is taken; actual consumption is monitored and may downgrade further",
    };
  }
  return {
    tier: "rejected",
    worstCeilingRatio: worstRatio,
    overruns,
    splitRecommendation:
      "the estimated budget exceeds the global ceiling by more than the coarse multiple; divide the input into units and reverse each with its own budget",
  };
}

function solveNormalEquations({ featureRows, targets, columns }) {
  const size = columns.length;
  if (size === 0) return [];
  const normal = Array.from({ length: size }, () => new Float64Array(size + 1));
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let sum = 0;
      for (const features of featureRows) {
        sum += features[columns[row]] * features[columns[col]];
      }
      normal[row][col] = sum;
    }
    let sum = 0;
    featureRows.forEach((features, index) => {
      sum += features[columns[row]] * targets[index];
    });
    normal[row][size] = sum;
  }
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(normal[row][pivot]) > Math.abs(normal[best][pivot])) best = row;
    }
    if (Math.abs(normal[best][pivot]) < 1e-9) return null;
    [normal[pivot], normal[best]] = [normal[best], normal[pivot]];
    for (let row = pivot + 1; row < size; row += 1) {
      const factor = normal[row][pivot] / normal[pivot][pivot];
      for (let col = pivot; col <= size; col += 1) {
        normal[row][col] -= factor * normal[pivot][col];
      }
    }
  }
  const solution = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = normal[row][size];
    for (let col = row + 1; col < size; col += 1) value -= normal[row][col] * solution[col];
    solution[row] = value / normal[row][row];
  }
  return [...solution];
}

/**
 * Non-negative least squares by exhaustive active-set search, with zero-variance
 * columns excluded.
 *
 * Two constraints matter here and neither is cosmetic.
 *
 * A constant feature is perfectly collinear with the intercept, so the normal
 * equations are singular. Excluding it and recording why is the honest response:
 * a coefficient the calibration data cannot identify should read as zero with an
 * explanation, not as a number that happens to solve a degenerate system.
 *
 * Coefficients are constrained to be non-negative because a budget must not
 * shrink as the reference gets more complex. Unconstrained least squares on this
 * corpus produces large opposite-signed pairs — component count and distinct-part
 * count move together, so the fit trades one against the other. Those cancel
 * neatly on the eight calibration points and extrapolate absurdly, which matters
 * because extrapolation risk is the formula's named weakness and the global
 * ceiling is its only backstop.
 *
 * With at most five columns the active set can be searched exhaustively, so the
 * result is the exact constrained optimum rather than an iterative approximation.
 */
export function fitNonNegativeLeastSquares({ featureRows, targets }) {
  const columnCount = featureRows[0].length;
  const variances = [];
  for (let column = 0; column < columnCount; column += 1) {
    const values = featureRows.map((row) => row[column]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    variances.push(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
    );
  }
  // Column 0 is the intercept and is kept even though it has zero variance.
  const candidateColumns = [0];
  const excluded = [];
  for (let column = 1; column < columnCount; column += 1) {
    if (variances[column] > 1e-12) candidateColumns.push(column);
    else excluded.push(column);
  }

  const residual = (coefficients) =>
    featureRows.reduce((sum, features, index) => {
      const predicted = features.reduce(
        (total, value, column) => total + value * coefficients[column],
        0,
      );
      return sum + (predicted - targets[index]) ** 2;
    }, 0);

  let best = null;
  const subsetCount = 1 << candidateColumns.length;
  for (let mask = 0; mask < subsetCount; mask += 1) {
    const columns = candidateColumns.filter((_, index) => (mask & (1 << index)) !== 0);
    const solution = solveNormalEquations({ featureRows, targets, columns });
    if (solution === null) continue;
    if (solution.some((value) => value < 0)) continue;
    const coefficients = new Array(columnCount).fill(0);
    columns.forEach((column, index) => {
      coefficients[column] = solution[index];
    });
    const error = residual(coefficients);
    // Tie-break on the smaller active set so the frozen fit is unique.
    if (
      best === null ||
      error < best.error - 1e-9 ||
      (Math.abs(error - best.error) <= 1e-9 && columns.length < best.activeColumns.length)
    ) {
      best = { coefficients, error, activeColumns: columns };
    }
  }

  if (best === null) {
    throw new Error("no non-negative solution exists for this calibration corpus");
  }

  return {
    coefficients: best.coefficients,
    residualSumOfSquares: best.error,
    activeColumns: best.activeColumns,
    activeFeatureNames: best.activeColumns.map((column) => FEATURE_NAMES[column]),
    excludedColumns: excluded,
    excludedFeatureNames: excluded.map((column) => FEATURE_NAMES[column]),
  };
}
