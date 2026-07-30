/**
 * Required metric coverage for the two gate-stack layers that ADR-0040's
 * non-compensating stack leaves uncalibrated.
 *
 * These layers are the reason a favourable camera cannot hide an opposing view:
 * each metric keeps an aggregate and a worst case, and the worst case is a
 * separate gating metric rather than a footnote on the aggregate.
 *
 * Every entry names a path in the gate stack's evidence object, whose `passes` key
 * holds `scene-passes-v1.json`. The root matters: a path rooted at `aggregate` is
 * correct against the pass file on its own and resolves to nothing through the
 * stack, which reported every metric as missing evidence while a check that read
 * the file directly stayed green.
 *
 * A calibration that omits one of these families would leave a category of visible
 * error ungated, so `verifyLayerCoverage` is what stops the baseline being extended
 * with whichever metrics happened to separate.
 */
const REQUIRED_COVERAGE = {
  fixedCameraGeometry: [
    // Per-group silhouette, not whole-frame. Whole-frame silhouette on the
    // auxiliary cameras is ground agreeing with ground: geography fills 84 to
    // 86 per cent of those frames, which is why it is absent from this list.
    { family: "per-group silhouette", path: "passes.aggregate.groupSilhouetteIoU.mean" },
    { family: "per-group silhouette", path: "passes.aggregate.groupSilhouetteIoU.worst.value" },
    // Per-group contour too, and for the same reason. Measured on the frozen
    // reference passes, whole-frame contour p95 is 0 on `topDown` and 1 on the
    // four obliques, because the whole-frame silhouette is everything that is
    // not sky and its outline is essentially the frame border. Gating that
    // number would re-create the blind spot ADR-0049 removed (ADR-0051).
    { family: "contour distance", path: "passes.aggregate.groupContourDistance.meanP95" },
    { family: "contour distance", path: "passes.aggregate.groupContourDistance.worst.value" },
    { family: "linear depth", path: "passes.aggregate.groupDepthWorldUnits.meanP95" },
    { family: "linear depth", path: "passes.aggregate.groupDepthWorldUnits.worst.value" },
    { family: "world normal", path: "passes.aggregate.groupWorldNormalDegrees.meanP95" },
    { family: "world normal", path: "passes.aggregate.groupWorldNormalDegrees.worst.value" },
    { family: "semantic occupancy", path: "passes.aggregate.semanticAgreement.mean" },
    { family: "semantic occupancy", path: "passes.aggregate.semanticAgreement.worst.value" },
    { family: "semantic confusion", path: "passes.aggregate.semanticConfusion.worstFraction" },
  ],
  nativeAppearance: [
    { family: "global appearance", path: "passes.aggregate.appearanceDeltaE.meanMean" },
    { family: "global appearance", path: "passes.aggregate.appearanceDeltaE.worst.value" },
    {
      family: "per-material-family appearance",
      path: "passes.aggregate.appearanceByMaterialFamily.meanMean",
    },
    {
      family: "per-material-family appearance",
      path: "passes.aggregate.appearanceByMaterialFamily.worst.value",
    },
  ],
};

/** The Material Families the Scene Recipe declares, which appearance must cover. */
export function materialFamilyIds(recipe) {
  const families = recipe.materialFamilies;
  const ids = Array.isArray(families)
    ? families.map((family) => family.id)
    : Object.keys(families);
  if (ids.length === 0) throw new Error("recipe declares no material families");
  return [...ids].sort();
}

export function requiredCoverage(layer) {
  const required = REQUIRED_COVERAGE[layer];
  if (!required) throw new Error(`no required coverage is declared for ${layer}`);
  return required;
}

export function coveredLayers() {
  return Object.keys(REQUIRED_COVERAGE);
}

/**
 * Which required metric families a calibrated layer fails to gate.
 *
 * A demoted metric does not count as covered: demotion is the honest response to
 * a metric that cannot separate its bracket, but a family with every member
 * demoted is a family nothing gates, and that has to surface rather than pass.
 *
 * `unexplained` is the part that stops a calibration from freezing whichever
 * metrics happened to separate. Every required path must either gate or be
 * recorded as a measured diagnostic with a reason: demotion is a result, and a
 * result has evidence behind it. A path that is simply absent from both lists was
 * never measured, and that is a different thing entirely.
 */
export function verifyLayerCoverage({ layer, thresholds, diagnostic = [] }) {
  const required = requiredCoverage(layer);
  const gatedPaths = new Set((thresholds ?? []).map((entry) => entry.path));
  const explained = new Set(
    diagnostic
      .filter(
        (entry) =>
          (entry.layer === undefined || entry.layer === layer) &&
          typeof entry.reason === "string" &&
          entry.reason.length > 0,
      )
      .map((entry) => entry.path),
  );
  const missing = [];
  const unexplained = [];
  const families = new Map();
  for (const entry of required) {
    const covered = gatedPaths.has(entry.path);
    families.set(entry.family, (families.get(entry.family) ?? false) || covered);
    if (!covered) {
      missing.push(entry.path);
      if (!explained.has(entry.path)) unexplained.push(entry.path);
    }
  }
  const uncoveredFamilies = [...families]
    .filter(([, covered]) => !covered)
    .map(([family]) => family);
  return { missing, unexplained, uncoveredFamilies };
}
