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

## Finding: these "placements" are material slices of one assembly, and the tree attempt was reverted

`tools/development/measure-ground-structure.mjs` scan-converts the horizontal projection
of a placement's lower height band at full triangle resolution. It was written to recover
the upright count this ticket records as unrecoverable — and it is unrecoverable from a
*radially averaged profile*, but not from the subject: a radial mean cannot separate N
posts at radius r from a solid cylinder of radius r, and a scan conversion of the same
band separates them at a glance.

Two findings came out of it, and the first one is bigger than the ticket.

**A `kind` here can be several material slices of one authored object.** The three
`wish-tree` entities sit at XZ (119.54, 28.2), (119.53, 27.82) and (120.73, 29.28) — the
same spot to within 1.2 units — with footprints of 51x61, 53x62 and 42x55 and *ceilings
within 5 units of each other* at y≈100-105. They are `Wish_tree_fbx__wishtreefbx_21__0`,
`__0001` and `__0002`: one authored tree exported as three meshes, each mesh's own AABB
promoted to its own Identity-bearing Scene Entity. `swing-tree` is the same, two slices at
x=236 plus two at x=239-243 plus one at x=280. Measured across the whole recipe, **137 of
672 entities** sit in 58 such stacks: 110 in `vegetation` (blossom, palm), 15 in
`structures` (two 5-slice `shop-stall` stacks, `swing-tree`, `wish-tree`), 6 in `paths`, 4
in `rocks`, 2 in `decorations`.

So the generator builds a whole tree, or a whole shop stall, inside each *slice's* box.
That is ADR-0057's finding a third time and worse: not "one kind is two assets" but "one
kind is one asset cut into pieces, and each piece is being asked to be the whole thing".
The controls have to be per entity, and they were: `baseMembers` (the band's connected
component count), `baseReach` (their cells-weighted mean centroid as a Chebyshev radius),
`baseThickness` (how far past it they reach). All three measured, 24 numbers for 8
entities. Do not re-derive the pooled per-kind reach for these kinds; it is an average
over three different forms.

**The form was built and reverted, and it is the third revert on the same mechanism.** A
ring of members on the square perimeter of the measured radius, spanning the band, then a
variant spanning up to the crown base. Both captured. The reverted numbers, per group,
mean over the six cameras:

| `structures` | before | band members | to crown base |
| --- | --- | --- | --- |
| silhouette IoU | 0.5010 | **0.4952** | **0.4952** |
| contour p95 | 13.87 | **14.62** | **14.59** |
| depth p95 | 58.86 | 58.43 | 58.43 |
| world normal p95 | 95.5 | **101.5** | **102.8** |
| candidate/reference pixels | 0.89 | 0.95 | 0.95 |

Three of four the wrong way on the group it targets. In the stack, `group contour distance
p95` went 25.48 to 27.46 and then 29.68, and `worst group contour distance` 151.62 to
151.62 and then 186.66, against `worst group depth p95` 118.40 to 116.61 and `worst group
silhouette IoU` 0.1099 to 0.1196 the right way. The radial statistics matched and the form
family did not transfer — a ring of twelve members is not what the authored assembly draws
at screen scale, whatever its reach profile says.

**Do not compare `byKind[...].mean` against `byKind[...].p95`.** A mid-flight reading of
this attempt did, and reported a halving that was not there. For the record, in the
reverted state: `wish-tree` mean 17.6162 / p95 20.6968, `swing-tree` mean 11.0575 / p95
19.6321, `deck` 18.701 / 21.1409, `plaza` 37.1074 / 38.0177, `bridge` 15.8742 / 18.8026,
aggregate 6.7521 mean with pooled p95 12.159 and worst 159.2395.

## Finding: `groupContourDistance` cannot referee a change to a neighbouring group

Worth reading before designing the next attempt, because it changes what evidence to
trust. The tree attempt moved `rocks` on `authoredOverview` by **one** candidate pixel —
IoU unchanged at 0.204 to six figures — and its contour p95 went **43.1 to 186.7**. On
`oblique-south`, thirteen pixels took it 7.2 to 53.7. `wildlife` did the same on three
pixels, 53.3 to 120.1. Neither generator changed.

The mechanism is in the metric and is not a defect in the sense ADR-0053 or ADR-0061 were.
`contourDistance` collects, for every reference contour pixel, its distance to the nearest
*candidate* contour pixel, so on a sparse scattered group one candidate pixel can be the
nearest neighbour for a whole region and removing it moves all of them at once.
`test/scene-pass-metrics.test.mjs` now holds this to an analytical fixture: nine candidate
pixels move IoU by 0.036 and multiply contour p95 by more than 1.8.

Two consequences. **Pair contour with the group's own IoU and pixel ratio** before
believing it — and note that `rocks` contour "nearly doubling" when ADR-0057 shrank the
plaza may have been partly this rather than uncovering. And making the metric robust is a
versioned gate revision needing its own reference-only recalibration and ADR, and it
invalidates every stored capture including the sixteen calibration partials; it is named
here rather than taken as a side effect of a form change, because a metric edited to
rescue the change that exposed it is a bought gate.

## Finding: the structures group's biggest slice is two tree kinds, and they are missing their ground structure

Ranked by authored overview pixels, `structures` is not mostly buildings:

| kind | n | overview px | surface p95 |
| --- | --- | --- | --- |
| `wish-tree` | 3 | **3,944** | 17.56 |
| `pavilion` | 1 | 2,792 | 18.78 |
| `pavilion-single` | 1 | 1,654 | 21.10 |
| `swing-tree` | 5 | **1,001** | 9.86 |
| `dessert-shop` | 1 | 737 | 9.17 |
| `tea-booth` | 1 | 621 | 9.38 |
| `dumpling-house` | 3 | 614 | 10.08 |
| `fruit-shop` | 7 | 536 | 2.95 |
| `shop-stall` | 16 | 457 | 2.88 |
| `ring-booth` | 1 | 101 | 12.65 |

The two tree kinds are **40 per cent** of the group's authored pixels across eight
placements — more than every shop and booth combined, and with enough placements to
support a family program unlike the single-placement pavilions.

Measured with the fixed massing tool, both say the same thing and it is not a canopy
problem:

| | authored base reach | candidate | authored base mass | candidate |
| --- | --- | --- | --- | --- |
| `wish-tree` | 0.661 | **0.314** | 9.4% | 12.7% |
| `swing-tree` | 0.616 | **0.095** | 22.3% | 11.5% |

The authored placements are broad all the way to the ground — reach 0.6 to 0.7 in the
bottom three deciles — while the candidate is a thin trunk, 0.07 to 0.13 for
`swing-tree`. The reason is that the placement is a tree **plus its structure**: a
swing's frame, a wish rack and its offerings. Its AABB covers the whole assembly and
the authored geometry fills the lower region out at radius 0.6, where `broadleaf` puts
a bare trunk on the axis.

`swing-tree` is also missing half its low mass outright, 11.5 per cent against 22.3.

**What to build, and the one thing the measurement cannot say.** The low mass belongs
*outward*, not on the axis — so the fix is uprights at the measured base reach carrying
the measured base share, which is a swing frame and a wish rack rather than a fatter
trunk. Widening the trunk into a solid taper at reach 0.65 would over-fill badly: reach
is a mean over samples, so a thin frame at radius 0.6 reads 0.6 while carrying almost no
area, and a solid column there would draw seven times the silhouette width down low.
The number of uprights is **not** recoverable from a radially averaged profile. Declare
it, say it is declared, and check the built share and reach against the measured pair —
do not present a chosen count as measured.

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
