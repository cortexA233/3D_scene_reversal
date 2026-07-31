/**
 * The mock decider ships with the package rather than living in tests, because
 * it serves three roles: deterministic test driver, harness-neutrality prover
 * in CI, and the batch baseline answering what a simplest-structure policy
 * achieves.
 *
 * It answers from the published numeric evidence only — the same input an
 * external decider gets — so a mock run and an external run differ in who
 * answers, never in what is available to answer with.
 */

export const MOCK_POLICIES = Object.freeze({
  /** One unit, one group per component, first library operator per group. */
  SIMPLEST_STRUCTURE: "simplest-structure",
  /** Splits every mechanical component into its own Reconstruction Unit. */
  SPLIT_EVERY_COMPONENT: "split-every-component",
  /**
   * Deliberately proposes an operator that violates a contract constraint, so
   * the withheld-emission path is exercised rather than assumed.
   */
  CONTRACT_VIOLATING_OPERATOR: "contract-violating-operator",
});

export function createMockDecider({ policy = MOCK_POLICIES.SIMPLEST_STRUCTURE } = {}) {
  if (!Object.values(MOCK_POLICIES).includes(policy)) {
    throw new Error(
      `unknown mock policy: ${policy} (known: ${Object.values(MOCK_POLICIES).join(", ")})`,
    );
  }
  return {
    kind: "mock",
    policy,
    describe: () => ({
      kind: "mock",
      policy,
      modelIdentity: null,
      promptVersion: null,
      note: null,
    }),
    answer(pending) {
      switch (pending.decisionPoint) {
        case "unit-division":
          return answerUnitDivision(pending, policy);
        case "semantic-grouping":
          return answerSemanticGrouping(pending);
        case "structure-proposal":
          return answerStructureProposal(pending, policy);
        case "operator-authoring":
          return { authorOperator: false, operatorId: null, moduleSource: null };
        default:
          throw new Error(`mock decider cannot answer ${pending.decisionPoint}`);
      }
    },
  };
}

function answerUnitDivision(pending, policy) {
  const components = pending.evidence.components.map(
    (component) => component.componentIndex,
  );
  if (policy === MOCK_POLICIES.SPLIT_EVERY_COMPONENT) {
    return {
      units: components.map((componentIndex) => ({
        unitId: `unit-${componentIndex}`,
        components: [componentIndex],
      })),
      rationale: "split-every-component policy",
    };
  }
  return {
    units: [{ unitId: "unit-0", components }],
    rationale: "simplest-structure policy treats the input as one unit",
  };
}

function answerSemanticGrouping(pending) {
  return {
    groups: pending.evidence.components.map((component) => ({
      groupId: `group-${component.componentIndex}`,
      role: null,
      components: [component.componentIndex],
    })),
    rationale: "one group per mechanical component",
  };
}

function answerStructureProposal(pending, policy) {
  const groups = pending.evidence.groups ?? [];
  const available = pending.evidence.availableOperators ?? [];
  const operatorId =
    policy === MOCK_POLICIES.CONTRACT_VIOLATING_OPERATOR
      ? (pending.evidence.contractViolatingOperatorId ?? "asset-loading-operator")
      : available[0]?.operatorId;
  if (!operatorId) {
    throw new Error("structure-proposal evidence published no available operator");
  }
  return {
    candidates: [
      {
        candidateId: "candidate-0",
        parts: groups.map((group) => ({ groupId: group.groupId, operatorId })),
      },
    ],
    rationale: `${policy} policy takes the first published operator`,
  };
}
