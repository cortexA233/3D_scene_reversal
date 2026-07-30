# 07 - Reconstruct architecture and bridge silhouettes

**What to build:** Rebuild the pavilions, booths, shops, houses, and bridges as roofed, posted, multi-level forms whose silhouettes and part counts match the authored buildings.

**Blocked by:** 06 - Reconstruct plazas, decks, paving, and path stones.

**Status:** measured, and one attempt made and reverted. The authored massing is now
known and the previous form was inverted against it; the fix regressed six of eight
rendered gates and was not kept. Read the two findings below before trying again.

- [ ] Add one non-interactive check that is red until the structures and bridges groups reach their calibrated per-group silhouette thresholds.
- [ ] Build one architecture family program with compact per-entity controls for levels, eaves, platform, posts, and roof pitch.
- [ ] Build a bridge program with deck, railing, abutment, and arch as separate semantic parts.
- [ ] Keep the family's controls compact; a per-building transform list is not a reconstruction.
- [ ] Keep every entity's anchor and Target AABB Extent exact.
- [x] Report per-group silhouette, contour distance, depth, and world normal with the worst camera retained. — and the authored massing profile, which nothing measured before: `tools/development/measure-architecture-massing.mjs`.
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

## What the next attempt needs

1. **Validate against the rendered gates, not the surface profile.** Contour distance
   and depth are what this group fails on, and a form can match the mass distribution
   while adding edges. A capture is two minutes; take it before believing a profile.
2. **Fewer, smoother surfaces rather than more boxes.** The authored body is smooth at
   screen scale. A single tapered shell that widens towards the eave will reproduce the
   reach profile without eight silhouette seams.
3. **The sampler first.** The massing profile is bounded by the same per-mesh sample
   allocation that penalises part structure everywhere else: the new thin plinth is its
   own part and drew 25.9 per cent of the samples in the base decile where the authored
   building has 4.6, and the three single-placement kinds have 96 samples each, which
   is enough for the sign of a taper and nothing finer. Fitting per-kind massing before
   that is fitting a distorted measurement.
