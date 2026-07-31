import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ingestMeshFile } from "../ingest/index.mjs";
import { createMesh, meshBounds, toReconstructionFrame } from "../geometry/mesh.mjs";
import { canonicalHash, stableStringify } from "../util/canonical-json.mjs";
import { formatFailures, validate } from "../util/schema.mjs";
import { loadSchema } from "../protocol/schemas.mjs";
import {
  decisionPoint,
  responseSchemaFor,
  responseSchemaRefFor,
} from "../protocol/decision-points.mjs";
import { fitPart } from "../fitting/fit.mjs";
import { budgetFor, measureReferenceComplexity } from "../budget/index.mjs";
import { getOperator } from "../operators/library.mjs";
import { KERNEL_VERSION } from "../version.mjs";
import { composeProgram } from "./compose.mjs";
import { composeOperatorProgram } from "./compose-operators.mjs";
import { weldedConnectedComponents } from "./decompose.mjs";
import { artifactPaths } from "./paths.mjs";
import { EXIT } from "./exit-codes.mjs";
import { reverseUnit } from "./reverse-unit.mjs";

const RUN_STATE_VERSION = "mesh-to-code-run-state-v1";

/** The stage the Calibration Bracket and final scoring both run at. */
export const DEFAULT_BASELINE_STAGE = "final";

class SuspendAtDecisionPoint extends Error {
  constructor(pending) {
    super(`suspended at Decision Point: ${pending.decisionPoint}`);
    this.name = "SuspendAtDecisionPoint";
    this.pending = pending;
  }
}

class DecisionSchemaInvalid extends Error {
  constructor(decisionPointId, failures) {
    super(`decision for ${decisionPointId} failed its schema: ${formatFailures(failures)}`);
    this.name = "DecisionSchemaInvalid";
    this.failures = failures;
  }
}

/**
 * The decision channel. A mock decider answers inline; an external decider causes
 * the driver to suspend, and a resumed run replays the answers already recorded in
 * the run state before asking for the next one.
 */
function createDecisionChannel({ decider, recorded, runId }) {
  const trace = [...recorded];
  let cursor = 0;
  return {
    trace,
    async ask({ decisionPointId, round, evidence }) {
      if (cursor < trace.length) {
        const replayed = trace[cursor];
        if (replayed.decisionPoint !== decisionPointId || replayed.round !== round) {
          throw new Error(
            `resumed run diverged: expected ${replayed.decisionPoint}@${replayed.round}, reached ${decisionPointId}@${round}`,
          );
        }
        cursor += 1;
        return replayed.response;
      }

      const definition = decisionPoint(decisionPointId);
      const pending = {
        schemaVersion: "mesh-to-code-pending-decision-v1",
        artifactRole: "development-only-decision-request",
        productionUse: "prohibited",
        runId,
        round,
        decisionPoint: decisionPointId,
        question: definition.question,
        evidence,
        responseSchema: responseSchemaFor(decisionPointId),
        responseSchemaRef: responseSchemaRefFor(decisionPointId),
        imagery: [],
      };
      const envelope = validate(pending, loadSchema("pending-decision.schema.json"));
      if (!envelope.valid) {
        throw new Error(
          `kernel produced an invalid pending decision: ${formatFailures(envelope.failures)}`,
        );
      }

      if (decider === null) throw new SuspendAtDecisionPoint(pending);

      const response = decider.answer(pending);
      const validated = validate(response, pending.responseSchema);
      if (!validated.valid) {
        throw new DecisionSchemaInvalid(decisionPointId, validated.failures);
      }
      trace.push({
        decisionPoint: decisionPointId,
        round,
        response,
        decider: decider.describe(),
      });
      cursor += 1;
      return response;
    },
  };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stableStringify(value));
}

async function readJsonIfPresent(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Reverse one mesh file. Returns `{ exitCode, ... }` rather than exiting, so the
 * same entry point serves the CLI, the tests, and a repository-side script.
 */
export async function runPipeline({
  input,
  outDirectory,
  selector = null,
  decider = null,
  resume = false,
  emitInline = false,
  baselineStageId = DEFAULT_BASELINE_STAGE,
}) {
  const paths = artifactPaths(outDirectory);
  const ingested = await ingestMeshFile(input);

  const chosen = selector
    ? ingested.selectors.find((candidate) => candidate.selector === selector)
    : mergeSelectors(ingested.selectors);
  if (!chosen) {
    return {
      exitCode: EXIT.ERROR,
      message: `selector not found: ${selector}. Available: ${ingested.selectors
        .map((candidate) => candidate.selector)
        .join(", ")}`,
    };
  }

  const runId = canonicalHash({
    sourceSha256: ingested.sha256,
    selector: selector ?? null,
    kernelVersion: KERNEL_VERSION,
  }).slice(0, 16);

  let recorded = [];
  if (resume) {
    const state = await readJsonIfPresent(paths.runState);
    if (state === null) {
      return {
        exitCode: EXIT.ERROR,
        message: `nothing to resume: ${paths.runState} does not exist`,
      };
    }
    if (state.runId !== runId) {
      return {
        exitCode: EXIT.ERROR,
        message: `run state belongs to a different input (${state.runId} != ${runId})`,
      };
    }
    recorded = state.trace;

    const pending = await readJsonIfPresent(paths.pendingDecision);
    const supplied = await readJsonIfPresent(paths.decision);
    if (pending !== null) {
      if (supplied === null) {
        return {
          exitCode: EXIT.SUSPENDED_AT_DECISION_POINT,
          message: `still suspended at ${pending.decisionPoint}: write ${paths.decision} to continue`,
          pending,
        };
      }
      const envelope = validate(supplied, loadSchema("decision.schema.json"));
      if (!envelope.valid) {
        return {
          exitCode: EXIT.DECISION_SCHEMA_INVALID,
          message: `decision envelope is invalid: ${formatFailures(envelope.failures)}`,
          failures: envelope.failures,
        };
      }
      if (
        supplied.decisionPoint !== pending.decisionPoint ||
        supplied.round !== pending.round ||
        supplied.runId !== pending.runId
      ) {
        return {
          exitCode: EXIT.DECISION_SCHEMA_INVALID,
          message: `decision does not answer the pending Decision Point (${pending.decisionPoint}@${pending.round} for run ${pending.runId})`,
        };
      }
      const response = validate(supplied.response, pending.responseSchema);
      if (!response.valid) {
        return {
          exitCode: EXIT.DECISION_SCHEMA_INVALID,
          message: `decision response is invalid: ${formatFailures(response.failures)}`,
          failures: response.failures,
        };
      }
      recorded = [
        ...recorded,
        {
          decisionPoint: supplied.decisionPoint,
          round: supplied.round,
          response: supplied.response,
          decider: {
            kind: supplied.decider.kind,
            policy: supplied.decider.policy ?? null,
            modelIdentity: supplied.decider.modelIdentity ?? null,
            promptVersion: supplied.decider.promptVersion ?? null,
            note: supplied.decider.note ?? null,
          },
        },
      ];
    }
  }

  const channel = createDecisionChannel({ decider, recorded, runId });

  try {
    const result = await reverseUnit({
      ingested,
      chosen,
      channel,
      paths,
      runId,
      emitInline,
      baselineStageId,
      emitFromManifest,
    });

    if (result.evidenceDocument) {
      await writeJson(paths.evidenceDocument, result.evidenceDocument);
      await writeJson(paths.decisionTrace, buildDecisionTrace({ runId, channel, result }));
    }
    await rm(paths.pendingDecision, { force: true });
    await rm(paths.decision, { force: true });
    await writeJson(paths.runState, {
      schemaVersion: RUN_STATE_VERSION,
      runId,
      complete: true,
      trace: channel.trace,
    });
    return result;
  } catch (error) {
    if (error instanceof SuspendAtDecisionPoint) {
      await writeJson(paths.runState, {
        schemaVersion: RUN_STATE_VERSION,
        runId,
        complete: false,
        trace: channel.trace,
      });
      await writeJson(paths.pendingDecision, error.pending);
      await rm(paths.decision, { force: true });
      return {
        exitCode: EXIT.SUSPENDED_AT_DECISION_POINT,
        message: `suspended at ${error.pending.decisionPoint}; write a decision to ${paths.decision} and rerun with --resume`,
        pending: error.pending,
        pendingDecisionFile: paths.pendingDecision,
      };
    }
    if (error instanceof DecisionSchemaInvalid) {
      return {
        exitCode: EXIT.DECISION_SCHEMA_INVALID,
        message: error.message,
        failures: error.failures,
      };
    }
    throw error;
  }
}

function buildDecisionTrace({ runId, channel, result }) {
  return {
    schemaVersion: "mesh-to-code-decision-trace-v1",
    artifactRole: "development-only-decision-trace",
    productionUse: "prohibited",
    runId,
    decisions: channel.trace,
    fitting: Object.fromEntries(
      Object.entries(result.fits ?? {}).map(([groupId, fit]) => [
        groupId,
        {
          operatorId: fit.operatorId,
          iterations: fit.iterations,
          iterationCap: fit.iterationCap,
          epsilon: fit.epsilon,
          earlyStopped: fit.earlyStopped,
          resolution: fit.resolution,
          trace: fit.trace,
        },
      ]),
    ),
    baseline: result.baseline
      ? {
          version: result.baseline.record.version,
          hash: result.baseline.baselineHash,
          stageId: result.baselineStageId,
          hardMetricCount: result.baseline.hardThresholds().length,
          diagnosticMetricCount: result.baseline.diagnosticMetrics().length,
          calibratedBeforeFitting: result.baseline.record.calibratedBeforeFitting,
        }
      : null,
    operatorAuthoring: result.authoring ?? null,
  };
}

export function mergeSelectors(selectors) {
  if (selectors.length === 1) return selectors[0];
  const positions = [];
  const indices = [];
  for (const candidate of selectors) {
    const offset = positions.length / 3;
    positions.push(...candidate.mesh.positions);
    for (const index of candidate.mesh.indices) indices.push(offset + index);
  }
  const mesh = createMesh({ positions, indices, name: "all-selectors" });
  return {
    selector: null,
    mesh,
    triangleCount: mesh.triangleCount,
    vertexCount: mesh.vertexCount,
    bounds: meshBounds(mesh),
  };
}

/**
 * Everything downstream of the manifest. Exposed so `emit --manifest` can reproduce
 * an artifact directory bit-for-bit from a frozen manifest.
 *
 * Fitting is re-run here rather than read from the manifest, because the manifest
 * records the discrete decisions and continuous parameters belong to deterministic
 * numerical fitting. Re-running it is what makes "everything downstream of the
 * manifest reproduces bit-for-bit" a claim about the pipeline rather than about a
 * cache. The Calibration Bracket is deliberately not re-run: it sets the tier, not
 * the parameters, so re-emission does not depend on it.
 */
export async function emitFromManifest({
  manifest,
  unitMesh = null,
  groupMeshes,
  paths,
  emitInline,
  authoredOperators = new Map(),
  precomputedFits = null,
}) {
  let program;
  if (manifest.composition.kind === "operator-composition") {
    const fits =
      precomputedFits ?? refit({ manifest, unitMesh, groupMeshes, authoredOperators });
    program = composeOperatorProgram({ manifest, fits, authoredOperators });
  } else {
    program = composeProgram({ manifest, groupMeshes });
  }

  await mkdir(paths.runtime, { recursive: true });
  for (const [name, source] of Object.entries(program.modules)) {
    await writeFile(path.join(paths.runtime, name), source);
  }
  if (emitInline) {
    await writeFile(paths.inlineGenerator, program.inline);
  }
  return program;
}

/**
 * Recompute the fit from the manifest and the mesh. Both the framing bounds and the
 * budget are derived here rather than passed in, so re-emission depends on nothing
 * but the manifest and the input — which is what makes the bit-for-bit claim mean
 * something.
 */
function refit({ manifest, unitMesh, groupMeshes, authoredOperators }) {
  if (unitMesh === null) {
    throw new Error("re-emitting an operator composition needs the unit's framed mesh");
  }
  const referenceWorldBounds = meshBounds(unitMesh);
  const budget = budgetFor(
    measureReferenceComplexity({ mesh: unitMesh, materialRoleCount: 1 }),
  ).budget;
  const perPart = Math.max(4, Math.floor(budget.triangles / manifest.composition.parts.length));
  const fits = {};
  for (const part of manifest.composition.parts) {
    const operator = authoredOperators.get(part.operatorId) ?? getOperator(part.operatorId);
    const fit = fitPart({
      operator,
      targetMesh: groupMeshes[part.groupId],
      referenceWorldBounds,
      triangleBudget: perPart,
    });
    if (!fit.fitted) {
      throw new Error(`re-emission could not refit ${part.groupId}: ${fit.detail}`);
    }
    fits[part.groupId] = fit;
  }
  return fits;
}

export { weldedConnectedComponents };
