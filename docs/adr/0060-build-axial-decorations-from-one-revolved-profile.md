---
status: accepted
---

# Build axial decorations from one revolved profile

`decorations` was the last unexplained man-made over-draw: pixel ratio 1.52 at silhouette IoU 0.429, with a world-normal p95 of 117.4 second only to vegetation. It is 19 kinds across 58 placements, and the authored overview pixels are concentrated — `npc-statue` 835, `lantern` 737, `name-plate` 659, `yin-yang` 505, and nothing else above 250.

The kinds worth a family program are the two with enough placements to support one. Ten lanterns and eight statues carry 48 per cent of the group's authored pixels; most of the rest are single placements, which is the same thin evidence that sank the bridge attempt. So this does two kinds and says so.

Both were built **inverted**, and the pooled half-extent per height decile says it plainly:

| decile | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lantern` authored | 0.57 | 0.60 | 0.62 | **0.89** | 0.86 | **0.91** | 0.74 | 0.58 | 0.62 | 0.44 |
| `lantern` before | 0.16 | 0.25 | — | 0.43 | 0.38 | — | 0.48 | **1.00** | 0.97 | 0.66 |
| `npc-statue` authored | 0.82 | 0.87 | 0.88 | 0.86 | 0.82 | 0.74 | 0.67 | 0.75 | 0.70 | 0.51 |
| `npc-statue` before | 0.72 | 0.84 | 0.71 | — | 0.93 | 0.20 | 0.49 | 0.62 | 0.58 | 0.22 |

The authored lantern is widest at three to five tenths of its height and *narrowest* at the crown; the generator was a thin post under a wide housing, 0.16 at the bottom and 1.00 near the top. The authored statue is broad through its lower two thirds and still 0.51 at the crown, where a sphere gave 0.22 — and it put 23.9 per cent of its geometry in the bottom decile against the reference's 10.2.

Ten numbers per kind, pooled over every placement. Nothing per-entity.

The form is **one revolved surface** through that profile, not a stack of primitives. That is the direct lesson of the reverted architecture attempt, which matched its massing profile and still raised group contour distance a fifth: eight boxes standing in for a smooth authored body add silhouette edges and depth discontinuities the reference does not have. A lathe reproduces the same profile with no seams. And because the measurement is a radially averaged half-extent, a revolved surface is exactly the form it describes — giving it a plan shape the measurement cannot see would be inventing. The authored decorations are one mesh each, so one semantic part is the faithful count rather than a loss of structure.

| | before | after |
| --- | --- | --- |
| `decorations` silhouette IoU | 0.429 | **0.452** |
| `decorations` contour p95 | 12.97 | **12.84** |
| `decorations` world normal p95 | 117.43 | **110.77** |
| `lantern` surface p95 | 4.384 | **3.407** |
| `npc-statue` surface p95 | 3.827 | **3.609** |
| aggregate surface p95 | 7.192 | **7.175** |
| group silhouette IoU | 0.4699 | **0.4720** |
| group contour distance p95 | 25.500 | **25.483** |
| group depth p95 | 20.927 | **20.863** |
| group world normal p95 | 79.206 | **78.591** |
| semantic agreement | 0.94460 | **0.94469** |
| draw calls | 1,810 | **1,766** |
| `decorations` candidate/reference pixels | 1.52 | 1.60 |

Every changed gate metric improved and none regressed, which is the first village change in this milestone to manage that. The draw calls fall because the lantern went from three primitives to one surface and the statue from four.

The pixel ratio going the other way is the same trade the support-plane rock made: a fuller form draws more pixels while agreeing better in shape, and IoU is the measure of agreement. It is recorded rather than traded away.

Two tool defects were found on the way and both mattered. `measure-architecture-massing.mjs` hardcoded three groups, so `--kinds lantern` silently matched nothing and printed an empty report — it now searches every group when kinds are named and throws with the known kinds when one does not exist. And it suppressed the *pair* of reach values whenever either side had no samples in a band, which hid the authored value in exactly the bands where the candidate has no geometry; each side now prints its own.

The test went through one wrong version, again the ADR-0055 mistake. It first recomputed the generated profile from vertices and compared that against a sample-pooled authored mean, reporting a 1.27 scale factor that was a difference between two measurement methods rather than a shape error — a lathe's vertices cluster at its profile points and an area-weighted sample does not. The tool now writes its comparison as evidence and the test reads it, so both subjects go through one sampler.
