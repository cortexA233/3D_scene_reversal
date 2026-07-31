/**
 * Which way is better for each geometry metric. Declared once so the bracket, the
 * gate, and any report agree on the sense of a comparison.
 */
export const GEOMETRY_METRIC_DIRECTION = Object.freeze({
  "geometry.bounds.maxAxisRelativeError": "<=",
  "geometry.bounds.bottomAnchorErrorCanonical": "<=",
  "geometry.silhouette.meanIou": ">=",
  "geometry.silhouette.worstViewIou": ">=",
  "geometry.silhouette.meanEdgeDistancePixels": "<=",
  "geometry.silhouette.edgeDistanceP95Pixels": "<=",
  "geometry.depth.mae": "<=",
  "geometry.depth.p95": "<=",
});

export function satisfies({ value, operator, threshold }) {
  if (!Number.isFinite(value)) return false;
  return operator === ">=" ? value >= threshold : value <= threshold;
}
