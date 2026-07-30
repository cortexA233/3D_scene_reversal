/**
 * Declared reference-only damage applied to the reference's own scene graph.
 *
 * The fixed-camera and native-appearance layers gate rendered evidence, so their
 * thresholds have to come from damage that is rendered too. These controls
 * mutate the Assembled Authored Scene's placement roots, terrain, and materials,
 * the frame is captured through the frozen cameras, and the mutation is undone.
 * Nothing here approximates damage in image space: a control that dimmed pixels
 * instead of changing a material, or shifted a mask instead of moving an object,
 * would produce a threshold that means something different from the world-space
 * layers' thresholds, which is exactly what ticket 01 forbids.
 *
 * The damage brackets are the same ones `scene-perturbations.mjs` declares for
 * the world-space layers — 0.15 units, 1 per cent, 0.02 radians for mild; 12
 * units, 45 per cent, 0.9 radians for severe — so "mild" and "severe" mean the
 * same thing in every layer of the stack. Applying them in scene space rather
 * than to a measured observation is the only difference.
 *
 * No control reads the candidate, and this module imports nothing: the
 * mechanics live in the browser harness, which owns the three.js objects, and
 * the declarations stay loadable in Node so the bracket can be checked without
 * a browser.
 */

export const SCENE_GRAPH_PERTURBATION_SCHEMA = "scene-graph-perturbations-v1";

/**
 * Which capture a control needs. Geometry controls skip the lit-RGB composer
 * pass and appearance controls need only that pass, which is most of what makes
 * the calibration affordable: a full pass capture of all six cameras is about
 * ten minutes of SwiftShader time.
 */
export const CAPTURE_KINDS = Object.freeze(["geometry", "appearance"]);

const compose = (restores) => () => {
  // Reverse order, so overlapping mutations unwind the way they were applied.
  for (let index = restores.length - 1; index >= 0; index -= 1) restores[index]();
};

/**
 * The groups whose placement roots carry authored identity.
 *
 * `horizon` is included for the same reason the world-space bracket includes it:
 * the frozen baseline already records that its mild controls "apply to every
 * entity including the 1.4 km horizon groups". Leaving the ridges undamaged here
 * would mean the two layers' brackets no longer describe the same damage, which
 * is the one thing reusing the world-space values was meant to guarantee.
 *
 * `geography` is the terrain and ocean planes rather than authored placements, so
 * it has its own control. `sky` and `cloud` are excluded from the auxiliary
 * passes entirely.
 */
const PLACEMENT_GROUPS = Object.freeze([
  "structures",
  "bridges",
  "plazas",
  "paths",
  "rocks",
  "decorations",
  "vegetation",
  "wildlife",
  "cover",
  "horizon",
]);

const allPlacementRoots = (context) =>
  PLACEMENT_GROUPS.flatMap((group) => context.rootsIn(group));

export const SCENE_GRAPH_CONTROLS = Object.freeze([
  {
    id: "identity",
    class: "identity",
    needs: ["geometry", "appearance"],
    note: "Renders the untouched reference against itself, so the mild bracket starts at the harness's own repeatability rather than at an assumed zero.",
    apply: () => () => {},
  },

  // ── Mild: variations a faithful-but-different reconstruction produces ─────
  {
    id: "translate-0.15",
    class: "mild",
    needs: ["geometry"],
    apply: (context) =>
      context.ops.translateWorld(allPlacementRoots(context), [0.15, 0, 0.1]),
  },
  {
    id: "extent-1pct",
    class: "mild",
    needs: ["geometry"],
    apply: (context) => context.ops.scaleBy(allPlacementRoots(context), 1.01),
  },
  {
    id: "yaw-0.02",
    class: "mild",
    needs: ["geometry"],
    apply: (context) => context.ops.rotateY(allPlacementRoots(context), 0.02),
  },
  {
    id: "albedo-1pct",
    class: "mild",
    needs: ["appearance"],
    note: "A one per cent albedo shift across every authored material. Below the just-noticeable difference, so it belongs in the same bracket as a one per cent extent error.",
    apply: (context) => context.ops.scaleMaterialColour(context.allMaterials(), 1.01),
  },

  // ── Intermediate: measured, but in neither bracket ────────────────────────
  {
    id: "translate-1.2",
    class: "intermediate",
    needs: ["geometry"],
    apply: (context) =>
      context.ops.translateWorld(allPlacementRoots(context), [1.2, 0, -0.8]),
  },
  {
    id: "extent-8pct",
    class: "intermediate",
    needs: ["geometry"],
    apply: (context) => context.ops.scaleBy(allPlacementRoots(context), 1.08),
  },
  {
    id: "albedo-8pct",
    class: "intermediate",
    needs: ["appearance"],
    apply: (context) => context.ops.scaleMaterialColour(context.allMaterials(), 1.08),
  },

  // ── Severe: damage an Exact-ish Reconstruction must be rejected for ───────
  {
    id: "translate-12",
    class: "severe",
    needs: ["geometry"],
    detects: [
      "group silhouette IoU",
      "worst group silhouette IoU",
      "group contour distance p95",
      "worst group contour distance",
      "group depth p95",
      "worst group depth p95",
      "semantic agreement",
      "worst camera semantic agreement",
      "worst semantic confusion fraction",
    ],
    apply: (context) =>
      context.ops.translateWorld(allPlacementRoots(context), [12, 0, -9]),
  },
  {
    id: "extent-45pct",
    class: "severe",
    needs: ["geometry"],
    detects: [
      "group silhouette IoU",
      "worst group silhouette IoU",
      "group contour distance p95",
      "worst group contour distance",
      "semantic agreement",
      "worst camera semantic agreement",
    ],
    apply: (context) => context.ops.scaleBy(allPlacementRoots(context), 1.45),
  },
  {
    id: "yaw-0.9",
    class: "severe",
    needs: ["geometry"],
    note: "Every placement turned on its own footprint. Rotation is what world-normal evidence is for: the silhouette of a squarish mass barely moves while every wall faces somewhere else. It applies to every root rather than to the buildings alone so that it differs from the mild yaw in magnitude and in nothing else, which is what a bracket is.",
    detects: [
      "group world normal p95",
      "worst group world normal p95",
      "worst group contour distance",
    ],
    apply: (context) => context.ops.rotateY(allPlacementRoots(context), 0.9),
  },
  {
    id: "delete-structures",
    class: "severe",
    needs: ["geometry"],
    note: "The village removed. Its pixels become whatever stands behind it, which is what semantic confusion names.",
    // Scope has to match how a metric is weighted. A group-weighted mean cannot be
    // asked to move by damage to one group out of eleven, and a pixel-weighted mean
    // cannot be asked to move by damage to one per cent of the pixels: measured,
    // deleting the whole village left semantic agreement at 0.9912, better than the
    // 0.9894 a mild 0.02-radian yaw of everything produces. Because
    // `selectThreshold` takes the best severe result, one such claim would set the
    // limit for every strong control too and demote the metric. The failure a
    // deleted village is meant to trip is the per-group silhouette and the semantic
    // confusion it creates, and those it trips decisively — structures fall to an
    // IoU of 0.029 against a mild worst of 0.418.
    detects: ["worst group silhouette IoU", "worst semantic confusion fraction"],
    apply: (context) => context.ops.hide(context.rootsIn("structures")),
  },
  {
    id: "collapse-vegetation",
    class: "severe",
    needs: ["geometry"],
    note: "Canopies shrunk to two-fifths, the sparse-sticks failure human review already described. One group, so it claims only worst-case metrics.",
    detects: ["worst group silhouette IoU", "worst group contour distance"],
    apply: (context) => context.ops.scaleBy(context.rootsIn("vegetation"), 0.4),
  },
  {
    id: "raise-terrain-12",
    class: "severe",
    needs: ["geometry"],
    note: "The same 12 units the geography layer's severe elevation control uses. Geography fills 84 to 86 per cent of every auxiliary frame, so leaving it undamaged would calibrate the largest group against nothing. It is one group, so it claims the worst-case depth metric and the pixel-weighted semantic ones, not the group-weighted means.",
    detects: [
      "worst group depth p95",
      "semantic agreement",
      "worst camera semantic agreement",
    ],
    apply: (context) => context.ops.translateWorld(context.terrainRoots(), [0, 12, 0]),
  },
  {
    id: "wrong-role-palette",
    class: "severe",
    needs: ["appearance"],
    note: "Every material's albedo pushed toward magenta while its pattern, shape, lighting, and post-processing are left alone, so this is appearance damage and nothing else. A base colour multiplies its texture map, which is why a cast reaches every surface: replacing each colour with its own luminance does not, because the authored materials are textured and their base colours are white, so desaturating white is a no-op. Removing the maps instead would have calibrated the layer against having no texture at all, which is the Production Runtime's own legitimate condition, and a textureless candidate would then pass by construction.",
    detects: [
      "appearance DeltaE mean",
      "worst camera appearance DeltaE",
      "material family appearance DeltaE mean",
      "worst material family appearance DeltaE",
    ],
    apply: (context) =>
      context.ops.castMaterialColour(context.allMaterials(), [1.45, 0.55, 1.25]),
  },
  {
    id: "recolour-palm-foliage",
    class: "severe",
    needs: ["appearance"],
    note: "One Material Family made plainly wrong. The global mean barely moves, which is the point: this control exists to prove the per-family metric catches what the global average cannot.",
    detects: ["worst material family appearance DeltaE"],
    apply: (context) =>
      context.ops.setMaterialColour(context.materialsIn("palm-foliage"), 0xb03a86),
  },
]);

export function controlsNeeding(kind) {
  return SCENE_GRAPH_CONTROLS.filter((control) => control.needs.includes(kind));
}

export function findControl(id) {
  const control = SCENE_GRAPH_CONTROLS.find((entry) => entry.id === id);
  if (!control) {
    throw new Error(
      `no declared scene-graph control is named ${id}; declared: ${SCENE_GRAPH_CONTROLS.map(
        (entry) => entry.id,
      ).join(", ")}`,
    );
  }
  return control;
}

/**
 * Applies a control and returns the single restore function that undoes it.
 * Controls compose their own operations, so this exists to give the harness one
 * shape to call regardless of how many operations a control used.
 */
export function applyControl(control, context) {
  const restore = control.apply(context);
  if (typeof restore === "function") return restore;
  if (Array.isArray(restore)) return compose(restore);
  throw new TypeError(`control ${control.id} did not return a restore function`);
}
