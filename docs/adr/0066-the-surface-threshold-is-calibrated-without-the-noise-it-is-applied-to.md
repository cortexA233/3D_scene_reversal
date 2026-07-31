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

## It is sampling sparsity, and the cure is quantified

The diagnosis rests on the floor being *sampling noise* rather than something else, so it is
tested rather than argued. If it is sparsity, raising the sample count must drive it down at
the rate a nearest-neighbour spacing falls -- one over the square root of n in a
two-dimensional sampling, so four times the samples halves it. Entity-weighted over all 672:

| samples/entity | floor p95 | predicted | over-tolerance floor | worst-entity floor |
| --- | --- | --- | --- | --- |
| **96 (shipped)** | 4.8990 | 4.8990 | **0.4701** | 111.54 |
| 192 | 3.6143 | 3.4641 | 0.3754 | 71.45 |
| 384 | 2.5479 | 2.4495 | 0.2814 | 51.03 |
| 768 | 1.8188 | 1.7321 | 0.1890 | 36.92 |
| 1536 | 1.2929 | 1.2248 | 0.1135 | 26.47 |
| *threshold* | *2.4875* | | *0.1153* | *14.037975* |

It tracks the prediction to within four to five per cent over a sixteenfold range, which is
what sparsity looks like and what nothing else does.

**All three worldGeometry surface gates are below their own metric's noise floor**, and by
very different margins:

- `surface p95` needs about **4x** the samples for its floor to reach 2.4875, and 8x to have
  real headroom under it.
- `over-tolerance surface fraction` needs about **16x**. Its floor at the shipped density is
  **0.4701 against a 0.1153 threshold** -- four times the threshold -- and the scene
  currently measures 0.5865, so eighty per cent of that number is floor. This metric has
  never been quoted with a floor beside it.
- `worst entity surface p95` needs roughly **57x**, extrapolating the same law from 26.47 at
  1536 samples toward 14.037975. It is a maximum over entities, so its floor is set by the
  largest entity rather than the average, and no plausible budget reaches it.

That last row is the useful one for whoever picks this up: the three gates do not fail
together for one reason, and a single change to `SAMPLE_CAP` would fix them at three
different costs. Sixteen times the sampling is not free, and fifty-seven times is a
different conversation from four.

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
