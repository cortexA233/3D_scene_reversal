import { qualityBaselineDefinition } from "../evaluation/visual-metrics.mjs";

/**
 * Read the geometry hard thresholds each unit was actually accepted under.
 *
 * Object-specific baselines live in this repository, which owns them, and they
 * accumulated four different shapes as the baseline versions grew. This
 * normalizes all four onto the metric paths `aggregateGeometryEvidence`
 * produces, without editing any frozen report or baseline.
 */
const STAGE_1_KEY_TO_PATH = Object.freeze({
  meanSilhouetteIouMinimum: ["geometry.silhouette.meanIou", ">="],
  worstViewIouMinimum: ["geometry.silhouette.worstViewIou", ">="],
  meanSymmetricEdgeDistancePixelsMaximum: [
    "geometry.silhouette.meanEdgeDistancePixels",
    "<=",
  ],
  edgeDistanceP95PixelsMaximum: ["geometry.silhouette.edgeDistanceP95Pixels", "<="],
  depthMaeMaximum: ["geometry.depth.mae", "<="],
  depthP95Maximum: ["geometry.depth.p95", "<="],
});

export const GEOMETRY_METRIC_PATHS = Object.freeze([
  "geometry.bounds.maxAxisRelativeError",
  "geometry.bounds.bottomAnchorErrorCanonical",
  "geometry.silhouette.meanIou",
  "geometry.silhouette.worstViewIou",
  "geometry.silhouette.meanEdgeDistancePixels",
  "geometry.silhouette.edgeDistanceP95Pixels",
  "geometry.depth.mae",
  "geometry.depth.p95",
]);

function commonBoundsThresholds() {
  const { common } = qualityBaselineDefinition();
  return [
    ["geometry.bounds.maxAxisRelativeError", "<=", common.maxAxisRelativeErrorMaximum],
    [
      "geometry.bounds.bottomAnchorErrorCanonical",
      "<=",
      common.bottomAnchorErrorCanonicalMaximum,
    ],
  ];
}

function fromStage1Map(thresholds) {
  return Object.entries(thresholds)
    .filter(([key]) => key in STAGE_1_KEY_TO_PATH)
    .map(([key, threshold]) => [...STAGE_1_KEY_TO_PATH[key], threshold]);
}

function fromHardList(hard) {
  return hard
    .filter((entry) => entry.path.startsWith("geometry."))
    .map((entry) => [entry.path, entry.operator, entry.threshold]);
}

/**
 * @returns {Map<string, {operator: string, threshold: number, source: string}>}
 */
export function geometryThresholdsFor({ objectId, qualityBaseline }) {
  const records = [];
  let source = null;

  if (Array.isArray(qualityBaseline.hard)) {
    records.push(...fromHardList(qualityBaseline.hard));
    source = qualityBaseline.version ?? "hard-list";
  } else if (Array.isArray(qualityBaseline.geometry?.hard)) {
    records.push(...fromHardList(qualityBaseline.geometry.hard));
    source = qualityBaseline.geometry.version ?? "geometry-hard-list";
  } else if (qualityBaseline.geometry?.thresholds) {
    records.push(...fromStage1Map(qualityBaseline.geometry.thresholds));
    records.push(...commonBoundsThresholds());
    source = qualityBaseline.geometry.version ?? "geometry-thresholds";
  } else if (qualityBaseline.geometry?.[objectId]) {
    records.push(...fromStage1Map(qualityBaseline.geometry[objectId]));
    records.push(
      ...(qualityBaseline.common
        ? [
            [
              "geometry.bounds.maxAxisRelativeError",
              "<=",
              qualityBaseline.common.maxAxisRelativeErrorMaximum,
            ],
            [
              "geometry.bounds.bottomAnchorErrorCanonical",
              "<=",
              qualityBaseline.common.bottomAnchorErrorCanonicalMaximum,
            ],
          ]
        : commonBoundsThresholds()),
    );
    source = qualityBaseline.version ?? "stage-1-object-map";
  } else {
    throw new Error(`unrecognised quality-baseline shape for ${objectId}`);
  }

  const thresholds = new Map();
  for (const [path, operator, threshold] of records) {
    if (!Number.isFinite(threshold)) continue;
    // The first record for a path wins: a unit's own versioned baseline is more
    // specific than the shared bounds fallback appended after it.
    if (!thresholds.has(path)) {
      thresholds.set(path, { operator, threshold, source });
    }
  }
  const missing = GEOMETRY_METRIC_PATHS.filter((path) => !thresholds.has(path));
  if (missing.length > 0) {
    throw new Error(
      `${objectId} quality baseline has no threshold for ${missing.join(", ")}`,
    );
  }
  return thresholds;
}

export function getMetric(aggregate, path) {
  return path.split(".").reduce((value, key) => value?.[key], aggregate);
}
