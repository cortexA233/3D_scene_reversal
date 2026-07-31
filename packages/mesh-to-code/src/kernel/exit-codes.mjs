/**
 * Exit codes are part of the harness-neutral contract: running a command and
 * reading its exit status are capabilities common to every harness, so each
 * outcome a driver must distinguish gets its own code.
 */
export const EXIT = Object.freeze({
  /** The run completed and emitted an artifact directory. */
  SUCCESS: 0,
  /** Usage error, unreadable input, or internal failure. */
  ERROR: 1,
  /** Suspended at a Decision Point. A decision document is awaited. */
  SUSPENDED_AT_DECISION_POINT: 2,
  /** Contract violation: no runtime code emitted, diagnosis only. */
  EMISSION_WITHHELD: 3,
  /** The supplied decision failed its schema. The loop did not advance. */
  DECISION_SCHEMA_INVALID: 4,
});

export const EXIT_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(EXIT).map(([name, code]) => [code, name])),
);
