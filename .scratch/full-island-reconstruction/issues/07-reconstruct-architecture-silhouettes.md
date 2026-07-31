# 07 - Reconstruct architecture and bridge silhouettes

**What to build:** Rebuild the pavilions, booths, shops, houses, and bridges as roofed, posted, multi-level forms whose silhouettes and part counts match the authored buildings.

**Blocked by:** 06 - Reconstruct plazas, decks, paving, and path stones.

**Status:** measured twice, one attempt made and reverted, and now blocked on a design
decision rather than on a form. The authored massing is known, the authored footprint
coverage is known, and both say the same thing: one kind is two different assets and the
Scene Recipe carries nothing that tells them apart. Read the three findings below before
trying again.

- [ ] Add one non-interactive check that is red until the structures and bridges groups reach their calibrated per-group silhouette thresholds.
- [ ] Build one architecture family program with compact per-entity controls for levels, eaves, platform, posts, and roof pitch.
- [ ] Build a bridge program with deck, railing, abutment, and arch as separate semantic parts.
- [ ] Keep the family's controls compact; a per-building transform list is not a reconstruction.
- [ ] Keep every entity's anchor and Target AABB Extent exact.
- [x] Report per-group silhouette, contour distance, depth, and world normal with the worst camera retained. — and the authored massing profile, which nothing measured before: `tools/development/measure-architecture-massing.mjs`, plus the authored footprint coverage: `tools/development/measure-plate-footprint.mjs`.
- [ ] Improve the semantic component delta for these groups.


## Human Parity Review named this group, and the numbers agree

Review of the six-camera comparison picked out the village — buildings, plazas, and
bridges — as the largest remaining visible geometry residual. The measurements say the
same, and unlike the paving slabs these are not blocked on terrain: a building is 18.9
units thick against 7.1 units of terrain misfit beneath it, and a bridge 19.4 against
6.0.

| group | IoU | worst depth p95 | candidate/reference pixels | terrain misfit / own thickness |
| --- | --- | --- | --- | --- |
| structures | 0.4999 | **118.40**, the layer's worst | 0.90 | 0.38 |
| bridges | 0.3695 | 20.7 | **2.11** | 0.31 |
| plazas | 0.3671 | 5.7 | **1.89** | 2.6 |

`worst component deficit` is **not** about these groups: all 39 authored structures are
a single mesh of 84 to 20,000 triangles with no sub-parts, and the eight entities at a
deficit of 9 are all pandas. The buildings have their parts; the parts are the wrong
shape.

## Finding: the authored massing is inverted from what the generator built

`measure-architecture-massing.mjs` pools each kind's placements and normalises them
into their own boxes, reporting geometry share and horizontal reach per height decile.
Over 16 `shop-stall` placements and 1,536 samples:

| | authored | the generator as it stands |
| --- | --- | --- |
| reach, base to eave | **0.48 to 0.77 — widens** | **0.78 to 0.52 — narrows** |
| height to footprint | 1.02 | 1.71 |
| share in the base decile | 4.6% | 37.8% |
| share at the eave | 15.8% | 5.0% |
| share in every middle decile | 5.4 to 12.4% | 0.0 to 6.6% |

The widest part of an authored building is its **eave**, not its floor, and its mass is
spread through its whole height. The generator is a wide plinth tapering to a
four-sided cone with a hollow body — the opposite shape.

Three kinds have different profiles, and this is measured too, though only in its sign
because each has one placement and 96 samples: `pavilion` reaches 0.87 at a tenth of
its height and 0.29 at the ridge, which is a taper, and `ring-booth` holds 0.64, 0.77,
0.80, 0.75, 0.74, which is neither. An open structure of posts and a roof is not
shaped like a walled shop.

## Finding: fixing the massing against the surface profile regressed the rendered gates

A form was built to that measurement — thin plinth, four wall panels and four corner
posts per level widening towards the eave, and a two-course roof whose eave overhangs
the body. It reproduced the profile well: aspect 1.71 to **1.05** against an authored
1.02, reach 0.35 to 0.89 rising to its peak at the eave, share at the eave decile 5.0
to **13.9%** against 15.8%.

Per kind it split exactly along how well each was measured:

| kind | n | before | after |
| --- | --- | --- | --- |
| shop-stall | 16 | 2.40 | **1.83** |
| fruit-shop | 7 | 2.27 | **1.94** |
| dumpling-house | 3 | 9.02 | **7.31** |
| dessert-shop | 1 | 8.78 | **7.37** |
| tea-booth | 1 | 6.57 | **6.50** |
| pavilion | 1 | 14.25 | 22.84 |
| pavilion-single | 1 | 15.56 | 17.78 |
| ring-booth | 1 | 11.38 | 13.87 |

And the aggregate surface gate barely moved: 9.3025 to 9.2956.

**The rendered gates went the other way, six of eight.** This is why it was reverted:

| metric | before | after |
| --- | --- | --- |
| group contour distance p95 | 29.635 | **35.635** |
| group depth p95 | 21.100 | 22.324 |
| group world normal p95 | 79.940 | 82.506 |
| group silhouette IoU | 0.4552 | 0.4512 |
| worst group contour distance | 223.84 | 225.08 |
| semantic agreement | 0.9414 | 0.9401 |
| worst group depth p95 | 118.40 | **114.37** |
| worst group silhouette IoU | 0.0680 | **0.0795** |

The cause is that the fit was against a *triangle-share* profile while the gates
measure rendered contour and depth. An authored building is one smooth mesh of up to
20,000 triangles; eight boxes standing in for its body add silhouette edges and depth
discontinuities the reference does not have, and contour distance rose a fifth. Getting
the proportions right is necessary and was not sufficient.

## Finding: the plate controls transfer to a bridge and the plate *form* does not

The plaza work (ADR-0057) gave bridges two of their three controls for free, and the
third fell out of evidence already on disk. Measured from the vertical area profile
in `plate-footprint-v1.json`:

| | coverage | `deckHeight` | profile spread | area below mid-height |
| --- | --- | --- | --- | --- |
| bridge, 8,160 tri | 0.568 | **0.712** | 0.1842 | 9.8% |
| bridge, 6,216 tri | 0.432 | **0.443** | 0.1871 | 62.7% |

The two agree on the *spread* to within two per cent and differ two-fold on where
that band sits, so `deckHeight` belongs in the recipe per entity and the spread
belongs in the generator as a family constant. That division was measured, not
chosen.

Built as a plate lifted to `deckHeight` with railings above and abutments below, it
was captured and **reverted**:

| `bridges` | before | attempt |
| --- | --- | --- |
| candidate/reference pixels | 2.22 | **1.58** |
| contour p95 | 20.49 | **19.00** |
| depth p95 | 20.77 | **18.44** |
| world normal p95 | 106.97 | **90.11** |
| silhouette IoU | 0.362 | **0.295** |

Four of five moved the right way and the group's IoU fell 18 per cent, taking the
aggregate `group silhouette IoU` from 0.4699 to 0.4637. That is the trap ADR-0057
documented, met from a different direction: coverage was matched and *where* the
coverage sits was not.

The rectangle decomposition had already said so and the attempt did not use it. The
two largest rectangles of each authored bridge lie along an axis at **-119.2 and
+136.1 degrees** — the two bridges run along opposite diagonals of their own boxes,
which is what a span does when its Typed Scene Orientation is zero and its AABB is
world-aligned. A centred cross-and-walk plate cannot be either of them.

So the next attempt is a **deck band along a measured axis**, not a plate: a band of
the measured coverage crossing the box along that axis, with the railing on the band
and the abutments at its ends. The axis is a fourth per-entity control and it is
measurable from the decomposition. Two placements is thin ground for a fourth
parameter, which is exactly why it deserves its own step rather than being bolted on
after a mixed result — and why the reverted attempt's three controls are recorded
here rather than left in the recipe as dead data.

## What the next attempt needs

1. **Validate against the rendered gates, not the surface profile.** Contour distance
   and depth are what this group fails on, and a form can match the mass distribution
   while adding edges. A capture is two minutes; take it before believing a profile.
2. **Fewer, smoother surfaces rather than more boxes.** The authored body is smooth at
   screen scale. A single tapered shell that widens towards the eave will reproduce the
   reach profile without eight silhouette seams.
3. ~~**The sampler first.**~~ Done: ADR-0055 gave the sample budget to the entity, so a
   thin plinth no longer draws a part's worth of points for a part's worth of geometry.
   The massing profile above was measured through the old allocation and the numbers in
   the two findings should be re-read before they are trusted; the *signs* survive,
   because the reference side was allocated the same way.

## Finding: the plazas group's over-draw is footprint coverage, and it is not one number

`tools/development/measure-plate-footprint.mjs` scan-converts the authored geometry's
horizontal projection in the reference page, so coverage is the area a plate really
shadows rather than where 96 samples happened to fall. Per distinct asset:

| asset | triangles | coverage of its own rectangle | thickness / diagonal | rectangles claiming it |
| --- | --- | --- | --- | --- |
| plaza | 6,720 | **1.000** | 0.0038 | 1 claims all of it |
| plaza | 2,298 | **0.341** | 0.0028 | 6 claim 0.144, 0.198 left over |
| bridge | 8,160 | 0.568 | 0.172 | 6 claim **0.506** of 0.568 |
| bridge | 6,216 | 0.432 | 0.230 | 6 claim 0.279 |
| deck | 3,668 | 0.177 / 0.191 | 0.038 | **none** |
| deck | 1,748 | 0.126 | 0.053 | **none** |

The candidate's plaza is two stacked boxes filling their box, which is *correct for the
6,720-triangle plaza and three times too dense for the other*. Three facts follow, and
none of them is a generator tweak:

- **A candidate cannot cover less of its rectangle by shrinking.** `placeEntity` scales
  the local form until its AABB equals the Target AABB Extent exactly, so an inset plate
  is scaled straight back out to the walls. Lower coverage has to come from concavity or
  perforation. The authored plates confirm this is what they do: they reach the walls and
  still cover a third, and their footprint reach — mean offset from centre, doubled, as a
  fraction of extent — is 0.31 to 0.44 against 0.5 for a filled rectangle.
- **The decks are not rectangle-decomposable.** At a 96-cell raster over a 70-by-93 unit
  footprint, no rectangle reaches half a per cent of the box on any of the four, so the
  occupancy is narrower than about 0.7 units everywhere: planks and railings, not a slab.
  A bounded rectangle program cannot express that and a plate program should not pretend
  to; this wants a walkway family, and it is worth re-running the decomposition with a
  lower floor first to see how wide the boards actually are.
- **One kind, two assets, and the recipe cannot tell them apart.** The two plazas differ
  3-fold in coverage and the two bridges have opposite vertical massing — 9.8 per cent of
  the 8,160-triangle bridge's area is below mid-height against 62.7 per cent of the
  other's — while the recipe carries only anchor, extent, orientation and material. Any
  single unparameterised program is wrong for one of each pair. This is the village's
  actual blocker, and it is a design decision: either the recipe carries a compact
  per-entity form control, or these kinds split on a measured proportion the way
  `bamboo` and `bamboo-bed` did. Two placements is not enough to fit a split threshold
  on, so the recipe route is the honest one.

Do not reduce a plaza's coverage without matching where the coverage is. A candidate
filling its box against a reference covering fraction c scores IoU = c exactly, which is
the 0.367 already observed; a candidate covering c in uncorrelated places scores
c squared over twice-c-minus-c-squared, about 0.21 at a third. The pixel ratio would
report that regression as a fix. Every authored plate is centred to within 0.03 to 0.08
of its box centre, so a *centred* correction is correlated with the reference and does
not pay that penalty — which is the one thing that makes this tractable at all.
