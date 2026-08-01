import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { HORIZON_PEAK_CAP } from "../tools/reconstruction/scene-placements.mjs";
import {
  compareHorizon,
  compareHorizonProfiles,
  profileFromGeometry,
} from "../tools/evaluation/horizon-evidence.mjs";
import { HORIZON_BINS } from "../tools/evaluation/horizon-profile.mjs";
import {
  EXPECTED_HORIZON_GROUPS,
  measureHorizon,
} from "../scripts/run-horizon-evidence.mjs";

const ANCHOR = [86, 26, -24];

/** A box of known size at a known distance subtends a known elevation angle. */
function boxAt(x, z, width, height, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.position.set(x, ANCHOR[1] + height / 2, z);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}

test("the Horizon Profile matches an analytic box silhouette", () => {
  const distance = 1000;
  const height = 200;
  const measured = profileFromGeometry(
    boxAt(ANCHOR[0] + distance, ANCHOR[2], 40, height, 40),
    ANCHOR,
    HORIZON_BINS,
  );
  const covered = measured.profile.filter((value) => value !== null);

  assert.ok(covered.length > 0);
  const expected = Math.atan2(height, distance - 20);
  assert.ok(
    Math.abs(Math.max(...covered) - expected) < 0.01,
    `peak elevation ${Math.max(...covered)} vs ${expected}`,
  );
  assert.ok(Math.abs(measured.depthInterval[0] - (distance - 20)) < 1);
  assert.ok(Math.abs(measured.depthInterval[1] - Math.hypot(distance + 20, 20)) < 2);
});

test("the profile is independent of how finely a subject is tessellated", () => {
  const coarse = new THREE.Mesh(new THREE.SphereGeometry(120, 8, 6));
  const fine = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 48));
  for (const mesh of [coarse, fine]) {
    mesh.position.set(ANCHOR[0] + 1200, ANCHOR[1] + 120, ANCHOR[2]);
    mesh.updateMatrixWorld(true);
  }
  const coarseProfile = profileFromGeometry(coarse, ANCHOR, HORIZON_BINS);
  const fineProfile = profileFromGeometry(fine, ANCHOR, HORIZON_BINS);

  const coarseBins = coarseProfile.profile.filter((value) => value !== null).length;
  const fineBins = fineProfile.profile.filter((value) => value !== null).length;
  assert.ok(
    Math.abs(coarseBins - fineBins) <= 2,
    `coarse covers ${coarseBins} bins, fine covers ${fineBins}`,
  );
  const comparison = compareHorizonProfiles(
    coarseProfile.profile,
    fineProfile.profile,
    HORIZON_BINS,
  );
  assert.ok(
    comparison.angularError.p95 < 0.02,
    `p95 ${comparison.angularError.p95} between two tessellations of one shape`,
  );
});

test("profile comparison reports missing skyline and angular error separately", () => {
  const reference = Array.from({ length: 8 }, (_unused, index) => 0.1 + index * 0.01);
  const identical = compareHorizonProfiles(reference, reference, 8);
  assert.equal(identical.angularError.max, 0);
  assert.equal(identical.missingBins, 0);

  const raised = compareHorizonProfiles(
    reference,
    reference.map((value) => value + 0.05),
    8,
  );
  assert.ok(Math.abs(raised.angularError.mean - 0.05) < 1e-9);
  assert.equal(raised.missingBins, 0);

  const gapped = compareHorizonProfiles(
    reference,
    reference.map((value, index) => (index < 3 ? null : value)),
    8,
  );
  assert.equal(gapped.missingBins, 3);
});

test("group deletion, displacement, and depth damage are each reported", () => {
  const bins = 72;
  const reference = new Map([
    [
      "horizon/mountain-a",
      {
        anchor: [1000, 0, 0],
        extent: [200, 150, 200],
        orientation: { type: "axis", radians: 0 },
        profile: Array.from({ length: bins }, (_unused, bin) => (bin < 6 ? 0.14 : null)),
        depthInterval: [900, 1100],
      },
    ],
    [
      "horizon/mountain-b",
      {
        anchor: [-1000, 0, 0],
        extent: [200, 150, 200],
        orientation: { type: "axis", radians: 0 },
        profile: Array.from({ length: bins }, (_unused, bin) => (bin > 34 && bin < 41 ? 0.14 : null)),
        depthInterval: [900, 1100],
      },
    ],
  ]);
  const referenceEvidence = {
    bins,
    combined: Array.from({ length: bins }, (_unused, bin) =>
      bin < 6 || (bin > 34 && bin < 41) ? 0.14 : null,
    ),
  };
  const candidate = new Map([
    ["horizon/mountain-a", { object: boxAt(ANCHOR[0] + 1000, ANCHOR[2], 200, 150, 200) }],
  ]);

  const report = compareHorizon({
    referenceEvidence,
    referenceGroups: reference,
    candidateGroups: candidate,
    anchor: ANCHOR,
    overviewPosition: [390, 190, 410],
  });

  assert.deepEqual(report.groups.missing, ["horizon/mountain-b"]);
  assert.equal(report.groups.candidate, 1);
  assert.ok(report.profile.missingBins > 0, "a deleted group must leave the skyline empty");
  assert.equal(report.backsideSurfaceDistance, "diagnostic");
});

test("each Horizon Group carries bounded multi-form controls, not a scaled primitive", () => {
  const mountains = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === "mountain");

  assert.equal(mountains.length, EXPECTED_HORIZON_GROUPS);
  for (const mountain of mountains) {
    assert.ok(mountain.shape, `${mountain.semanticId} has no horizon controls`);
    const forms = [...mountain.shape.peaks, ...mountain.shape.foothills];
    assert.ok(forms.length >= 1 && forms.length <= HORIZON_PEAK_CAP);
    for (const form of forms) {
      assert.equal(form.offset.length, 2);
      assert.ok(form.height > 0 && form.height <= 1);
      assert.ok(Math.abs(form.offset[0]) <= 0.5 && Math.abs(form.offset[1]) <= 0.5);
    }
    assert.equal(mountain.group, "horizon");
    assert.equal(mountain.orientation.type, "axis");
  }
  // More than one group has a genuinely multi-summit ridge.
  assert.ok(
    mountains.filter((mountain) => mountain.shape.peaks.length > 1).length >= 4,
    "the authored skyline is multi-summit and the controls must record that",
  );
});

test("the runtime keeps no authored mountain mesh or sampled skyline", () => {
  const mountains = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === "mountain");
  const serialized = JSON.stringify(mountains);
  const numbers = serialized.match(/-?\d+(?:\.\d+)?/g) ?? [];

  assert.ok(
    numbers.length < EXPECTED_HORIZON_GROUPS * 72,
    // Raised with HORIZON_PEAK_CAP 8 -> 12 (ADR-0052 enlargement, authorized). The ratio
    // this protects is intact -- a 720-bin sampled skyline would be 11,520 numbers against
    // 1012 here -- but 1012 is also 58 per cent above the 640-number sampled skyline that
    // was accepted as the alternative, which is the comparison a reader should make.
    `the sixteen Horizon Groups retain ${numbers.length} numbers, which is approaching a sampled skyline`,
  );
  assert.doesNotMatch(serialized, /profile|skyline|azimuth|elevationAngle/i);
  for (const mountain of mountains) {
    // Against the constant, not a literal 8. The literal was correct while the cap was
    // frozen and wrong the moment ADR-0052's enlargement moved it, in the same way the
    // sampling test's literal `* 3` was.
    assert.equal(
      mountain.shape.peaks.length + mountain.shape.foothills.length <= HORIZON_PEAK_CAP,
      true,
    );
  }
});

test("the measured candidate keeps every group and stays red on skyline quality", async () => {
  const { referenceGroups, report } = await measureHorizon();

  assert.equal(referenceGroups.size, EXPECTED_HORIZON_GROUPS);
  assert.deepEqual(report.groups.missing, []);
  assert.equal(report.profile.missingBins, 0);
  assert.equal(report.groups.anchorError.max, 0);
  assert.equal(report.groups.overlapOrderError.max, 0);
  assert.ok(report.groups.extentError.max < 0.01);

  // The honest red baseline: correct placement and ordering, wrong silhouette.
  assert.ok(
    report.profile.angularError.p95 > 0.01,
    "skyline parity is not expected to pass during Foundation",
  );
  assert.ok(report.groups.visibleAngleRelativeError.mean > 0);
});
