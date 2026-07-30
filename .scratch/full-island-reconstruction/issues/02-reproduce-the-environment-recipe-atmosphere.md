# 02 - Reproduce the Environment Recipe's atmosphere

**What to build:** Make the candidate's sky, fog, tone mapping, exposure, and post-processing reproduce the authored look independently, so appearance measurement stops being dominated by a wholesale atmospheric difference.

**Blocked by:** 01 - Calibrate the fixed-camera and native-appearance gate layers.

**Status:** in-progress — post-processing and attribution done; the residual is not atmospheric

- [x] Add one non-interactive check that is red until the candidate's atmospheric evidence is inside the calibrated appearance thresholds for the sky and geography regions.
      `test/atmosphere-reconstruction.test.mjs`, 5 assertions, 3 green and 2 red. **Deliberately uncommitted** while it is red, as the repository forbids committing a known-failing check.
- [x] Reproduce linear fog at the frozen colour and near/far, so distance fades rather than ending at a hard horizon line.
      Already in the recipe and applied; asserted against the frozen render contract.
- [x] Reproduce the sky gradient's zenith and horizon colours and its falloff.
      Asserted against the contract. Measured: sky DeltaE is 3.39 to 9.31 on the four obliques, so the gradient is close. `authoredOverview` is the outlier at 26.54 and is the remaining atmospheric defect.
- [x] Reproduce ACES tone mapping, exposure, and the sRGB output pipeline.
- [x] Reproduce bloom, warm grading, and vignette with code-generated post-processing, keeping film grain disabled as the contract declares.
      `gt_designer/src/reconstruction/scene/environment-postprocessing.js`, in the production runtime and in the candidate's evaluation path. Global DeltaE fell from 26.17 to 22.17.
- [x] Keep every value a compact Environment Recipe parameter; retain no captured pixel, gradient table, or sampled curve.
      The whole chain is 13 numbers. The recipe gained `grading.tint`, `grading.lift`, and `vignette.falloff`, without which the generator would have had to invent the colours it mixes towards.
- [x] Prove the candidate still renders with no reference dependency and no new runtime resource request.
      Certification: 12 production files, 23 local code requests, **0 external**, 34,931 B gzip. Three.js addons are permitted third-party code; the audit still rejects anything outside `node_modules/three/`.
- [x] Report the appearance change per camera and per Material Family, with the worst camera retained.
      Worst camera is now `topDown` at 28.75. Full per-region table is in the handoff.
- [x] Confirm no geometry layer regressed.
      Every geometry metric is bit-identical: silhouette IoU 0.994142, contour p95 5.666667, depth p95 141.922859, normal p95 4.022361, semantic agreement 0.921404.

## What remains, and why the ticket's premise changed

Appearance regions could not attribute the atmosphere at all. The region masks came
from the auxiliary semantic pass, which hides the sky shell so that a backdrop
filling every frame cannot make geometry evidence report perfect agreement — so
`sky` had no mask, and the atmosphere sat inside the global mean attributable to
nothing. The ticket meant to fix the atmosphere had no measurement of it. Appearance
regions now come from a second semantic index over the same frame that keeps the sky
shell, while the geometry passes still exclude it.

With the atmosphere finally measurable, the residual is mostly not atmospheric:

| region | DeltaE range | belongs to |
| --- | --- | --- |
| sky | 3.39 to 9.31 on the obliques, 26.54 on `authoredOverview` | this ticket |
| horizon | 6.98 to 12.55 | 05 |
| geography | 16.98 to 26.33, on about a million pixels per camera | 04 ocean, 03 terrain |
| vegetation | 38.31 to 52.23 | 11 materials |
| structures | 31.19 to 40.19 | 07, 11 |

Two things left here:

1. `authoredOverview` sky at 26.54 against 3.39 on `oblique-north`. That camera looks
   out towards the horizon, so its sky pixels are the band where fog and sky meet.
   The likely cause is a difference in whether the sky shell is fogged. Check
   `fog: false` on the reference's sky material against the generated one.
2. Cloud pixels are still unattributed, because a cloud sprite cannot take a mesh
   pass material. They remain inside the global mean. Attributing them needs a
   sprite-aware index pass, which is worth doing before ticket 13 claims the
   dynamic environment is stable.
