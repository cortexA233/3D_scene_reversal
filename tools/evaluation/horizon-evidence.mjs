import * as THREE from "three";

import {
  accumulateMeshTriangles,
  createProfileAccumulator,
} from "./horizon-profile.mjs";

/**
 * Horizon Group and Horizon Profile evidence.
 *
 * Each authored distant-mountain group is an Identity-bearing Scene Entity with
 * its own placement, bounds, orientation, depth interval, and silhouette, and
 * all groups jointly determine the 360-degree Horizon Profile measured from the
 * fixed Scene Anchor. Per-group and per-azimuth results are kept separately so a
 * good average skyline cannot hide one missing landmark peak.
 */

export const HORIZON_SCHEMA = "horizon-comparison-v1";

/**
 * Backside surface distance stays diagnostic: for a distant group, visible
 * surface, depth, and angular horizon evidence express the authored result far
 * better than the far side nobody can see.
 */
export const BACKSIDE_EVIDENCE = "diagnostic";

export function profileFromGeometry(root, anchor, bins) {
  const accumulator = createProfileAccumulator(anchor, bins);
  const point = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh) return;
    accumulateMeshTriangles(child, accumulator, (local) => {
      point.set(local[0], local[1], local[2]).applyMatrix4(child.matrixWorld);
      return [point.x, point.y, point.z];
    });
  });
  return accumulator.result();
}

function statistics(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return {
    count: values.length,
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    rmse: Number(
      Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length).toFixed(6),
    ),
    p50: Number(percentile(0.5).toFixed(6)),
    p95: Number(percentile(0.95).toFixed(6)),
    max: Number(sorted.at(-1).toFixed(6)),
  };
}

export function compareHorizonProfiles(reference, candidate, bins) {
  const errors = [];
  const rows = [];
  let missingBins = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const left = reference[bin];
    const right = candidate[bin];
    const azimuth = (bin / bins) * Math.PI * 2;
    if (left === null && right === null) continue;
    if (left === null || right === null) {
      missingBins += 1;
      rows.push({ azimuth, error: null, referencePresent: left !== null });
      continue;
    }
    const error = Math.abs(left - right);
    errors.push(error);
    rows.push({ azimuth, error, referencePresent: true });
  }
  return {
    bins,
    coverageBins: rows.length,
    missingBins,
    angularError: statistics(errors),
    worstAzimuths: rows
      .filter((row) => row.error !== null)
      .sort((a, b) => b.error - a.error)
      .slice(0, 8)
      .map((row) => ({
        azimuthDegrees: Number(((row.azimuth * 180) / Math.PI).toFixed(2)),
        errorDegrees: Number(((row.error * 180) / Math.PI).toFixed(4)),
      })),
  };
}

/**
 * @param {object} referenceEvidence measured horizon evidence
 * @param {Map<string, object>} candidateGroups semanticId -> generated root
 * @param {Map<string, object>} referenceGroups semanticId -> reference row
 */
export function compareHorizon({
  referenceEvidence,
  referenceGroups,
  candidateGroups,
  anchor,
  overviewPosition,
}) {
  const bins = referenceEvidence.bins;
  const groupRows = [];
  const candidateCombined = new Array(bins).fill(Number.NEGATIVE_INFINITY);

  for (const [semanticId, reference] of referenceGroups) {
    const candidate = candidateGroups.get(semanticId);
    if (!candidate) {
      groupRows.push({ semanticId, present: false });
      continue;
    }
    const measured = profileFromGeometry(candidate.object, anchor, bins);
    measured.profile.forEach((value, bin) => {
      if (value !== null && value > candidateCombined[bin]) candidateCombined[bin] = value;
    });

    const bounds = new THREE.Box3().setFromObject(candidate.object);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const anchorError = Math.hypot(
      centre.x - reference.anchor[0],
      bounds.min.y - reference.anchor[1],
      centre.z - reference.anchor[2],
    );
    const extentError = Math.max(
      ...[size.x, size.y, size.z].map((value, axis) =>
        Math.abs(value - reference.extent[axis]),
      ),
    );
    const profileComparison = compareHorizonProfiles(
      reference.profile,
      measured.profile,
      bins,
    );
    const depthError = reference.depthInterval && measured.depthInterval
      ? Math.max(
          Math.abs(reference.depthInterval[0] - measured.depthInterval[0]),
          Math.abs(reference.depthInterval[1] - measured.depthInterval[1]),
        )
      : null;

    // Visible area from the authored overview, as the solid angle the group
    // subtends: this is what overlap ordering competes for.
    const visibleAngle = reference.profile.reduce(
      (sum, value) => sum + (value === null ? 0 : Math.max(0, value)),
      0,
    );
    const candidateVisibleAngle = measured.profile.reduce(
      (sum, value) => sum + (value === null ? 0 : Math.max(0, value)),
      0,
    );

    groupRows.push({
      semanticId,
      present: true,
      anchorError,
      extentError,
      depthInterval: measured.depthInterval,
      depthError,
      visibleAngle,
      candidateVisibleAngle,
      visibleAngleRelativeError:
        visibleAngle > 0 ? Math.abs(candidateVisibleAngle - visibleAngle) / visibleAngle : null,
      silhouetteError: profileComparison.angularError,
      overviewDistance: Math.hypot(
        centre.x - overviewPosition[0],
        centre.z - overviewPosition[2],
      ),
    });
  }

  // Overlap ordering: front-to-back rank from the authored overview.
  const rank = (rows, key) =>
    new Map(
      [...rows]
        .filter((row) => row[key] !== undefined)
        .sort((a, b) => a[key] - b[key])
        .map((row, index) => [row.semanticId, index]),
    );
  const referenceOrder = rank(
    [...referenceGroups.entries()].map(([semanticId, row]) => ({
      semanticId,
      overviewDistance: Math.hypot(
        row.anchor[0] - overviewPosition[0],
        row.anchor[2] - overviewPosition[2],
      ),
    })),
    "overviewDistance",
  );
  const candidateOrder = rank(groupRows.filter((row) => row.present), "overviewDistance");
  const orderErrors = [...referenceOrder.keys()]
    .filter((semanticId) => candidateOrder.has(semanticId))
    .map((semanticId) => Math.abs(referenceOrder.get(semanticId) - candidateOrder.get(semanticId)));

  const present = groupRows.filter((row) => row.present);
  return {
    schemaVersion: HORIZON_SCHEMA,
    anchor,
    backsideSurfaceDistance: BACKSIDE_EVIDENCE,
    groups: {
      reference: referenceGroups.size,
      candidate: candidateGroups.size,
      missing: groupRows.filter((row) => !row.present).map((row) => row.semanticId),
      anchorError: statistics(present.map((row) => row.anchorError)),
      extentError: statistics(present.map((row) => row.extentError)),
      depthError: statistics(present.map((row) => row.depthError).filter(Number.isFinite)),
      visibleAngleRelativeError: statistics(
        present
          .map((row) => row.visibleAngleRelativeError)
          .filter((value) => Number.isFinite(value)),
      ),
      silhouetteError: statistics(
        present
          .map((row) => row.silhouetteError?.mean)
          .filter((value) => Number.isFinite(value)),
      ),
      worstSilhouette: present
        .filter((row) => Number.isFinite(row.silhouetteError?.p95))
        .sort((a, b) => b.silhouetteError.p95 - a.silhouetteError.p95)
        .slice(0, 6)
        .map((row) => ({
          semanticId: row.semanticId,
          p95Degrees: Number(((row.silhouetteError.p95 * 180) / Math.PI).toFixed(4)),
        })),
      overlapOrderError: statistics(orderErrors),
    },
    profile: compareHorizonProfiles(
      referenceEvidence.combined,
      candidateCombined.map((value) => (Number.isFinite(value) ? value : null)),
      bins,
    ),
  };
}
