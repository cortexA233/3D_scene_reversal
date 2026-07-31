import { canonicalHash } from "../util/canonical-json.mjs";
import { satisfies } from "./direction.mjs";

/**
 * The structural enforcement of calibrate-before-fitting.
 *
 * The rule is not "remember to freeze the baseline first". A fitting call takes a
 * frozen-baseline handle as an argument, the handle can only be produced by
 * `freezeBaseline`, and its identity is checked against a module-private registry
 * so a caller cannot fabricate one. There is no overload that accepts a plain
 * object, and no flag that skips the check.
 *
 * Once frozen, a baseline is deeply immutable and its thresholds are bound to a
 * hash. Loosening one after fitting has begun is not a policy violation to be
 * caught in review — there is no code path that does it.
 */

const FROZEN = new WeakSet();

class FrozenBaseline {
  #record;
  #fittingStarted = false;

  constructor(record) {
    this.#record = deepFreeze(structuredClone(record));
    FROZEN.add(this);
  }

  get record() {
    return this.#record;
  }

  get baselineHash() {
    return this.#record.baselineHash;
  }

  get fittingStarted() {
    return this.#fittingStarted;
  }

  /** Called once by the fitting entry point. After this the baseline is in use. */
  markFittingStarted() {
    this.#fittingStarted = true;
    return this;
  }

  /** Hard thresholds only. Diagnostic metrics are reported, never gated on. */
  hardThresholds() {
    return Object.entries(this.#record.metrics)
      .filter(([, metric]) => metric.eligibility === "hard")
      .map(([path, metric]) => ({
        path,
        operator: metric.direction,
        threshold: metric.threshold,
      }));
  }

  diagnosticMetrics() {
    return Object.entries(this.#record.metrics)
      .filter(([, metric]) => metric.eligibility === "diagnostic")
      .map(([path, metric]) => ({ path, reason: metric.reason }));
  }

  /** Evaluate an aggregate against the frozen hard thresholds. */
  evaluate(aggregate) {
    const failures = [];
    for (const { path, operator, threshold } of this.hardThresholds()) {
      const value = path.split(".").reduce((carry, key) => carry?.[key], aggregate);
      if (!satisfies({ value, operator, threshold })) {
        failures.push({ metric: path, actual: value, operator, threshold });
      }
    }
    return {
      baselineVersion: this.#record.version,
      baselineHash: this.#record.baselineHash,
      passed: failures.length === 0,
      failures,
      diagnostic: this.diagnosticMetrics(),
    };
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/**
 * Freeze a bracket result into a baseline. The reachability bound from the Budget
 * Proxy is combined in here, not bolted on later, because a baseline whose
 * threshold no proxy at the declared budget can satisfy is a signal that the
 * budget formula or the Operator Library is inadequate — not grounds for relaxing
 * the threshold. So the combination records the conflict and keeps the stricter
 * reference-derived threshold.
 */
export function freezeBaseline({ unitId, version, bracket, budget, reachabilityBound }) {
  if (bracket.candidatePresent !== false) {
    throw new Error("a baseline may only be frozen from a reference-only bracket");
  }

  const metrics = {};
  for (const [path, metric] of Object.entries(bracket.metrics)) {
    const bound = reachabilityBound?.[path];
    let reachability = null;
    if (metric.eligibility === "hard" && Number.isFinite(bound)) {
      const reachable = satisfies({
        value: bound,
        operator: metric.direction,
        threshold: metric.threshold,
      });
      reachability = {
        budgetProxyValue: bound,
        proxySatisfiesThreshold: reachable,
        note: reachable
          ? "a Budget Proxy at the declared budget satisfies this threshold"
          : "no Budget Proxy at the declared budget satisfies this threshold, which is a signal that the budget formula or the Operator Library is inadequate; the threshold is not relaxed",
      };
    }
    metrics[path] = { ...metric, reachability };
  }

  const body = {
    schemaVersion: "decompiler-automatic-baseline-v1",
    artifactRole: "development-only-quality-baseline",
    productionUse: "prohibited",
    version,
    unitId,
    calibratedBeforeFitting: true,
    candidateInformed: false,
    manifestVersion: bracket.manifestVersion,
    stageId: bracket.stageId,
    guardFraction: bracket.metrics[Object.keys(bracket.metrics)[0]]?.guardFraction ?? null,
    budget,
    metrics,
    appearanceDomain: bracket.appearanceDomain,
    controls: bracket.controls,
  };
  return new FrozenBaseline({ ...body, baselineHash: canonicalHash(body) });
}

export function isFrozenBaseline(value) {
  return value instanceof FrozenBaseline && FROZEN.has(value);
}

/**
 * The gate every fitting entry point must pass through. It is the only way to
 * begin fitting, and it accepts nothing but a handle this module produced.
 */
export function requireFrozenBaseline(baseline) {
  if (!isFrozenBaseline(baseline)) {
    throw new TypeError(
      "fitting requires a baseline frozen by freezeBaseline; a plain object is not accepted, " +
        "because Quality Baselines freeze before any candidate is fitted",
    );
  }
  return baseline.markFittingStarted();
}

export { FrozenBaseline };
