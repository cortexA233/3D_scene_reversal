import { checkOperatorContract } from "./contract.mjs";
import { PROFILE_LATHE } from "./profile-lathe.mjs";

/**
 * The Operator Library: the project-owned, versioned set of Contract Operators the
 * decompiler may compose.
 *
 * It holds exactly one operator. The library grows only by admitting operators
 * authored under a recorded coverage failure, and the eight hand-authored
 * generators are the seed for that growth by being *read*, never by being
 * refactored to import from here — their Object-scoped Candidate Freezes bind the
 * shared generation kernel, so moving code into a shared operator would change
 * frozen candidate hashes and force re-certification of accepted evidence.
 */
export const OPERATOR_LIBRARY_VERSION = "operator-library-v1";

const OPERATORS = new Map([[PROFILE_LATHE.operatorId, PROFILE_LATHE]]);

export function listOperators() {
  return [...OPERATORS.values()];
}

export function getOperator(operatorId) {
  const operator = OPERATORS.get(operatorId);
  if (!operator) {
    throw new Error(
      `unknown operator: ${operatorId} (library holds ${[...OPERATORS.keys()].join(", ")})`,
    );
  }
  return operator;
}

export function hasOperator(operatorId) {
  return OPERATORS.has(operatorId);
}

/**
 * The evidence a Decision Point publishes about what the library can offer. Numeric
 * and declarative: parameter kinds and bounds, never prose about what to pick.
 */
export function publishedOperatorEvidence() {
  return listOperators().map((operator) => ({
    operatorId: operator.operatorId,
    version: operator.version,
    summary: operator.summary,
    parameterSignature: operator.parameterSignature,
    materialRoleCount: operator.materialRoleCount,
  }));
}

/**
 * Admit an operator authored under the escape hatch. Admission requires the
 * recorded coverage failure that unlocked it plus conformance to the Contract
 * Operator checks; a non-conformant operator is returned with its findings rather
 * than added, so the caller must decide what to do with a violation instead of
 * discovering it later.
 */
export function admitAuthoredOperator({ operator, coverageFailure, sampleParameters }) {
  if (!coverageFailure) {
    throw new Error(
      "an authored operator needs the recorded coverage failure that unlocked it",
    );
  }
  const conformance = checkOperatorContract(operator, sampleParameters);
  if (!conformance.conformant) {
    return { admitted: false, conformance, coverageFailure };
  }
  if (OPERATORS.has(operator.operatorId)) {
    throw new Error(`operator already in the library: ${operator.operatorId}`);
  }
  OPERATORS.set(operator.operatorId, operator);
  return { admitted: true, conformance, coverageFailure };
}

export { PROFILE_LATHE };
export { checkOperatorContract } from "./contract.mjs";
export { createContractOperator } from "./contract.mjs";
