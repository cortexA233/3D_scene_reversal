# 09 - Reconstruct Distributed Scene Cover

**What to build:** Place the rock, pebble, grass, and cloud populations in their measured regions at their measured densities so ground and sky cover stops being effectively absent.

**Blocked by:** 03 - Fit terrain elevation and the shore profile.

**Status:** in progress — placement fixed, the gate is unmoved and the cause is
measured

- [x] Add one non-interactive check that is red until each population's region occupancy and density ratio are inside their thresholds. — `test/distributed-cover-reconstruction.test.mjs`, 5 assertions.
- [x] Settle ground populations on the generated terrain and keep sky populations in their measured shell. — and, which was the defect, only where that terrain is above water.
- [x] Compare by population identity, region occupancy, density, count, scale and orientation distribution, and neighbourhood statistics, never by instance pairing.
- [x] Report per-population evidence with the worst population retained.
- [x] Keep instancing within the draw-call budget. — 6,354 instances in 6 meshes; draw calls unchanged at 1,708.
- [ ] Fit each population's region shape, centre, and extent from the reference's own instanced bounds rather than from an inscribed ellipse.
- [ ] Keep the cloud population's visible contribution consistent with the atmosphere work. — cloud region centre error is 418 units and untouched.

## Fixed: cover was planted on the seabed

`buildPopulations` settled every ground instance on whatever terrain was under
it, with no test for whether that was land. A population's region is an ellipse
over the island, and an ellipse over an island is mostly water.

| population | authored floor | before | after |
| --- | --- | --- | --- |
| 900 | 13.31 | −49.65 | **12.71** |
| 4200 | 14.00 | −50.20 | **12.75** |
| 948 | 23.72 | 4.87 | **12.82** |
| 127 | 24.05 | 7.05 | **12.93** |
| 145 | 25.29 | 5.15 | **13.06** |

Density ratios held — 0.92/0.98/0.98/0.89/0.85 against 0.96/1.00/1.00/0.88/0.89 —
because the rule takes the *first* dry draw rather than the best of the batch.
Preferring the highest turns every instance into a search for local high ground:
tried, and it collapsed the ratios to 0.19.

**The authored floor is deliberately not a second filter,** though the recipe
carries it. Under the three small inland ellipses the candidate's terrain tops
out near 28 against floors of 23.7 to 25.3, so only 17 to 27 per cent of each
ellipse clears its own floor. Filtering on it rejected four draws in five. That
gap is ticket 03's terrain residual, and closing it from the cover rule would be
paying for one ticket's error out of another's statistic.

## Fixed: the instance scale was invented

Placement alone made the gate slightly *worse* — cover IoU 0.001371 to 0.000553,
candidate pixels 4,254 to 5,302 — because instances that had been hidden
underwater became visible. Correct property, wrong net effect, and the reason is
that they are the wrong size.

Both changes together: candidate pixels on the authored overview **5,302 to
2,199**, and the gate stack moved 6 metrics better against 3 worse, all three by
less than 0.0001 or 0.13 world units.

## Not fixed: cover is still seventeen times too visible

2,199 pixels against the reference's 128, and `cover` silhouette IoU is 0.0013
against a 0.302569 threshold. Two recipe inputs were invented rather than
measured; one is now fixed and one cannot be from the evidence that exists:

1. ~~**Per-instance scale**~~ — fixed. It was a hardcoded `scaleRange: [0.6, 1.6]` for every
   population in `build-scene-recipe.mjs`. The reference's own measured
   `worldSurfaceArea` divided by its instance count implies scales of 1.344,
   0.506, 0.696, 0.420 and 0.705 against a candidate RMS of 1.14 — four of the
   five are 1.6 to 2.7 times too large, and area goes as the square. This is
   derivable from the frozen inventory today, and now is: the recipe derives the
   magnitude from the measured area and keeps the spread as a declared shape
   rule. Cover pixels on the authored overview fell 5,302 to 2,199 against the
   reference's 128.
2. **Burial depth is unmeasured.** The reference's `overviewPixels` are 0, 0,
   105, 3 and 20: the two largest populations, spanning 590 by 552 units across
   the island, occupy *no* pixels on the overview. Authored ground rocks are sunk
   into the terrain. The candidate centres each instance on the surface, so half
   of every rock stands proud. Nothing in the inventory records the offset, so
   this one needs a browser-side measurement of per-instance Y against the
   terrain under it.

The frozen assertion is marked `todo` with that reason, unchanged.
