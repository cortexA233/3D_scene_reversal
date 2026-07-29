import { deepFreeze, readonlyClone } from "./reference-value.mjs";

const REQUIRED_STATE_SUMMARIES = Object.freeze([
  "structure",
  "transforms",
  "geometry",
  "materials",
  "lights",
  "renderer",
  "dynamic",
]);

function assertCompleteSnapshot(snapshot, phase) {
  for (const name of REQUIRED_STATE_SUMMARIES) {
    if (!snapshot?.[name] || typeof snapshot[name].digest !== "string") {
      throw new TypeError(`${phase} snapshot is missing ${name}.digest`);
    }
  }
}

export class ReferenceMutationError extends Error {
  constructor(changedSummaries) {
    super(
      `Reference observation changed immutable state: ${changedSummaries.join(", ")}`,
    );
    this.name = "ReferenceMutationError";
    this.changedSummaries = Object.freeze([...changedSummaries]);
  }
}

export function createReferenceAccess({ snapshot }) {
  if (typeof snapshot !== "function") {
    throw new TypeError("Reference Access requires a snapshot function");
  }

  return Object.freeze({
    async observe(operation, { allowedChanges = [] } = {}) {
      if (typeof operation !== "function") {
        throw new TypeError("Reference observation requires an operation");
      }
      const unknownAllowedChanges = allowedChanges.filter(
        (name) => !REQUIRED_STATE_SUMMARIES.includes(name),
      );
      if (unknownAllowedChanges.length > 0) {
        throw new TypeError(
          `Unknown allowed reference changes: ${unknownAllowedChanges.join(", ")}`,
        );
      }

      const before = readonlyClone(await snapshot());
      assertCompleteSnapshot(before, "before");
      let result;
      let operationError;
      try {
        result = await operation();
      } catch (error) {
        operationError = error;
      }
      const after = readonlyClone(await snapshot());
      assertCompleteSnapshot(after, "after");

      const changedSummaries = REQUIRED_STATE_SUMMARIES.filter(
        (name) => before[name].digest !== after[name].digest,
      );
      const undeclaredChanges = changedSummaries.filter(
        (name) => !allowedChanges.includes(name),
      );
      if (undeclaredChanges.length > 0) {
        throw new ReferenceMutationError(undeclaredChanges);
      }
      if (operationError) throw operationError;

      return deepFreeze({
        result: readonlyClone(result),
        immutability: {
          unchanged: changedSummaries.length === 0,
          withinDeclaredChanges: true,
          allowedChanges: [...allowedChanges],
          changedSummaries,
          comparedSummaries: [...REQUIRED_STATE_SUMMARIES],
          before,
          after,
        },
      });
    },
  });
}
