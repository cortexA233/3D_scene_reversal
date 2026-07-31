---
status: accepted
---

# Carry plate footprint coverage as a per-entity control

The `plazas` group drew 1.89 times the reference's pixels at a silhouette IoU of 0.367, and the cause was not a footprint error in the sense the ticket assumed. Anchor and Target AABB Extent are exact for all 672 entities. What was wrong is that the generator's plaza filled its bounding rectangle and the authored plates do not fill theirs.

`tools/development/measure-plate-footprint.mjs` scan-converts the authored geometry's horizontal projection inside the reference page. Coverage of its own rectangle is **1.000** for one plaza and **0.341** for the other, and **0.126 to 0.191** across the four decks. The 96 gate samples cannot establish that — they can occupy at most 96 of a raster's cells, so a sparse plate and an under-sampled one look alike.

Three things follow, and the first two constrain the third.

**A candidate cannot cover less of its rectangle by shrinking.** `placeEntity` scales the local form until its generated AABB equals the declared extent exactly, so an inset plate is scaled straight back out to the walls. Lower coverage has to come from concavity or perforation. The authored plates do exactly that: they reach all four walls and still cover a third.

**Coverage alone cannot choose the shape, and choosing wrong is a regression that reports as a fix.** A candidate filling its box against a reference covering fraction *c* scores IoU = *c* exactly — which is the 0.367 already observed — while one covering *c* in uncorrelated places scores c²/(2c − c²), about 0.21 at a third. The pixel ratio would call that progress. What separates the two is *where* the coverage is, and one number captures the difference: on the unit square a perimeter walk and crossing paths of equal area have footprint reach 0.71 and 0.28. So the second control is `perimeterShare`, inverted from the authored reach against those two closed forms. It comes out at 0.156 to 0.262 across the four decks — a tight cluster for four placements measured independently — and 0.674 for the sparse plaza. The filled plaza is the degenerate case where both forms coincide at 0.5, and its measured reach is 0.483 against the closed form's 0.500, which is the model checking out against the thing it models.

**One kind is two different assets and nothing in the recipe distinguished them.** The two plazas differ threefold in coverage; the candidate's solid box was correct for one of them and three times too dense for the other. Two placements is far too few to fit a split threshold on the way `bamboo` and `bamboo-bed` were split on a measured proportion with a clean gap and 130 placements, so the honest route is the one ticket 07 already asked for: compact per-entity controls. The entity carries `shape: { footprintCoverage, perimeterShare }` — two scalars, against the three the anchor already carries — and a test asserts those are the only two keys, because a per-entity form list is not a reconstruction.

The generator is a walk and two crossing paths, named as the passages they are, and it degenerates to a filled plate at full coverage. Coverage means the *union*, so the two components' areas are grown by their overlap in a short fixed-point loop until the union lands on the target; the first version left the overlap uncorrected and its own test caught it at 0.527 against 0.568.

The result, and the part worth reading twice:

| | before | after |
| --- | --- | --- |
| `plazas` candidate/reference pixels | 1.89 | **1.12** |
| `plazas` silhouette IoU | 0.367 | **0.398** |
| `plazas` contour p95 | 17.63 | **13.24** |
| `plaza` surface p95 | 42.75 | **34.05** |
| group contour distance p95 | 29.64 | **27.70** |
| worst group contour distance | 223.84 | **186.24** |
| worst group silhouette IoU | 0.0680 | **0.1099** |
| group depth p95 | 21.10 | **20.96** |
| semantic agreement | 0.9414 | **0.9446** |
| worst semantic confusion fraction | 0.0259 | **0.0176** |
| group world normal p95 | 79.37 | 80.41 |

Nine of the ten gated rendered metrics improved. That is worth stating against the previous attempt on this village, which matched a massing profile and regressed six of eight — the difference is that this one was validated on the layer it was meant to fix before it was believed.

The knock-on effects are the interesting part and they are not all favourable. `paths` contour fell 111.5 to 81.1 and `geography` 16.7 to 12.4, while **`rocks` contour nearly doubled, 25.6 to 47.9**, and `bridges` IoU slipped 0.370 to 0.360. None of those groups changed. An over-drawing plaza was covering them, and shrinking it to its measured footprint uncovered errors that were already there. That is what should happen, it is why the aggregate still improved, and it means a group's score can be propped up by a neighbour's over-draw — so per-group numbers measured while another group over-draws are not independent.
