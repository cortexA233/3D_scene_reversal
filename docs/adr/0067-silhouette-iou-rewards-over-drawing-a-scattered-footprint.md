---
status: accepted
---

# Silhouette IoU rewards over-drawing a scattered footprint

`paths` draws 2.927 times the reference's pixels and scores a silhouette IoU of 0.2233.
Building it correctly would take the pixel ratio to about 1.0 and the IoU **down to 0.1027**.

The metric prefers the wrong answer by a factor of 2.17 on the rendered group and 1.75 in a
constructed fixture where both sides are known. This is proposed
rather than accepted for the same reason as ADR-0066: it says a calibrated gate is
measuring the wrong thing, which is not a fitting decision.

## What the authored paving slab actually is

`measure-plate-footprint.mjs` now carries the occupancy out as well as reducing it, because
the rectangle decomposition claimed only 5 of 42 `paving-slab` assets and a coverage number
alone cannot be built from. The 24x24 map of a median slab:

```
|         .   .          |
|    ..  .....  .        |
|    ..... +++  + .      |
|  ..+  .++.++++..+.     |
|  +#.+#++#.+ ++.++.+.   |
| . .+++. .. ...##+..+   |
|  ..  + ... #. +++..  . |
|   +   .. +.#    . .++  |
|        ++. .     ..++. |
|      +.#.++.+++.+.  .  |
```

It is not a slab. It is a **scatter of small stones** — a patch of cobbles — which is why no
rectangle in it reaches even half a per cent of the box and why the decomposition returned
nothing. Median coverage is **0.1862** across 42 assets and 57 placements. The candidate is
a single solid hexagon covering about 0.75 of the same box.

## The arithmetic, and it matches the measurement

Two cases, both elementary:

- A **solid blob** of coverage `C` that contains the scatter intersects all of it and unions
  to `C`, so it scores `c / C`. Here `0.1862 / 0.75 = 0.2483`.
- **Two independent scatters** of the same coverage `c` intersect at `c^2` and union to
  `2c - c^2`, so they score `c / (2 - c)`. Here `0.1862 / 1.814 = 0.1027`.

The first predicts **0.2483** against an **observed 0.2233** — ten per cent, from first
principles, over six cameras and a group that also contains three `path-stone`. The model is
right.

So a faithful reproduction scores **0.413 times** what the current wrong one scores. The
hexagon is not winning despite being three times too big; it is winning *because* it is
three times too big. A blob that swallows the scatter keeps the whole intersection and pays
only in union, while a correct scatter loses the intersection to sub-instance misalignment
that a Procedural Replacement is explicitly not required to reproduce.

## Put to the gate's own function

The algebra above is checked against a rendered group, which is the right first test and a
weak one: a rendered group has occlusion, mixed kinds and a camera in it. So the same
question is put to `silhouetteEvidence` directly, on masks built in
`test/scattered-footprint-metrics.test.mjs` where both sides are known because both were
constructed. One reference scatter at the measured coverage; one candidate reproducing its
statistics exactly with different instance positions; one candidate that is a single disc
four times too big.

| candidate | IoU | contour p95 | contour mean | draw ratio |
| --- | --- | --- | --- | --- |
| faithful scatter | **0.1045** | **16.556** | 6.125 | 1.003 |
| over-drawn blob | **0.1824** | 96.000 | 33.798 | 4.014 |

`c / (2 - c)` predicts 0.1027 against an observed 0.1045. The effect is real, it is in the
gate's own code, and being right costs 43 per cent of the IoU.

**And the claim about contour distance survives the test, which it needed to** — it was
asserted in the first draft of this ADR before anything checked it. Contour prefers the
faithful scatter by a factor of 5.8, 16.556 against 96.000, and the draw ratio prefers it
outright at 1.003 against 4.014. Two of the three metrics rank the candidates correctly.

With one qualification that matters: **contour's own floor on a scatter is 16.556, against a
threshold of 6.536774.** So a faithful scatter cannot *pass* the contour gate either. It can
only rank above a wrong one. Contour is the usable metric here in the sense that it points
the right way, not in the sense that it can be satisfied — which is the same distinction
ADR-0066 draws about the surface gates, arrived at independently.

The rendered `paths` group reads 75.99, between the fixture's faithful 16.556 and its blob
96.000, which is what a group containing both a scatter and three blockier `path-stone`
should read.

## It explains `cover`, the worst group on the island

`cover` scores IoU **0.0144**. Its populations are scattered small instances, and
`c / (2 - c)` for a sparse scatter is approximately `c / 2` — so an IoU near 0.014 is what
two independent draws of a population covering about three per cent of frame would score
whatever their statistics. The standing note against that gate says the remaining gap is
"generator form rather than distribution", and the form argument may well be right, but no
amount of form work moves a number whose ceiling is set this way.

## What this costs the milestone

ADR-0066 established that the three `worldGeometry` surface gates are below their own
sampling floor, and concluded that `fixedCameraGeometry` was the one layer where fitting
effort was guaranteed to be measuring the candidate. **That conclusion was too broad.** It
holds for solid, singular subjects — `geography` at 0.9441, `horizon` at 0.7927,
`vegetation` at 0.7129. It does not hold for the two worst groups, which are precisely the
scattered ones.

The three groups whose IoU is lowest — `cover` 0.0144, `paths` 0.2233, `plazas` 0.3899 — are
the three whose footprints are least like a single blob.

## What it does not say

The over-draw is still real and still wrong. `paths` drawing 2.927 times the reference's
pixels is a genuine defect that a human reviewer would see immediately, and the contour p95
of 75.99 against a 6.536774 threshold is measuring something true — contour distance does
not share this pathology, and the fixture above shows it ranking the faithful scatter 5.8
times better rather than worse.

So the repair is probably not to stop caring about IoU on these groups but to notice that
**contour distance and the draw ratio already say the right thing where IoU does not**, and
that this is now measured rather than supposed. A gate stack that reads IoU, contour and
pixel ratio together would have caught the paving slab long ago; reading IoU alone rewards
keeping it.

## Outcome — built, and two of three predictions were wrong

`paving-slab` was rebuilt as a scatter, authorized. It now carries per-entity
`footprintCoverage` through the same recipe path the plaza and deck use — 57 placements
from 0.1145 to 0.8028 — and the generator places `coverage / (pi * r^2)` flat stones with
four pinned to the box edges so the AABB contract does not inflate them.

This ADR predicted three things. **One held and two did not:**

| | hexagon | scatter | predicted |
| --- | --- | --- | --- |
| draw ratio | 2.927 | **1.649** | improves — **held** |
| contour p95 | 75.990 | 82.754 | improves — **wrong, it worsens** |
| silhouette IoU | 0.2233 | 0.2184 | falls to ~0.1027 — **wrong, it barely moves** |

Grain size is not the explanation: at a stone radius of 0.07 contour read 83.042 and at
0.045 it read 82.754, so it sits near 83 either way while the hexagon sits at 76.

The fixture that produced the predictions compared a scatter against *the same statistical
scatter* in an empty frame. The real group is 57 paving slabs plus three blockier
`path-stone`, with occlusion, terrain beneath, and an authored footprint whose structure a
uniform random placement evidently does not reproduce. **The algebra was right about what
IoU does to two independent scatters and wrong about this group**, which is the difference
between a fixture and a scene, and is the limitation the fixture's own docstring claims to
be free of.

So the trade actually taken is: **the draw ratio improves by 44 per cent, and the two gate
metrics get slightly worse** — contour by 9 per cent, IoU by 2, with `surface p95` also
1.3 per cent worse because the scatter's stones sit where the reference's do not.

Whether that is worth having is now a different question from the one that was authorized.
The over-draw was the defect a human reviewer would see, and it is substantially repaired;
but no gate metric improved, and the argument that two of three would has not survived
contact with the scene.

## What was not done

No threshold moved and no metric changed. The IoU pathology itself is untouched: nothing
here stops the gate preferring a blob over a scatter, it just no longer has a blob to
prefer on this kind. Whether `silhouetteIoU` should be read alongside contour and the draw
ratio rather than alone is still open, and `cover` at 0.0144 is still bounded the same way.
