import { mkdir, rm, writeFile } from "node:fs/promises";

import { createMesh, meshBounds, toReconstructionFrame } from "../geometry/mesh.mjs";
import { canonicalHash } from "../util/canonical-json.mjs";
import { formatFailures, validate } from "../util/schema.mjs";
import { loadSchema } from "../protocol/schemas.mjs";
import { runContractAudit } from "../audit/contract-audit.mjs";
import { auditScalars } from "../audit/scalar-audit.mjs";
import {
  budgetFor,
  complexityGate,
  GLOBAL_CEILING,
  measureReferenceComplexity,
} from "../budget/index.mjs";
import {
  freezeBaseline,
  requireFrozenBaseline,
  runCalibrationBracket,
} from "../baseline/index.mjs";
import { fitPart } from "../fitting/fit.mjs";
import {
  admitAuthoredOperator,
  createContractOperator,
  getOperator,
  OPERATOR_LIBRARY_VERSION,
  publishedOperatorEvidence,
} from "../operators/library.mjs";
import { KERNEL_VERSION } from "../version.mjs";
import { mechanicalEvidence, weldedConnectedComponents } from "./decompose.mjs";
import { EXIT } from "./exit-codes.mjs";
import { buildStructureManifest, serializeManifest } from "./manifest.mjs";
import { assignTier, notEvaluatedAxis } from "./tier.mjs";

/**
 * Reverse one Reconstruction Unit, end to end.
 *
 * The order is not incidental. Mechanical decomposition publishes evidence, a
 * Decision Point divides units, a second groups them, the Complexity Budget Formula
 * sizes the budget, the Calibration Bracket freezes a reference-only baseline, and
 * only then does a third Decision Point propose structure and fitting begin. The
 * baseline is frozen before `requireFrozenBaseline` will let a fitting call run, so
 * calibrate-before-fitting holds by construction rather than by ordering discipline.
 */
export async function reverseUnit({
  ingested,
  chosen,
  channel,
  paths,
  runId,
  emitInline,
  baselineStageId,
  emitFromManifest,
}) {
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

  const groupingResponse = await channel.ask({
    decisionPointId: "semantic-grouping",
    round: 0,
    evidence: {
      unitId: unit.unitId,
      componentCount: evidence.componentCount,
      components: evidence.components,
      shapeDescriptorClusters: evidence.shapeDescriptorClusters,
      repetitionTrackCount: evidence.repetitionTrackCount,
      separationRatio: evidence.separationRatio,
      pairwiseBoundsGaps: evidence.pairwiseBoundsGaps,
    },
  });

  const groups = groupingResponse.groups;
  const groupedComponents = groups.flatMap((group) => group.components);
  if (
    new Set(groupedComponents).size !== groupedComponents.length ||
    groupedComponents.some((index) => index < 0 || index >= components.length) ||
    groupedComponents.length !== components.length
  ) {
    return {
      exitCode: EXIT.ERROR,
      message: "semantic grouping must assign every mechanical component to exactly one group",
      failureClassification: "decomposition-failure",
    };
  }
  const groupMeshes = Object.fromEntries(
    groups.map((group) => [group.groupId, mergeComponentMeshes(group.components, components)]),
  );

  const complexity = measureReferenceComplexity({ mesh: framed.mesh, materialRoleCount: 1 });
  const applied = budgetFor(complexity);
  const gate = complexityGate(complexity);
  if (gate.tier === "rejected") {
    return {
      exitCode: EXIT.EMISSION_WITHHELD,
      message: `complexity gate rejected the input: ${gate.splitRecommendation}`,
      failureClassification: "insufficient-budget",
    };
  }

  const bracket = runCalibrationBracket({ mesh: framed.mesh, stageId: baselineStageId });
  const baseline = freezeBaseline({
    unitId: unit.unitId,
    version: `${unit.unitId}-automatic-geometry-baseline-v1`,
    bracket,
    budget: applied.budget,
    reachabilityBound: null,
  });

  const structureResponse = await channel.ask({
    decisionPointId: "structure-proposal",
    round: 0,
    evidence: {
      unitId: unit.unitId,
      budget: applied.budget,
      complexityTier: gate.tier,
      groups: groups.map((group) => {
        const bounds = meshBounds(groupMeshes[group.groupId]);
        return {
          groupId: group.groupId,
          triangleCount: groupMeshes[group.groupId].triangleCount,
          bounds: { min: bounds.min, max: bounds.max, size: bounds.size },
        };
      }),
      availableOperators: publishedOperatorEvidence(),
    },
  });

  const candidate = structureResponse.candidates[0];
  const partAssignments = candidate.parts.map((part) => ({ ...part }));
  if (partAssignments.length !== groups.length) {
    return {
      exitCode: EXIT.ERROR,
      message: "a structure candidate must assign exactly one operator per semantic group",
      failureClassification: "missing-operator",
    };
  }

  // Fitting begins here, and only here, behind the frozen-baseline gate.
  requireFrozenBaseline(baseline);
  // Framing comes from the whole unit in its Reconstruction Frame, not from a
  // group and not from the source-world bounds. Re-emission derives the same
  // bounds the same way, which is what keeps the refit bit-for-bit identical.
  const unitBounds = meshBounds(framed.mesh);
  const triangleBudgetPerPart = Math.max(
    4,
    Math.floor(applied.budget.triangles / partAssignments.length),
  );
  const fits = {};
  for (const part of partAssignments) {
    let operator;
    try {
      operator = getOperator(part.operatorId);
    } catch (error) {
      return {
        exitCode: EXIT.ERROR,
        message: error instanceof Error ? error.message : String(error),
        failureClassification: "missing-operator",
      };
    }
    const fit = fitPart({
      operator,
      targetMesh: groupMeshes[part.groupId],
      referenceWorldBounds: unitBounds,
      triangleBudget: triangleBudgetPerPart,
    });
    if (!fit.fitted) {
      return {
        exitCode: EXIT.EMISSION_WITHHELD,
        message: `fitting ${part.groupId} failed: ${fit.detail}`,
        failureClassification: fit.failureClassification,
      };
    }
    fits[part.groupId] = fit;
  }

  const libraryOnlyGate = baseline.evaluate(combineAggregates(fits));
  const authoredOperators = new Map();
  let authoring = null;

  // New operator authoring unlocks only after a library-only search has produced a
  // measured geometry-gate failure for this unit.
  if (!libraryOnlyGate.passed) {
    const coverageFailure = {
      unitId: unit.unitId,
      baselineVersion: baseline.record.version,
      failures: libraryOnlyGate.failures,
      libraryOnlyOperatorIds: [...new Set(partAssignments.map((part) => part.operatorId))],
    };
    const authoringResponse = await channel.ask({
      decisionPointId: "operator-authoring",
      round: 0,
      evidence: {
        unitId: unit.unitId,
        recordedCoverageFailure: coverageFailure,
        libraryOperatorCount: publishedOperatorEvidence().length,
        budget: applied.budget,
      },
    });
    authoring = { requested: authoringResponse.authorOperator, coverageFailure };
    if (authoringResponse.authorOperator) {
      const authored = buildAuthoredOperator(authoringResponse);
      const admission = admitAuthoredOperator({
        operator: authored,
        coverageFailure,
        sampleParameters: fits[partAssignments[0].groupId].parameters,
      });
      authoring.admission = {
        admitted: admission.admitted,
        conformance: admission.conformance,
      };
      // A non-conformant authored operator is still composed in, so the contract
      // audit is what withholds emission. Filtering it out here would hide the
      // violation rather than catch it.
      authoredOperators.set(authored.operatorId, authored);
      for (const part of partAssignments) part.operatorId = authored.operatorId;
    }
  }

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
      kind: "operator-composition",
      candidateId: candidate.candidateId,
      parts: partAssignments.map((part) => ({
        groupId: part.groupId,
        operatorId: part.operatorId,
      })),
    },
    authoredOperators: authoring?.admission
      ? [
          {
            operatorId: [...authoredOperators.keys()][0],
            conformant: authoring.admission.conformance.conformant,
            findings: authoring.admission.conformance.findings,
            coverageFailureMetrics: authoring.coverageFailure.failures.map(
              (failure) => failure.metric,
            ),
          },
        ]
      : [],
  });

  const program = await emitFromManifest({
    manifest,
    unitMesh: framed.mesh,
    groupMeshes,
    paths,
    emitInline,
    authoredOperators,
    precomputedFits: fits,
  });

  const scalarAudit = auditScalars({
    recipe: program.recipe,
    sources: program.operatorSources ?? {},
    budget: applied.budget.scalars,
  });
  const contractAudit = await runContractAudit({
    modules: program.modules,
    generatorFile: paths.generator,
    globalCeiling: describeCeiling({ fits, program }),
    scalarAudit: {
      withinBudget: scalarAudit.withinBudget,
      detail: `${scalarAudit.count} Object-specific Scalars against a budget of ${scalarAudit.maximum}`,
      measured: {
        count: scalarAudit.count,
        recipeCount: scalarAudit.recipeCount,
        sourceCount: scalarAudit.sourceCount,
        maximum: scalarAudit.maximum,
        definition: scalarAudit.definition,
      },
    },
  });

  const finalAggregate = combineAggregates(fits);
  const geometryGate = baseline.evaluate(finalAggregate);
  const compactness = evaluateCompactness({ applied, fits, program, scalarAudit });

  const quality = {
    geometry: {
      evaluated: true,
      passed: geometryGate.passed,
      reason: geometryGate.passed
        ? `every hard metric of ${geometryGate.baselineVersion} passed`
        : `${geometryGate.failures.map((failure) => failure.metric).join(", ")} below ${geometryGate.baselineVersion}`,
      baselineVersion: geometryGate.baselineVersion,
      baselineHash: geometryGate.baselineHash,
      stageId: baselineStageId,
      aggregate: finalAggregate.geometry,
      failures: geometryGate.failures,
      diagnosticMetrics: geometryGate.diagnostic,
    },
    appearance: notEvaluatedAxis(
      "appearance is solved analytically and executes as a shader, so it cannot descend to the CPU tier; this build solves no appearance and emits flat neutral roles",
    ),
    compactness,
  };

  const tier = assignTier({ contractAudit, quality, complexityTier: gate.tier });
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
    throw new Error(`kernel produced invalid evidence: ${formatFailures(validated.failures)}`);
  }

  await mkdir(paths.evidence, { recursive: true });
  await writeFile(paths.structureManifest, serializeManifest(manifest));

  return {
    exitCode: tier.emitted ? EXIT.SUCCESS : EXIT.EMISSION_WITHHELD,
    message: `unit ${manifest.unitId}: tier ${tier.tier}`,
    manifest,
    evidenceDocument,
    geometrySha256: contractAudit.geometrySha256,
    fits,
    baseline,
    baselineStageId,
    authoring,
  };
}

function mergeComponentMeshes(componentIndices, components) {
  if (componentIndices.length === 1) return components[componentIndices[0]].mesh;
  const positions = [];
  const indices = [];
  for (const componentIndex of componentIndices) {
    const mesh = components[componentIndex].mesh;
    const offset = positions.length / 3;
    positions.push(...mesh.positions);
    for (const index of mesh.indices) indices.push(offset + index);
  }
  return createMesh({ positions, indices, name: `group-${componentIndices.join("-")}` });
}

/**
 * Combine per-part aggregates into one unit-level aggregate, worst case per metric.
 * Worst rather than mean, because a gate on a unit should not be satisfiable by one
 * good part carrying a bad one.
 */
export function combineAggregates(fits) {
  const parts = Object.values(fits).map((fit) => fit.finalAggregate.geometry);
  const worst = (selector, direction) => {
    const values = parts.map(selector).filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;
    return direction === ">=" ? Math.min(...values) : Math.max(...values);
  };
  return {
    viewCount: Object.values(fits)[0].finalAggregate.viewCount,
    geometry: {
      bounds: {
        maxAxisRelativeError: worst((part) => part.bounds.maxAxisRelativeError, "<="),
        bottomAnchorErrorCanonical: worst(
          (part) => part.bounds.bottomAnchorErrorCanonical,
          "<=",
        ),
      },
      silhouette: {
        meanIou: worst((part) => part.silhouette.meanIou, ">="),
        worstViewIou: worst((part) => part.silhouette.worstViewIou, ">="),
        meanEdgeDistancePixels: worst((part) => part.silhouette.meanEdgeDistancePixels, "<="),
        edgeDistanceP95Pixels: worst((part) => part.silhouette.edgeDistanceP95Pixels, "<="),
      },
      depth: {
        mae: worst((part) => part.depth.mae, "<="),
        p95: worst((part) => part.depth.p95, "<="),
      },
      worldNormal: {
        meanDegrees: worst((part) => part.worldNormal?.meanDegrees, "<="),
        p95Degrees: worst((part) => part.worldNormal?.p95Degrees, "<="),
      },
    },
  };
}

function measuredConsumption({ fits, program }) {
  const triangles = Object.values(fits).reduce((sum, fit) => sum + fit.triangleCount, 0);
  return {
    triangles,
    drawCalls: Object.keys(fits).length,
    recipeBytes: Buffer.byteLength(program.modules["recipe.js"], "utf8"),
    // Positions plus indices, at the widths the emitted runtime uses.
    geometryMemoryBytes: triangles * 3 * (3 * 4 + 4),
  };
}

function describeCeiling({ fits, program }) {
  const consumption = measuredConsumption({ fits, program });
  const overruns = Object.entries(consumption).filter(
    ([axis, value]) => Number.isFinite(GLOBAL_CEILING[axis]) && value > GLOBAL_CEILING[axis],
  );
  return {
    withinCeiling: overruns.length === 0,
    detail:
      overruns.length === 0
        ? "measured consumption is inside the single global ceiling on every axis"
        : `over the global ceiling on ${overruns.map(([axis]) => axis).join(", ")}`,
    measured: {
      consumption,
      ceiling: Object.fromEntries(
        Object.keys(consumption).map((axis) => [axis, GLOBAL_CEILING[axis] ?? null]),
      ),
    },
  };
}

function evaluateCompactness({ applied, fits, program, scalarAudit }) {
  const consumption = measuredConsumption({ fits, program });
  const checks = [
    ["triangles", consumption.triangles, applied.budget.triangles],
    ["drawCalls", consumption.drawCalls, applied.budget.drawCalls],
    ["recipeBytes", consumption.recipeBytes, applied.budget.recipeBytes],
    ["geometryMemoryBytes", consumption.geometryMemoryBytes, applied.budget.geometryMemoryBytes],
    ["scalars", scalarAudit.count, applied.budget.scalars],
  ].map(([axis, value, maximum]) => ({ axis, value, maximum, passed: value <= maximum }));
  const failures = checks.filter((check) => !check.passed);
  return {
    evaluated: true,
    passed: failures.length === 0,
    reason:
      failures.length === 0
        ? "every measured axis is inside its formula budget"
        : `${failures.map((failure) => failure.axis).join(", ")} over budget`,
    budget: applied.budget,
    checks,
  };
}

function extractFunctionName(source) {
  const match = source.match(/function\s+([A-Za-z_$][\w$]*)/);
  if (!match) throw new Error("authored operator source must declare a named function");
  return match[1];
}

/**
 * Compile an operator authored under the escape hatch. The source is evaluated in a
 * scope with no bindings from here, so an authored operator cannot reach the
 * kernel's state, and whether it satisfies the Contract Operator rules is then
 * decided by measurement rather than by trust.
 */
function buildAuthoredOperator(response) {
  if (typeof response.moduleSource !== "string" || response.moduleSource.trim() === "") {
    throw new Error("authoring a Contract Operator requires its module source");
  }
  const name = extractFunctionName(response.moduleSource);
  // eslint-disable-next-line no-new-func -- an authored operator is code by definition
  const builder = new Function(`${response.moduleSource}\nreturn ${name};`)();
  return createContractOperator({
    operatorId: response.operatorId,
    version: `${response.operatorId}-authored-v1`,
    summary: "authored under the escape hatch after a recorded coverage failure",
    seededFrom: [],
    parameterSignature: [
      { name: "profile", kind: "scalarPairArray", description: "authored", minimumLength: 2 },
      { name: "radialSegments", kind: "integer", description: "authored", minimum: 3 },
    ],
    builder,
    countScalars: (parameters) => parameters.profile.length * 2 + 1,
  });
}
