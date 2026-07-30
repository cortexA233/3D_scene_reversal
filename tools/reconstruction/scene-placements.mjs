/**
 * Authored placements.
 *
 * One shared, development-only reading of the Assembled Authored Scene
 * inventory: which renderables belong to one authored placement, what its world
 * anchor and Target AABB Extent are, and which stable Scene Semantic ID it
 * carries. The Scene Recipe builder and the Semantic Coverage Manifest both use
 * this reading, so an entity and its coverage row can never disagree about what
 * the reference contains.
 */

import { familyKey, resolveFamily } from "./scene-families.mjs";

/** The authored container whose direct children are individual placements. */
export const VILLAGE_MARKER = "Authored_Village";
export const WILDLIFE_MARKER = "_Rig";
export const MINIMUM_EXTENT = 0.05;

export function placementToken(value) {
  const rounded = Math.round(value * 10);
  return `${rounded < 0 ? "n" : "p"}${String(Math.abs(rounded)).padStart(4, "0")}`;
}

export function semanticIdFor(group, kind, anchor) {
  return `${group}/${kind}-${placementToken(anchor[0])}-${placementToken(anchor[1])}-${placementToken(anchor[2])}`;
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Number(Math.round(value * factor) / factor);
}

/**
 * Typed Scene Orientation from the assembled world matrix rather than a
 * principal axis. Undirected `axis` folds to a canonical half-turn
 * representative; `radial` carries no yaw at all.
 */
export function orientationFor(declared, evidence) {
  const yaw = round(evidence?.yaw ?? 0, 4);
  if (declared === "radial") return { type: "radial" };
  if (declared === "axis") {
    return { type: "axis", radians: round(((yaw % Math.PI) + Math.PI) % Math.PI, 4) };
  }
  if (declared === "surface-aligned") {
    return { type: "surface-aligned", radians: yaw, supportNormal: [0, 1, 0] };
  }
  return { type: "heading", radians: yaw };
}

export function placementKey(path) {
  const parts = path.split("/");
  const villageIndex = parts.findIndex((part) => part.includes(VILLAGE_MARKER));
  if (villageIndex >= 0 && parts.length > villageIndex + 1) {
    const key = parts.slice(0, villageIndex + 2).join("/");
    return { key, family: familyKey(key) };
  }
  // Suffix, not substring: a limb mesh named "..._Right" contains "_Rig".
  const rigIndex = parts.findIndex((part) => part.endsWith(WILDLIFE_MARKER));
  if (rigIndex >= 0) {
    return { key: parts.slice(0, rigIndex + 1).join("/"), family: "wildlife-rig" };
  }
  return null;
}

const WILDLIFE = Object.freeze({
  kind: "panda",
  group: "wildlife",
  material: "creature-fur",
  orientation: "heading",
});

/**
 * One renderable's semantics, by the same rule the placement resolution uses.
 *
 * Exported because a second resolution is how a family ends up measured against
 * itself wrongly. An authored family lives on the *placement group*, not on the mesh:
 * a palm frond is `PalmTree__palmtree_5__0001/0000:Mesh:Mesh_79036`, so keying off the
 * mesh's own name yields "Mesh" and a wildlife rig's unnamed mesh yields "(unnamed)".
 * A development tool that resolved families per mesh therefore reached 38 per cent of
 * `palm-foliage` and 13 per cent of `creature-fur` and had no way to know.
 */
export function resolveRenderableSemantics(path, extent) {
  const resolved = placementKey(path);
  if (!resolved) return null;
  return resolved.family === "wildlife-rig"
    ? WILDLIFE
    : resolveFamily(resolved.family, extent);
}

/**
 * @returns {{placements: object[], members: Map<string, string>}}
 *   `members` maps each renderable path to its placement key, so coverage can
 *   account for every row without regrouping.
 */
/** Bounded multi-form controls for one Horizon Group. */
export const HORIZON_PEAK_CAP = 8;

function horizonShape(peaks) {
  const bounded = peaks.slice(0, HORIZON_PEAK_CAP);
  return {
    // Peaks carry the ridge line; the lower measured maxima are the foothills
    // that fill the group's silhouette between them.
    peaks: bounded
      .filter((peak) => peak.height >= 0.6)
      .map((peak) => ({ offset: peak.offset, height: peak.height })),
    foothills: bounded
      .filter((peak) => peak.height < 0.6)
      .map((peak) => ({ offset: peak.offset, height: peak.height })),
  };
}

export function readAuthoredPlacements(inventory, horizonEvidence = null) {
  const placements = new Map();
  const members = new Map();
  for (const item of inventory.items) {
    if (!item.bounds) continue;
    const resolved = placementKey(item.path);
    if (!resolved) continue;
    members.set(item.path, resolved.key);

    const placement = placements.get(resolved.key) ?? {
      key: resolved.key,
      family: resolved.family,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
      area: 0,
      triangles: 0,
      overviewPixels: 0,
      dominant: null,
    };
    for (let axis = 0; axis < 3; axis += 1) {
      placement.min[axis] = Math.min(placement.min[axis], item.bounds.min[axis]);
      placement.max[axis] = Math.max(placement.max[axis], item.bounds.max[axis]);
    }
    placement.area += item.worldSurfaceArea;
    placement.triangles += item.triangles;
    placement.overviewPixels += item.overviewPixels;
    if (!placement.dominant || item.worldSurfaceArea > placement.dominant.worldSurfaceArea) {
      placement.dominant = item;
    }
    placements.set(resolved.key, placement);
  }

  const horizonByPath = new Map(
    (horizonEvidence?.groups ?? []).map((group) => [group.path, group]),
  );
  const rows = [...placements.values()].map((placement) => {
    const extent = [0, 1, 2].map((axis) =>
      Math.max(MINIMUM_EXTENT, round(placement.max[axis] - placement.min[axis])),
    );
    const anchor = [
      round((placement.min[0] + placement.max[0]) / 2),
      round(placement.min[1]),
      round((placement.min[2] + placement.max[2]) / 2),
    ];
    const semantics =
      placement.family === "wildlife-rig" ? WILDLIFE : resolveFamily(placement.family, extent);
    const horizon = horizonByPath.get(placement.key);
    return {
      ...placement,
      anchor,
      extent,
      kind: semantics.kind,
      group: semantics.group,
      materialFamily: semantics.material,
      orientation: orientationFor(semantics.orientation, placement.dominant?.orientation),
      semanticId: semanticIdFor(semantics.group, semantics.kind, anchor),
      shape: horizon ? horizonShape(horizon.peaks) : undefined,
    };
  });

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.semanticId)) {
      throw new Error(
        `two authored placements resolve to the same Scene Semantic ID: ${row.semanticId}`,
      );
    }
    seen.add(row.semanticId);
  }
  return {
    placements: rows.sort((a, b) => (a.semanticId < b.semanticId ? -1 : 1)),
    members,
  };
}
