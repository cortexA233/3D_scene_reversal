---
status: accepted
---

# Build the bridge as a band along its measured axis

`bridges` was the last unexplained man-made over-draw: 2.22 times the reference's pixels at a silhouette IoU of 0.3624, with the highest per-group world-normal error on the island at 107 degrees. Two attempts had already been reverted — the plate at ADR-0057's coverage and deck height, and then a first band — and both failed the same way, four rendered metrics improving while IoU fell about 20 per cent.

The form is now a **deck band along a measured axis**, and it clears the bar the previous two missed.

## What the controls are, and why four

All four come from `plate-footprint-v1.json`, which scan-converts the authored footprint in the reference page:

| control | 8,160 tri | 6,216 tri | derived from |
| --- | --- | --- | --- |
| `deckAxis` | **-119.2°** | **+136.1°** | bearing between the two largest rectangles of the decomposition |
| `deckHeight` | 0.7119 | 0.4428 | centroid of the vertical area profile |
| `footprintCoverage` | 0.5677 | 0.4315 | scan-converted coverage of its own rectangle |
| `subDeckShare` | 0.098 | 0.627 | area below mid-height |

The profile's *spread* is a family constant at 0.1857 rather than a fifth control, because the two agree on it to 1.5 per cent — 0.1842 against 0.1871 — while `deckHeight` differs two-fold. That division was measured, not chosen.

`subDeckShare` earned its place empirically. With one abutment size for both, `bridges` depth p95 went the wrong way, 20.77 to 22.43: a single size leaves the arched bridge hollow where 62.7 per cent of its area is solid. The number was already sitting in the same vertical profile `deckHeight` comes from.

## The geometry leaves less freedom than it looks

`placeEntity` scales the generated AABB onto the Target AABB Extent exactly, so the band has to reach all four walls, and that sets a **minimum** width — 0.3849 at 60.8 degrees, covering 0.4409, and 0.0271 at 136.1 degrees where the axis is almost the box diagonal and the constraint costs nothing. Both measured coverages are *above* their own minimum, so a single band clipped to the box reaches both and no filler is needed to make the numbers work. That is worth stating because inventing one is the obvious alternative.

The footprint is the unit square clipped to the band by exact polygon arithmetic, and the width is bisected from the measured coverage because the clipped area is monotonic in it. No fitted constant anywhere in the form.

## The bug that made the first band worse than random

The first band scored IoU 0.2885 — *below* the c²/(2c − c²) ≈ 0.33 that ADR-0057's arithmetic predicts for covering the right fraction in **uncorrelated** places. A form agreeing with the reference less than random placement of the same area is not mis-parameterised; something is inverted.

It was. `ExtrudeGeometry` builds in the shape's own XY plane and `rotateX(-PI/2)` sends shape-Y to world **-Z**, so feeding the footprint's z straight into the shape's Y mirrors the plan. That turns +136.1 degrees into -136.1 — and this scene is the worst possible place for that bug to hide, because the two bridges occupy almost exactly that pair of axes, so each bridge was built along *the other one's diagonal*.

Two things follow for anyone extruding a footprint here. The `plate` program uses the same pattern and is unaffected only because its walk-and-crossing-paths footprint is symmetric under that mirror. And the check that caught it is worth keeping: `test/bridge-reconstruction.test.mjs` measures the *built* deck's principal axis and compares it to the control, on a deliberately narrow band because at the real coverages the clipped hexagon nearly fills the square and its principal axis is ill-conditioned.

## Result

| `bridges` | plate | band |
| --- | --- | --- |
| silhouette IoU | 0.3624 | **0.5837** |
| contour p95 | 20.49 | **9.70** |
| depth p95 | 20.77 | **17.86** |
| world normal p95 | 107.0 | **82.5** |
| candidate/reference pixels | 2.22 | **1.31** |
| `bridge` surface p95 mean | 15.8742 | **12.5352** |

Seven of the ten gated fixed-camera metrics improved, one regressed, two were unchanged:

| | before | after |
| --- | --- | --- |
| group silhouette IoU | 0.472084 | **0.493780** |
| worst group silhouette IoU | 0.109859 | **0.111429** |
| group contour distance p95 | 25.486471 | **23.773317** |
| group depth p95 | 20.853705 | **20.585709** |
| group world normal p95 | 78.426184 | **76.136019** |
| semantic agreement | 0.944713 | **0.946068** |
| worst camera semantic agreement | 0.909701 | **0.910849** |
| worst semantic confusion fraction | 0.017581 | 0.018105 |
| worst group contour distance | 151.6212 | 151.6212 |
| worst group depth p95 | 118.403257 | 118.403257 |

World geometry improved too, which neither reverted attempt managed: aggregate `surface p95` 6.7535 to **6.7436**.

The knock-on confirms the over-draw diagnosis rather than contradicting it. `rocks` contour fell **24.06 to 16.79** and its IoU rose 0.3804 to 0.3929, `geography` contour 12.40 to 12.05, `vegetation` 8.55 to 8.34 — none of those generators changed. An over-drawing bridge had been covering them, exactly as ADR-0057 recorded for the plaza, and the group scores measured while it over-drew were not independent of it.

Two residuals are named rather than smoothed. `worst semantic confusion fraction` rose 3 per cent, which is the one gated metric this cost. And the pixel ratio is 1.31 rather than 1.0: the band covers its measured *plan* fraction, and the remaining over-draw is vertical — the deck slab is a constant 0.30 of each bridge's height where the authored spread implies a thinner deck on the flat span.
