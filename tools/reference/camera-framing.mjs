import { deepFreeze } from "./reference-value.mjs";

/**
 * Auxiliary Camera Framing Contract.
 *
 * The frozen evaluation camera set exists to measure the island. A camera can
 * only do that if the island is actually present in its frame, and two pieces
 * of the reference's own environment bound where such a camera may stand:
 *
 *   - Linear fog saturates every fragment past its far plane to the fog colour.
 *     A camera standing farther from the subject than the fog reaches records
 *     fog, not geometry, however correct the geometry is.
 *   - The reference's cloud sprites occupy a sky shell with an unpopulated
 *     core. A camera inside the populated annulus stands among the sprites.
 *
 * Both bounds come from reference-only evidence: the Scene Render Contract's
 * fog, which is machine-verified against the reference source, and the sprite
 * bounds of the Assembled Authored Scene.
 *
 * These are necessary conditions that can be checked statically from a frozen
 * camera set. They are not sufficient: the binding evidence that a camera
 * frames the island is the measured subject coverage of an actual reference
 * observation, which `measureSubjectCoverage` reads from reference pixels only.
 */
const CONTRACT = {
  schemaVersion: "auxiliary-camera-framing-v1",
  /**
   * Entity groups excluded from the framing subject. This is the same principle
   * the auxiliary passes already apply when they drop the sky shell and the
   * cloud sprites: content that fills every frame for both subjects cannot
   * carry island signal, and here it additionally drags the camera out of the
   * atmosphere.
   *
   * `horizon` is the distant ridge backdrop. It already has a dedicated
   * measurement, the 360-degree world-space Horizon Profile taken from the
   * fixed Scene Anchor, so framing the auxiliary cameras around it buys nothing
   * and costs the whole island. Its 16 ridges reach +/-1400 to 1880 units while
   * the island reaches +/-280, so they alone set the standoff.
   *
   * The environment layers need no exclusion rule because they are not
   * entities: the terrain and ocean planes, the sky dome, and the cloud sprites
   * are declared by the Environment Recipe, the Terrain Program, and the
   * Distributed Scene Cover populations respectively.
   */
  subjectExclusions: ["horizon"],
  atmosphere: {
    /**
     * The farthest corner of the framing subject must sit within this fraction
     * of the fog's far plane, leaving headroom so the subject is legible rather
     * than merely inside the fog at all.
     */
    maximumSubjectDistanceFraction: 0.8,
  },
  cloudShell: {
    /**
     * A camera and its subject must both stay inside the unpopulated core of
     * the sky shell, measured as a normalised radius from the shell centre. The
     * core is an ellipse and therefore convex, so both endpoints being inside
     * it puts the whole line of sight inside it too.
     *
     * Sprite quads are wide enough that a sprite centred just outside this
     * radius still overlaps the core, so this bounds where the camera stands
     * among the population rather than promising an empty sky.
     */
    maximumNormalisedRadius: 0.25,
  },
  coverage: {
    /**
     * Every auxiliary camera must carry at least this share of the island
     * signal that the authored overview carries. The authored overview is the
     * reference's own statement of a composition that frames the island, which
     * makes it the one non-arbitrary yardstick available.
     *
     * The factor is 4 rather than 2. The authored overview is a composed
     * three-quarter hero view; a mechanically derived orbit looks at the island
     * from outside and so necessarily includes more open sea, and it cannot be
     * expected to match a hand-chosen composition. A factor of 4 still rejects
     * the defect this criterion exists for by an order of magnitude: the
     * cameras ADR-0049 replaced scored 0.0096 to 0.031, while the replacements
     * score 0.40 to 1.61.
     *
     * This bound was set to 0.5 before the replacement cameras were measured
     * and revised once they were. That revision is legitimate because this
     * contract constrains the reference observation alone — `measureSubjectCoverage`
     * reads reference pixels only — so no candidate result can move it and
     * loosening it cannot let a bad candidate pass. A candidate-facing gate
     * threshold could not be revised this way.
     */
    minimumShareOfAuthoredOverview: 0.25,
    /**
     * No content group that the authored overview can see may be entirely
     * absent from an auxiliary camera. A group at zero pixels yields an
     * intersection-over-union of zero whatever the candidate does, which
     * reports absence as though it were error.
     */
    requireEveryGroupObservable: true,
  },
};

deepFreeze(CONTRACT);

export function createAuxiliaryFramingContract() {
  return CONTRACT;
}

function round(value) {
  const result = Number(value.toFixed(9));
  return Object.is(result, -0) ? 0 : result;
}

function emptyBounds() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function growBounds(bounds, itemBounds) {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], itemBounds.min[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], itemBounds.max[axis]);
  }
}

function sealBounds(bounds, what) {
  if (!bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite)) {
    throw new Error(`${what} has no readable world-space bounds`);
  }
  return {
    min: bounds.min.map(round),
    max: bounds.max.map(round),
  };
}

/**
 * The volume the auxiliary cameras must frame, measured from the Scene Recipe's
 * reference-measured entity layout by dropping the declared backdrop groups.
 *
 * The Recipe is used rather than the raw inventory because it is the committed,
 * reference-measured, semantic record of world placement, and because the
 * per-node classification the inventory would need is a generated artifact that
 * is not committed.
 */
export function measureFramingSubject({ recipe, contract = CONTRACT }) {
  if (!recipe || !Array.isArray(recipe.entities)) {
    throw new TypeError("recipe must expose an entities array");
  }
  const excluded = new Set(contract.subjectExclusions);
  const bounds = emptyBounds();
  const groups = new Map();
  let itemCount = 0;
  for (const entity of recipe.entities) {
    if (typeof entity.group !== "string") {
      throw new Error(`recipe entity ${entity.semanticId} declares no group`);
    }
    if (excluded.has(entity.group)) continue;
    growBounds(bounds, {
      min: entity.anchor.map((value, axis) => value - entity.extent[axis] / 2),
      max: entity.anchor.map((value, axis) => value + entity.extent[axis] / 2),
    });
    groups.set(entity.group, (groups.get(entity.group) ?? 0) + 1);
    itemCount += 1;
  }
  if (itemCount === 0) {
    throw new Error("framing subject excluded every authored entity");
  }
  return {
    ...sealBounds(bounds, "framing subject"),
    itemCount,
    groups: [...groups.keys()].sort(),
  };
}

/**
 * The sky shell the cloud sprites populate, read from the Distributed Scene
 * Cover population that measured them. `innermostPopulatedRadius` is where the
 * population actually begins, which is what the contract's core radius has to
 * respect.
 */
export function measureCloudShell({ recipe }) {
  if (!recipe || !Array.isArray(recipe.populations)) {
    throw new TypeError("recipe must expose a populations array");
  }
  const cloud = recipe.populations.find((population) => population.kind === "cloud");
  if (!cloud) throw new Error("recipe declares no cloud population to measure");
  const { region } = cloud;
  if (region.shape !== "sky-shell") {
    throw new Error(`cloud population is not a sky shell but a ${region.shape}`);
  }
  if (!region.radii.every((radius) => Number.isFinite(radius) && radius > 0)) {
    throw new Error("cloud shell is degenerate in x or z");
  }
  return {
    center: [...region.center],
    radii: [...region.radii],
    heightRange: [region.minHeight, region.maxHeight],
    spriteCount: cloud.count,
    innermostPopulatedRadius: region.innerRadius,
  };
}

/** Normalised elliptical radius of a world point within the sky shell. */
export function normalisedShellRadius(point, shell) {
  return round(
    Math.hypot(
      (point[0] - shell.center[0]) / shell.radii[0],
      (point[2] - shell.center[1]) / shell.radii[1],
    ),
  );
}

function boundsCorners({ min, max }) {
  const corners = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/** Distance from an eye point to the farthest corner of the framing subject. */
export function farthestSubjectDistance(eye, subject) {
  return round(
    Math.max(
      ...boundsCorners(subject).map((corner) =>
        Math.hypot(corner[0] - eye[0], corner[1] - eye[1], corner[2] - eye[2]),
      ),
    ),
  );
}

function namedCameras(cameraSet) {
  const cameras = [];
  if (cameraSet.topDown) cameras.push(["topDown", cameraSet.topDown]);
  for (const [name, camera] of Object.entries(cameraSet.obliques ?? {})) {
    cameras.push([`oblique-${name}`, camera]);
  }
  return cameras;
}

/**
 * Static necessary conditions for a camera set to be able to measure the
 * island. Returns a list of failure strings, empty when the set is framed.
 */
export function auditAuxiliaryFraming({
  cameraSet,
  subject,
  shell,
  fog,
  contract = CONTRACT,
  includeAuthoredOverview = false,
}) {
  if (!fog || !Number.isFinite(fog.far)) {
    throw new TypeError("fog must declare a finite far plane");
  }
  const failures = [];
  const distanceLimit = fog.far * contract.atmosphere.maximumSubjectDistanceFraction;
  const radiusLimit = contract.cloudShell.maximumNormalisedRadius;

  if (shell.innermostPopulatedRadius < radiusLimit) {
    failures.push(
      `cloud core radius ${radiusLimit} reaches into the populated annulus, ` +
        `which starts at ${shell.innermostPopulatedRadius}`,
    );
  }

  const subjectRadius = Math.max(
    ...boundsCorners(subject).map((corner) => normalisedShellRadius(corner, shell)),
  );
  if (subjectRadius > radiusLimit) {
    failures.push(
      `framing subject reaches shell radius ${round(subjectRadius)}, ` +
        `outside the unpopulated core at ${radiusLimit}`,
    );
  }

  const cameras = namedCameras(cameraSet);
  if (includeAuthoredOverview && cameraSet.authoredOverview) {
    cameras.unshift(["authoredOverview", cameraSet.authoredOverview]);
  }
  if (cameras.length === 0) failures.push("camera set declares no auxiliary cameras");

  for (const [name, camera] of cameras) {
    const distance = farthestSubjectDistance(camera.position, subject);
    if (distance > distanceLimit) {
      failures.push(
        `${name}: farthest subject corner ${distance} exceeds the atmospheric ` +
          `limit ${round(distanceLimit)} (fog far ${fog.far})`,
      );
    }
    const radius = normalisedShellRadius(camera.position, shell);
    if (radius > radiusLimit) {
      failures.push(
        `${name}: stands at shell radius ${radius}, inside the populated cloud ` +
          `annulus beyond ${radiusLimit}`,
      );
    }
  }
  return failures;
}

/**
 * Per-camera island coverage, read from reference pixels only. The candidate's
 * pixel counts are deliberately not consulted: this measures whether the
 * camera set can see the island in the authored scene, which no candidate may
 * influence.
 */
export function measureSubjectCoverage({ passes, subjectGroups, contract = CONTRACT }) {
  if (!passes || !Array.isArray(passes.views)) {
    throw new TypeError("passes must expose a views array");
  }
  const [width, height] = passes.capture.framebuffer;
  const framePixels = width * height;
  const groups = new Set(subjectGroups);
  const cameras = passes.views.map((view) => {
    const byGroup = view.byGroup ?? {};
    const perGroup = {};
    let subjectPixels = 0;
    for (const group of groups) {
      const pixels = byGroup[group]?.referencePixels ?? 0;
      perGroup[group] = pixels;
      subjectPixels += pixels;
    }
    return {
      camera: view.camera,
      subjectPixels,
      subjectFrameFraction: round(subjectPixels / framePixels),
      perGroup,
    };
  });
  const overview = cameras.find((camera) => camera.camera === "authoredOverview");
  if (!overview) throw new Error("passes do not include the authored overview");
  const observableGroups = [...groups].filter((group) => overview.perGroup[group] > 0);
  const failures = [];
  const share = contract.coverage.minimumShareOfAuthoredOverview;
  for (const camera of cameras) {
    if (camera.camera === "authoredOverview") continue;
    const ratio = round(camera.subjectFrameFraction / overview.subjectFrameFraction);
    if (ratio < share) {
      failures.push(
        `${camera.camera}: island coverage ${camera.subjectFrameFraction} is ` +
          `${ratio} of the authored overview's ${overview.subjectFrameFraction}, ` +
          `below the required ${share}`,
      );
    }
    if (!contract.coverage.requireEveryGroupObservable) continue;
    for (const group of observableGroups) {
      if (camera.perGroup[group] > 0) continue;
      failures.push(
        `${camera.camera}: group ${group} has no reference pixels, so its ` +
          `silhouette reports absence rather than error`,
      );
    }
  }
  return { framePixels, cameras, observableGroups, failures };
}
