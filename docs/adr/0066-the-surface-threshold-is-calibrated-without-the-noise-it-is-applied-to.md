---
status: proposed
---

# The surface threshold is calibrated without the noise it is applied to

`worldGeometry/surface p95` is frozen at **2.4875**. The scene reads **6.4967**. Measured,
**4.8964 of that is the metric comparing a form with itself** — and the calibration that
produced 2.4875 contains none of it.

This is proposed rather than accepted. It says a certified Foundation's threshold is
invalid as applied, which is not a fitting decision.

## The measurement

`surfaceDistance` compares two point clouds. `SAMPLE_CAP` is 96 per entity at every size,
so two independent samplings of the *same* surface are not the same 96 points and the
metric reads a non-zero distance between a form and itself.
`tools/development/measure-surface-metric-floor.mjs` measures that directly: each candidate
entity is sampled twice through the production path with only the per-mesh seed displaced,
and the two clouds are compared with the gate's own function. Nothing about the form
differs, so what comes back is what the metric reads when the answer is exactly right.

| kind | n | mean extent | floor p95 | measured | floor as share |
| --- | --- | --- | --- | --- | --- |
| mountain | 16 | 891.3 | 81.354 | 102.126 | 79.7% |
| plaza | 2 | 165.6 | 32.213 | 37.107 | 86.8% |
| name-plate | 1 | 41.7 | 18.531 | 18.570 | **99.8%** |
| pavilion | 1 | 67.8 | 15.544 | 15.533 | **100.1%** |
| deck | 4 | 85.2 | 14.965 | 18.701 | 80.0% |
| bridge | 2 | 72.5 | 13.247 | 12.535 | **105.7%** |
| bamboo | 72 | 62.9 | 4.122 | 6.785 | 60.7% |
| palm | 156 | 37.2 | 3.923 | 5.011 | 78.3% |
| rock | 39 | 17.1 | 3.685 | 3.881 | 94.9% |
| shop-sign | 6 | 17.4 | 2.809 | 2.620 | **107.2%** |
| blossom | 133 | 15.7 | 2.172 | 3.450 | 63.0% |
| paving-slab | 57 | 6.3 | 1.601 | 1.564 | **102.3%** |
| panda | 14 | 7.0 | 0.809 | 0.922 | 87.8% |

**Entity-weighted floor 4.8964, against a measured 6.4967 and a threshold of 2.4875.**

Six kinds measure at or below their own floor. `pavilion`, `bridge`, `shop-sign`,
`paving-slab` and `name-plate` are, at this sampling density, indistinguishable from a
perfect reproduction. Work spent fitting them was spent against noise.

The floor tracks entity size, which is the mechanism: 96 points over a 891-unit mountain
sit far apart, and the nearest-neighbour distance between two such draws is large.

## The calibration contains none of it

From `scene-calibration-v1.json`, the `surface p95` row:

```
samples: { mild: [0, 0.1803, 0.2284, 0.2622], severe: [14.7634, 9.1634] }
calibration: { separable: true, threshold: 2.4875, mildWorst: 0.2622, severeBest: 9.1634 }
```

**The identity control reads exactly 0.** Zero damage, zero distance. And the mild controls
— real `translate` and `extent` damage — read 0.18 to 0.26. If the calibration side carried
a redraw floor, nothing in that bracket could read below it.

It does not carry one because the reference is on both sides of every world-space control,
so both clouds come from the same authored meshes and their points correspond. The
candidate is a different mesh with different tessellation and a different area allocation,
so its samples are an independent draw. **The threshold was calibrated on a comparison whose
noise floor is 0 and is applied to one whose noise floor is at least 4.8964.**

At least, because the floor measured here is candidate against candidate. Reference against
candidate compares two different tessellations and can only be noisier. 4.8964 is a lower
bound.

## What it explains

- **The mountains.** Sweeping every continuous ridge control over a twelvefold range moved
  the mean by at most 5.91 per cent and the worst entity not at all. 79.7 per cent of that
  residual is floor. The controls were not weak; there was little there to move.
- **The fitted kinds that stayed put.** The pavilions were fitted twice and the second
  attempt is at 100.1 per cent of its floor.
- **The plaza at full coverage.** `plaza-p0308-p0265-p0070` has `footprintCoverage: 1` and
  is a filled rectangle in its own box, and reads 36.20. Its floor is 32.21.
- **Why every fit this milestone returned single-digit percentages** while the profile
  proxies moved by half.

## What it does not say

It does not say the gate is worthless. The severe bracket reads 9.1634 and 14.7634, above
the 4.8964 floor, so the metric still separates a badly wrong scene from a nearly right one
— the separation is just far narrower than the recorded margin of 0.25 suggests.

It does not say the threshold should be 4.9, or 6.5, or anything. Re-deriving it means
deciding whether the calibration bracket should be re-run with an independent redraw on the
damaged side, or whether the metric should be changed so it has no redraw noise — sampling
the reference and the candidate at corresponding parameter positions, or raising
`SAMPLE_CAP` with entity size. Those are different repairs with different costs and one of
them invalidates every stored capture.

And it does not touch the other layers. `fixedCameraGeometry` renders both subjects through
the same frozen cameras at the same resolution and does not sample point clouds at all.

## What was not done

The threshold is untouched, `SAMPLE_CAP` is untouched, and no gate changed state. Raising
`SAMPLE_CAP` would reduce the floor and is the obvious repair, but it invalidates every
stored capture including the sixteen calibration partials, and re-deriving a frozen
threshold on the strength of a finding is exactly the step that should not be taken by
whoever found it.
