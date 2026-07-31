# 06 - Reconstruct plazas, decks, paving, and path stones

**What to build:** Give the ground surfaces their authored footprints and thickness so the worst-scoring semantic groups stop being empty.

**Blocked by:** 03 - Fit terrain elevation and the shore profile. **This is a real
block, measured below, not a formality.**

**Status:** `plazas` and `deck` landed — the over-draw was footprint coverage, not
terrain, and the group's pixel ratio is 1.89 to **1.12**. `paths` remains genuinely
blocked on 03. `rocks` is actionable and now more urgent than it was, because the
plaza was covering it.

- [ ] Add one non-interactive check that is red until the paths, plazas, and rocks groups reach their calibrated per-group silhouette thresholds.
- [x] Reconstruct plazas and decks as bordered paved slabs following their measured footprints. — as a walk and crossing paths driven by two measured per-entity controls, ADR-0057. `npm run check:ground-plates`.
- [ ] Reconstruct path stones and paving slabs with footprint extrusion, settled on the generated terrain.
- [ ] Reconstruct shore and inland rocks with the accepted bounded support-plane representation.
- [ ] Keep every entity's anchor and Target AABB Extent exact.
- [ ] Report per-group silhouette, depth, and world-normal evidence with the worst camera retained.
- [ ] Confirm the terrain and coastline evidence did not regress.

## `paths` owns two gates and cannot be fixed here

After ADR-0053 corrected the mask passes, `paths` holds the two worst-group
fixed-camera gates that `cover` used to: silhouette IoU 0.067961 against 0.369228
and contour distance 223.9112 against 39.2559. It is also the smallest group on
the board — 465 reference pixels across six cameras — drawing 1,457 candidate
pixels, a 3.13-fold over-draw.

None of that is a footprint error. Anchor and Target AABB Extent are exact for all
672 entities and `check:scene-generation` proves it every run. The cause is that
the group is 60 slabs of sub-unit thickness pinned at exact authored heights on a
terrain that is wrong by several units:

| group | n | terrain misfit under it (mean / p95 / max) | mean thickness |
| --- | --- | --- | --- |
| paths | 60 | 4.73 / 12.57 / 14.57 | **0.67** |
| plazas | 6 | 8.48 / 9.72 / 29.30 | 3.22 |
| rocks | 39 | 8.97 / 27.43 / 30.61 | 8.40 |
| decorations | 58 | 5.50 / 17.24 / 28.74 | 7.53 |
| structures | 39 | 7.12 / 13.42 / 15.15 | 18.88 |

Misfit is the authored anchor height less the candidate terrain height beneath it,
which is exactly ticket 03's elevation residual sampled where these entities stand.
For `paths` it is **seven times the mean slab thickness and up to fifty-eight
times** it. Counted per entity: **37 of 60 float entirely above the candidate
terrain, 13 are fully buried, and only 10 intersect it.**

That is the whole over-draw. A slab lying flush on ground shows its top face and,
at a grazing angle, very little of it; a slab floating twelve units up shows its
top, all four sides, and nothing occludes it. The reference draws 1.3 pixels per
slab per camera and the candidate draws 4.

**The obvious fix is forbidden and should stay forbidden.** Settling each slab on
the generated terrain would move its Scene Placement Anchor, which the spec makes a
hard contract — "a generator may not reinterpret them" — and world layout is
currently exact across all 672 entities with nothing in the milestone permitted to
regress it. Re-settling would also be paying for ticket 03's error out of ticket
06's statistic, which is the same trade the cover ticket declined when it refused to
use the authored floor as a second filter.

So `paths` improves when ticket 03 does, and the checkbox wording "settled on the
generated terrain" needs reading as the terrain being right, not the anchor being
moved. `plazas` was **also** blamed on the terrain here and that was wrong: its
over-draw was footprint coverage, it was the generator's own, and the next section is
how it was fixed without touching an anchor. The 8.48 units of misfit beneath the
plazas are real and still cost the group depth and normals; they were not what cost
it 0.9 of its pixel ratio.

## `plazas` was footprint coverage, and it was the generator's own

The terrain block above is real for `paths` and it is **not** what made `plazas` draw
1.89 times the reference's pixels. That was the generator filling its bounding
rectangle when the authored plates do not fill theirs: measured by scan-conversion in
the reference page, coverage of its own rectangle is 1.000 for one plaza, 0.341 for
the other, and 0.126 to 0.191 for the four decks.

A candidate cannot cover less by shrinking — `placeEntity` scales its AABB onto the
declared extent exactly — so lower coverage has to come from concavity. And coverage
alone cannot say *which* concave shape: a perimeter walk and crossing paths of equal
area sit at footprint reach 0.71 and 0.28 on the unit square, so `perimeterShare` is
inverted from the authored reach. It lands at 0.156 to 0.262 across the four decks,
independently measured, and 0.674 for the sparse plaza. Two scalars per entity, which
is what this ticket's sibling asked for and one fewer than the anchor already carries.

| | before | after |
| --- | --- | --- |
| `plazas` candidate/reference pixels | 1.89 | **1.12** |
| `plazas` silhouette IoU | 0.367 | **0.398** |
| `plazas` contour p95 | 17.63 | **13.24** |
| `plaza` surface p95 | 42.75 | **34.05** |

Nine of the ten gated rendered metrics improved; `group world normal p95` went from
79.37 to 80.41. See ADR-0057, and the knock-on effect below before reading any
per-group number as independent.

## An over-drawing group was propping up its neighbours

`paths` contour fell 111.5 to 81.1 and `geography` 16.7 to 12.4 — but **`rocks`
contour nearly doubled, 25.6 to 47.9**, and `bridges` IoU slipped 0.370 to 0.360.
None of those generators changed. The over-drawn plaza was covering them, and
shrinking it to its measured footprint uncovered errors that were already there.

Two consequences. A per-group score measured while a neighbour over-draws is not
independent of that neighbour, so the ranking has to be re-read after every
over-draw is fixed. And `rocks` is now the group with the most exposed shape error
in the village — which is the next checkbox anyway.

## `rocks` is actionable now

`rocks` is the one group in this ticket whose error is its own shape. 39 entities,
pixel ratio **0.99** — the right amount of pixel, in the wrong shape — with IoU
0.3371 and contour p95 25.5. Its mean thickness of 8.40 units is comparable to the
8.97 of terrain misfit beneath it, so unlike the slabs it is not dominated by where
the ground is.

That is the third checkbox: the accepted Bounded Support-plane Polyhedron, which
Stone v2 already proved at object scale under `stone-geometry-baseline-v2` and which
`tools/development/fit-stone-supports.mjs` already fits. Doing `rocks` does not need
ticket 03.

## Do not repeat this measurement blind

The per-group numbers to work from are in the handoff's candidate-result table and
are all post-ADR-0053. Anything written about `plazas` before that is measured
against a reference mask that was 84 per cent ground-rock scatter.
