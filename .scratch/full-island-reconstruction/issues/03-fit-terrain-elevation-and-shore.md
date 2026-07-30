# 03 - Fit terrain elevation and the shore profile

**What to build:** Bring the largest geometry residual down by fitting the Bounded Semantic Terrain Program's controls against the complete measured elevation field, inside the frozen control budget.

**Blocked by:** None.

**Status:** ready-for-agent — diagnosed, not yet fitted

## Where the residual actually is

Measured by sampling the reference elevation field and the generated program over the
same 129 by 129 probe grid the geography evidence uses, then binning by normalized
coastal radius. This overturns the obvious reading of the confusion matrix.

`sea->land` is 765 probes, and the confusion matrix alone suggests the island is too
big. It is not. Almost all of it is **inside** the coastline:

| normalized radius | misclassification | count |
| --- | --- | --- |
| n ~ 0.2 to 0.6 | sea->land | 979 |
| n ~ 0.8 | land->sea | 220 |
| n ~ 1.0 and beyond | either direction | 89 |

Mean absolute height error by band tells the same story:

| n | probes | mean error | max |
| --- | --- | --- | --- |
| 0.0 | 226 | 4.24 | 18.50 |
| 0.2 | 678 | 7.84 | 29.85 |
| 0.4 | 1120 | 8.26 | 26.03 |
| 0.6 | 1581 | 7.06 | 33.14 |
| 0.8 | 2019 | 3.83 | 37.04 |
| 1.0 | 2481 | 4.83 | 35.08 |
| 1.2 | 2923 | 4.13 | 33.16 |
| 1.4 | 2537 | 0.24 | 34.68 |

So two distinct defects, and the coastline is not one of them — it already passes its
own thresholds and the error outside n = 1.4 is 0.24 units.

1. **The reference has water inside the island and the candidate does not.** The
   program's interior is a flat `groundY` plateau plus summed landforms, with nothing
   that goes below the Semantic Sea Level. Every interior pool, lagoon, or stream bed
   reads as land. This is the single largest contributor to both the height residual
   and the classification failure, and it is where ticket 04's "any inner water"
   overlaps this ticket.
2. **The shore shelf drops too early.** At n ~ 0.8, 220 probes are land in the
   reference and sea in the candidate. `shore.shelfFraction` is 0.12, so the shelf
   begins at n = 0.88 and the ground has already started falling towards
   `seaLevel + beachHeight` before the reference's does.

## What the budget allows

Inner water is expressible without growing the budget: `channel` landforms already
contribute negative height. But all 40 landforms are in use, so inner water has to be
fitted by **re-allocating** landforms rather than adding them. Coast nodes have
headroom, 28 of 32, and noise octaves have headroom, 3 of 4 — but neither is where
this residual lives, so spending them would be spending the wrong budget.

That makes this a genuine fitting problem for the Reference-guided Fitting Loop:
choose which landforms earn their place against the measured field, rather than
hand-picking them. If 40 landforms plus one shore triple genuinely cannot express the
interior, that is the representation-boundary result the last checkbox asks for, and
it needs an ADR rather than a bigger budget.

- [ ] Add one non-interactive check that is red until terrain height and shore height evidence are inside their frozen thresholds.

- [ ] Add one non-interactive check that is red until terrain height and shore height evidence are inside their frozen thresholds.
- [ ] Improve the landform fit within the frozen budget of 32 coastline controls, 40 landforms, and 4 noise octaves.
- [ ] Fit the shore controls against the measured shoreline band rather than hand-picking them.
- [ ] Report height and slope separately over full, interior, and shore regions, keeping the worst region.
- [ ] Keep coastline symmetric distance, enclosed area, perimeter, and inlet matching inside their thresholds.
- [ ] Keep land, shore, and sea classification agreement above its threshold.
- [ ] Retain no elevation grid, regular sample array, per-vertex height, or distance field in production.
- [ ] If the frozen budget cannot reach the threshold, record that as a representation-boundary result with an ADR rather than growing the budget.
