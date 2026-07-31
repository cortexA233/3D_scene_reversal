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
import { runContractAudit } from "../audit/contract-audit.mjs";
import { KERNEL_VERSION, OPERATOR_LIBRARY_VERSION } from "../version.mjs";
import { composeProgram } from "./compose.mjs";
import { mechanicalEvidence, weldedConnectedComponents } from "./decompose.mjs";
import { artifactPaths } from "./paths.mjs";
import { EXIT } from "./exit-codes.mjs";
import { buildStructureManifest, serializeManifest } from "./manifest.mjs";
import { assignTier, notEvaluatedAxis } from "./tier.mjs";

const RUN_STATE_VERSION = "mesh-to-code-run-state-v1";

class SuspendAtDecisionPoint extends Error {
  constructor(pending) {
    super(`suspended at Decision Point: ${pending.decisionPoint}`);
    this.name = "SuspendAtDecisionPoint";
    this.pending = pending;
  }
}

class DecisionSchemaInvalid extends Error {
  constructor(decisionPointId, failures) {
    super(
      `decision for ${decisionPointId} failed its schema: ${formatFailures(failures)}`,
    );
    this.name = "DecisionSchemaInvalid";
    this.failures = failures;
  }
}

/**
 * The decision channel. A mock decider answers inline; an external decider
 * causes the driver to suspend, and a resumed run replays the answers already
 * recorded in the run state before asking for the next one.
 */
function createDecisionChannel({ decider, recorded, runId }) {
  const trace = [...recorded];
  let cursor = 0;
  return {
    trace,
    async ask({ decisionPointId, round, evidence }) {
      if (cursor < trace.length) {
        const replayed = trace[cursor];
        if (
          replayed.decisionPoint !== decisionPointId ||
          replayed.round !== round
        ) {
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
    });
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

async function reverseUnit({ ingested, chosen, channel, paths, runId, emitInline }) {
  const framed = toReconstructionFrame(chosen.mesh);
  const evidence = mechanicalEvidence(framed.mesh);

  const unitDivisionResponse = await channel.ask({
    decisionPointId: "unit-division",
    round: 0,
    evidence,
  });

  const declared = unitDivisionResponse.units.flatMap((unit) => unit.components);
  const known = new Set(evidence.components.map((component) => component.componentIndex));
  const unknown = declared.filter((index) => !known.has(index));
  const missing = [...known].filter((index) => !declared.includes(index));
  if (unknown.length > 0 || missing.length > 0 || new Set(declared).size !== declared.length) {
    return {
      exitCode: EXIT.ERROR,
      message:
        "unit division must assign every mechanical component to exactly one unit " +
        `(unknown: [${unknown}], unassigned: [${missing}])`,
    };
  }
  if (unitDivisionResponse.units.length > 1) {
    return {
      exitCode: EXIT.ERROR,
      message:
        "multi-unit inputs need the composition module that returns units to their " +
        "original placement, which this build does not emit yet",
      failureClassification: "decomposition-failure",
    };
  }

  const unit = unitDivisionResponse.units[0];
  const components = weldedConnectedComponents(framed.mesh).components;
  const groups = unit.components.map((componentIndex) => ({
    groupId: `component-${componentIndex}`,
    role: null,
    components: [componentIndex],
  }));
  const groupMeshes = Object.fromEntries(
    groups.map((group) => [group.groupId, components[group.components[0]].mesh]),
  );

  const manifest = buildStructureManifest({
    kernelVersion: KERNEL_VERSION,
    operatorLibraryVersion: OPERATOR_LIBRARY_VERSION,
    input: {
      sourceName: ingested.sourceName,
      format: ingested.format,
      sha256: ingested.sha256,
      selector: chosen.selector,
      triangleCount: chosen.mesh.triangleCount,
      bounds: {
        min: framed.sourceWorldBounds.min,
        max: framed.sourceWorldBounds.max,
        size: framed.sourceWorldBounds.size,
        reconstructionFrameOriginInSourceWorld: framed.originInSourceWorld,
      },
    },
    unitId: unit.unitId,
    unitDivision: {
      componentCount: evidence.componentCount,
      separationRatio: evidence.separationRatio,
      units: unitDivisionResponse.units,
    },
    semanticGrouping: { groups },
    composition: {
      kind: "stub-bounds-placeholder",
      note: "walking skeleton: geometry is a bounds placeholder, not a fitted reconstruction",
      parts: groups.map((group) => ({ groupId: group.groupId, operatorId: null })),
    },
    authoredOperators: [],
  });

  const emitted = await emitFromManifest({
    manifest,
    groupMeshes,
    paths,
    emitInline,
  });

  const contractAudit = await runContractAudit({
    modules: emitted.modules,
    generatorFile: paths.generator,
  });

  const quality = {
    geometry: notEvaluatedAxis(
      "the walking skeleton emits a bounds placeholder; no geometry metric was computed",
    ),
    appearance: notEvaluatedAxis(
      "appearance solving is not part of this build; no appearance metric was computed",
    ),
    compactness: notEvaluatedAxis(
      "the Complexity Budget Formula is not part of this build; no budget was applied",
    ),
  };

  const tier = assignTier({ contractAudit, quality });

  if (!tier.emitted) {
    await rm(paths.runtime, { recursive: true, force: true });
  }

  const evidenceDocument = {
    schemaVersion: "mesh-to-code-evidence-v1",
    artifactRole: "development-only-reconstruction-evidence",
    productionUse: "prohibited",
    unitId: manifest.unitId,
    manifestHash: manifest.manifestHash,
    reconstructionTier: tier.tier,
    tierRationale: tier.rationale,
    contractAudit: {
      passed: contractAudit.passed,
      constraints: contractAudit.constraints,
    },
    quality,
    failureClassification: tier.tier === "rejected" ? "contract-violation" : null,
    decisionTrace: {
      runId,
      decisionCount: channel.trace.length,
      traceHash: canonicalHash(channel.trace),
    },
    admittedToReferenceLayoutDelivery: tier.admittedToReferenceLayoutDelivery,
    emitted: tier.emitted,
  };

  const validated = validate(evidenceDocument, loadSchema("evidence.schema.json"));
  if (!validated.valid) {
    throw new Error(
      `kernel produced invalid evidence: ${formatFailures(validated.failures)}`,
    );
  }

  await mkdir(paths.evidence, { recursive: true });
  await writeFile(paths.structureManifest, serializeManifest(manifest));
  await writeJson(paths.evidenceDocument, evidenceDocument);
  await writeJson(paths.decisionTrace, {
    schemaVersion: "mesh-to-code-decision-trace-v1",
    artifactRole: "development-only-decision-trace",
    productionUse: "prohibited",
    runId,
    decisions: channel.trace,
  });

  return {
    exitCode: tier.emitted ? EXIT.SUCCESS : EXIT.EMISSION_WITHHELD,
    message: `unit ${manifest.unitId}: tier ${tier.tier}`,
    manifest,
    evidence: evidenceDocument,
    geometrySha256: contractAudit.geometrySha256,
  };
}

/**
 * Everything downstream of the manifest. Exposed so `emit --manifest` can
 * reproduce an artifact directory bit-for-bit from a frozen manifest.
 */
export async function emitFromManifest({ manifest, groupMeshes, paths, emitInline }) {
  const program = composeProgram({ manifest, groupMeshes });
  await mkdir(paths.runtime, { recursive: true });
  for (const [name, source] of Object.entries(program.modules)) {
    await writeFile(path.join(paths.runtime, name), source);
  }
  if (emitInline) {
    await writeFile(paths.inlineGenerator, program.inline);
  }
  return program;
}
