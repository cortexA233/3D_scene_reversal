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

### The sky dome, reproduced

The recipe recorded the dome as two colours. The authored dome is five colours, three
smoothstep bands, a warm horizon haze, and a two-term sun glow, and the generated
material was a different height mapping as well: `dir.y * 0.5 + 0.5` spreads the
gradient over the whole sphere and puts the horizon colour halfway up, where the
authored `clamp(dir.y, 0, 1)` keeps it at the horizon. The generated material was
also missing `fog: false`, so the backdrop the fog fades *into* was itself being
fogged, mixing the fog colour in twice.

The recipe now carries `mid`, `haze`, `glow`, `radius`, `midStop`, `zenithStop`,
`hazeBand`, and `sunGlow` — still compact semantic parameters, no sampled curve —
and the generator reproduces the dome, sets `frustumCulled = false` as the authored
one does, and clears to the horizon colour.

Measured effect, with every geometry metric bit-identical:

| | before | after |
| --- | --- | --- |
| `authoredOverview` sky DeltaE | 26.535 | **17.553** |
| global appearance DeltaE | 22.173 | **21.531** |
| `oblique-north` sky | 3.391 | 3.343 |
| `oblique-east` sky | 5.229 | 5.000 |
| `oblique-west` sky | 5.719 | 5.437 |
| `oblique-south` sky | 9.314 | 9.398 |

### What is left, and it is not the gradient

`authoredOverview` sky is still 17.55 against 3.34 on `oblique-north`, and the reason
is that its `sky` region is not only sky. Cloud sprites are hidden in the mask pass,
because a sprite cannot take a mesh pass material, so wherever a cloud is drawn in
the lit capture the mask labels that pixel `sky`. The authored overview is the camera
with clouds across its frame, so its sky figure is partly a cloud comparison. The
obliques look down at the island and see almost none.

That makes the remaining work belong elsewhere: the clouds are Distributed Scene
Cover (09) and the frozen dynamic environment (13). Attributing them needs a
sprite-aware index pass, and until that exists the `sky` region on cloud-heavy
cameras must be read as sky-and-cloud rather than as sky. `oblique-south` at 9.40 is
the next largest true sky residual and is worth a look on its own: it is the camera
looking towards the sun's azimuth, so it is the one the glow terms affect most.
