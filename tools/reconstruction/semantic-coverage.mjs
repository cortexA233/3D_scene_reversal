/**
 * Semantic Coverage Manifest.
 *
 * Classifies every renderable geometry, light, and visible environment layer of
 * the Assembled Authored Scene into a declared scene semantic role or an
 * explicitly justified exclusion. Classification is driven by measured world
 * geometry and the reference's own authored placements, never by a source-name
 * allowlist, and coverage is reported by entity count, world surface area, and
 * Normative Scene Capture pixels so no single dimension can hide an omission.
 *
 * The manifest is an independent accounting, not a restatement of the Scene
 * Recipe: it re-reads the reference and then checks that every authored
 * placement has a recipe entity whose anchor and Target AABB Extent match, and
 * that no recipe entity exists without reference evidence.
 */

import { readAuthoredPlacements } from "./scene-placements.mjs";

export const COVERAGE_SCHEMA_VERSION = "semantic-coverage-manifest-v2";

export const COVERAGE_CLASSES = Object.freeze([
  "identity-bearing",
  "horizon",
  "distributed-cover",
  "geography",
  "excluded",
]);

/** An item is blocking only when it actually contributes visible pixels. */
export const VISIBILITY_PIXEL_FLOOR = 1;

/** How closely a recipe entity must restate its authored placement. */
export const CORRESPONDENCE_TOLERANCE = Object.freeze({ anchor: 0.011, extent: 0.011 });

function span(bounds, axis) {
  return bounds.max[axis] - bounds.min[axis];
}

/**
 * Geography is identified by measured extent: the sky shell, the ocean plane,
 * and the terrain surface are the only single renderables whose footprint spans
 * the whole island or more.
 */
function geographyRole(item, world) {
  if (!item.bounds || item.instanceCount > 1) return null;
  const spanX = span(item.bounds, 0);
  const spanZ = span(item.bounds, 2);
  const height = span(item.bounds, 1);
  const islandSpan = world.coastExtent[0] * 2;
  if (spanX < islandSpan * 1.1 || spanZ < islandSpan * 1.1) return null;
  if (height <= 1) return "ocean-appearance-surface";
  if (spanX >= islandSpan * 10) return "sky";
  return "terrain";
}

export function buildSemanticCoverageManifest(inventory, recipe) {
  const { world } = recipe;
  const { placements, members } = readAuthoredPlacements(inventory);
  const recipeEntities = new Map(
    recipe.entities.map((entity) => [entity.semanticId, entity]),
  );
  const populationCounts = new Map(
    recipe.populations.map((population) => [population.count, population.coverId]),
  );

  const classified = [];
  const unclassified = [];
  const accountedPlacements = new Set();

  for (const item of inventory.items) {
    const visible = item.visible && item.overviewPixels >= VISIBILITY_PIXEL_FLOOR;
    const placementKey = members.get(item.path);
    if (placementKey) {
      accountedPlacements.add(placementKey);
      const placement = placements.find((row) => row.key === placementKey);
      classified.push({
        ...item,
        coverageClass: placement.group === "horizon" ? "horizon" : "identity-bearing",
        semanticId: placement.semanticId,
        kind: placement.kind,
        visible,
      });
      continue;
    }
    if (!item.bounds) {
      classified.push({
        ...item,
        coverageClass: "excluded",
        reason:
          "empty renderable with no world geometry and no visible contribution in the Normative Scene Capture",
        visible,
      });
      continue;
    }
    if (item.instanceCount > 1 || item.type === "Sprite") {
      const coverId = populationCounts.get(item.instanceCount) ??
        (item.type === "Sprite" ? "cover/sky-clouds" : null);
      if (coverId) {
        classified.push({ ...item, coverageClass: "distributed-cover", coverId, visible });
        continue;
      }
    }
    const role = geographyRole(item, world);
    if (role) {
      classified.push({ ...item, coverageClass: "geography", role, visible });
      continue;
    }
    unclassified.push({ ...item, visible });
  }

  const correspondence = [];
  for (const placement of placements) {
    const entity = recipeEntities.get(placement.semanticId);
    if (!entity) {
      correspondence.push({
        semanticId: placement.semanticId,
        kind: placement.kind,
        failure: "the Scene Recipe has no entity for this authored placement",
      });
      continue;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(entity.anchor[axis] - placement.anchor[axis]) > CORRESPONDENCE_TOLERANCE.anchor) {
        correspondence.push({
          semanticId: placement.semanticId,
          failure: `Scene Placement Anchor axis ${axis} differs from the reference by ${(
            entity.anchor[axis] - placement.anchor[axis]
          ).toFixed(4)}`,
        });
      }
      if (Math.abs(entity.extent[axis] - placement.extent[axis]) > CORRESPONDENCE_TOLERANCE.extent) {
        correspondence.push({
          semanticId: placement.semanticId,
          failure: `Target AABB Extent axis ${axis} differs from the reference by ${(
            entity.extent[axis] - placement.extent[axis]
          ).toFixed(4)}`,
        });
      }
    }
  }
  const authoredIds = new Set(placements.map((placement) => placement.semanticId));
  const inventedEntities = recipe.entities.filter(
    (entity) => !authoredIds.has(entity.semanticId),
  );

  const totals = {
    renderables: inventory.items.length,
    worldSurfaceArea: inventory.totals.worldSurfaceArea,
    coveredPixels: inventory.totals.coveredPixels,
    authoredPlacements: placements.length,
  };
  const byClass = Object.fromEntries(
    COVERAGE_CLASSES.map((coverageClass) => {
      const rows = classified.filter((item) => item.coverageClass === coverageClass);
      return [
        coverageClass,
        {
          count: rows.length,
          worldSurfaceArea: Number(
            rows.reduce((sum, item) => sum + item.worldSurfaceArea, 0).toFixed(3),
          ),
          overviewPixels: rows.reduce((sum, item) => sum + item.overviewPixels, 0),
        },
      ];
    }),
  );

  // Every local light in the assembled scene must have a Semantic Light. The
  // three global lights belong to the Environment Recipe instead.
  const globalLights = inventory.lights.filter((light) =>
    ["DirectionalLight", "HemisphereLight", "AmbientLight"].includes(light.type),
  );
  const localLights = inventory.lights.filter((light) => !globalLights.includes(light));
  const unmatchedLights = localLights.filter(
    (light) =>
      !recipe.semanticLights.some(
        (semantic) =>
          Math.hypot(
            semantic.position[0] - light.position[0],
            semantic.position[1] - light.position[1],
            semantic.position[2] - light.position[2],
          ) <= 0.02,
      ),
  );

  const visibleUnclassified = unclassified.filter((item) => item.visible);
  const kindCounts = {};
  for (const placement of placements) {
    kindCounts[placement.kind] = (kindCounts[placement.kind] ?? 0) + 1;
  }

  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    authority: inventory.authority,
    capture: inventory.capture,
    totals,
    byClass,
    coverage: {
      countFraction: Number((classified.length / Math.max(1, totals.renderables)).toFixed(6)),
      areaFraction: Number(
        (
          classified.reduce((sum, item) => sum + item.worldSurfaceArea, 0) /
          Math.max(1e-6, totals.worldSurfaceArea)
        ).toFixed(6),
      ),
      pixelFraction: Number(
        (
          classified.reduce((sum, item) => sum + item.overviewPixels, 0) /
          Math.max(1, totals.coveredPixels)
        ).toFixed(6),
      ),
    },
    authoredKinds: Object.fromEntries(
      Object.entries(kindCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
    lights: {
      referenceCount: inventory.lights.length,
      referenceGlobalLights: globalLights.length,
      referenceLocalLights: localLights.length,
      recipeSemanticLightCount: recipe.semanticLights.length,
      unmatchedLocalLights: unmatchedLights.length,
      unmatchedLocalLightPositions: unmatchedLights.map((light) => light.position),
    },
    identityCorrespondence: {
      authoredPlacements: placements.length,
      recipeEntities: recipe.entities.length,
      failures: correspondence,
      inventedEntities: inventedEntities.map((entity) => entity.semanticId),
    },
    unclassified: unclassified.map((item) => ({
      path: item.path,
      type: item.type,
      visible: item.visible,
      overviewPixels: item.overviewPixels,
      worldSurfaceArea: item.worldSurfaceArea,
      triangles: item.triangles,
      instanceCount: item.instanceCount,
      bounds: item.bounds,
    })),
    blocking: {
      visibleUnclassifiedCount: visibleUnclassified.length,
      visibleUnclassifiedPixels: visibleUnclassified.reduce(
        (sum, item) => sum + item.overviewPixels,
        0,
      ),
      correspondenceFailureCount: correspondence.length,
      inventedEntityCount: inventedEntities.length,
      unmatchedLocalLightCount: unmatchedLights.length,
    },
    classified,
  };
}

export function coverageFailures(manifest) {
  const failures = [];
  if (manifest.blocking.visibleUnclassifiedCount > 0) {
    failures.push(
      `${manifest.blocking.visibleUnclassifiedCount} visible reference renderables are unclassified ` +
        `(${manifest.blocking.visibleUnclassifiedPixels} overview pixels)`,
    );
  }
  if (manifest.blocking.correspondenceFailureCount > 0) {
    failures.push(
      `${manifest.blocking.correspondenceFailureCount} authored placements have no matching Scene Recipe entity`,
    );
  }
  if (manifest.blocking.inventedEntityCount > 0) {
    failures.push(
      `${manifest.blocking.inventedEntityCount} Scene Recipe entities have no reference evidence`,
    );
  }
  if (manifest.blocking.unmatchedLocalLightCount > 0) {
    failures.push(
      `${manifest.blocking.unmatchedLocalLightCount} assembled-scene local lights have no Semantic Light`,
    );
  }
  return failures;
}
