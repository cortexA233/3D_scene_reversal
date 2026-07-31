/**
 * Reconstruction Tier assignment. Contract constraints hard-block output;
 * quality constraints only set the tier and are reported per axis.
 *
 * `accepted` requires every hard gate to have actually passed. An axis that was
 * not evaluated can never contribute to `accepted` — it is recorded as
 * not-evaluated and the result is `below-gate`.
 */
export const TIERS = Object.freeze({
  ACCEPTED: "accepted",
  BELOW_GATE: "below-gate",
  COARSE: "coarse",
  REJECTED: "rejected",
});

export function assignTier({ contractAudit, quality, complexityTier = "full" }) {
  const rationale = [];

  if (!contractAudit.passed) {
    return {
      tier: TIERS.REJECTED,
      rationale: [
        `contract violation: ${contractAudit.hardFailures.join(", ")}`,
        "no runtime code is emitted for a contract violation; diagnosis only",
      ],
      emitted: false,
      admittedToReferenceLayoutDelivery: false,
    };
  }

  const axes = [
    ["geometry", quality.geometry],
    ["appearance", quality.appearance],
    ["compactness", quality.compactness],
  ];
  const notEvaluated = axes.filter(([, axis]) => axis.evaluated !== true);
  const failed = axes.filter(([, axis]) => axis.evaluated === true && axis.passed !== true);

  for (const [name, axis] of notEvaluated) {
    rationale.push(`${name}: not evaluated (${axis.reason ?? "no reason recorded"})`);
  }
  for (const [name, axis] of failed) {
    rationale.push(`${name}: below gate (${axis.reason ?? "threshold not met"})`);
  }

  if (complexityTier === "coarse") {
    rationale.unshift(
      "complexity tier is coarse: the conservative fast path was taken rather than the full path",
    );
    return {
      tier: TIERS.COARSE,
      rationale,
      emitted: true,
      admittedToReferenceLayoutDelivery: false,
    };
  }

  if (notEvaluated.length === 0 && failed.length === 0) {
    return {
      tier: TIERS.ACCEPTED,
      rationale: ["every hard gate passed on every evaluated axis"],
      emitted: true,
      admittedToReferenceLayoutDelivery: true,
    };
  }

  return {
    tier: TIERS.BELOW_GATE,
    rationale,
    emitted: true,
    admittedToReferenceLayoutDelivery: false,
  };
}

export function notEvaluatedAxis(reason) {
  return { evaluated: false, passed: null, reason };
}
