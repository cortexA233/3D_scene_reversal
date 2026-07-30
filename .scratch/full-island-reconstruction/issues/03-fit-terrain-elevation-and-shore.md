# 03 - Fit terrain elevation and the shore profile

**What to build:** Bring the largest geometry residual down by fitting the Bounded Semantic Terrain Program's controls against the complete measured elevation field, inside the frozen control budget.

**Blocked by:** None.

**Status:** in-progress — the landform fit is multi-scale; height p95 fell 16.26 to 8.53

- [ ] Add one non-interactive check that is red until terrain height and shore height evidence are inside their frozen thresholds.
- [x] Improve the landform fit within the frozen budget of 32 coastline controls, 40 landforms, and 4 noise octaves.
- [ ] Fit the shore controls against the measured shoreline band rather than hand-picking them.
      They already are fitted, by `fitShoreControls`. What is not fitted is the shelf's *shape*: `shelfFraction`, `beachHeight`, and `shelfDrop` are three numbers for a transition the reference varies by azimuth.
- [ ] Report height and slope separately over full, interior, and shore regions, keeping the worst region.
      Height is reported over all three. Slope is not reported at all yet.
- [x] Keep coastline symmetric distance, enclosed area, perimeter, and inlet matching inside their thresholds.
- [ ] Keep land, shore, and sea classification agreement above its threshold.
- [x] Retain no elevation grid, regular sample array, per-vertex height, or distance field in production.
- [ ] If the frozen budget cannot reach the threshold, record that as a representation-boundary result with an ADR rather than growing the budget.

## Where the residual is

Measured by sampling the reference elevation field and the generated program over the
same 129 by 129 probe grid the geography evidence uses, then binning by normalised
coastal radius. This overturns the obvious reading of the confusion matrix.

`sea->land` was 765 probes, which suggests an island that is too big. It was not.
Almost all of it was **inside** the coastline:

| normalised radius | misclassification | count |
| --- | --- | --- |
| n ~ 0.2 to 0.6 | sea->land | 979 |
| n ~ 0.8 | land->sea | 220 |
| n ~ 1.0 and beyond | either direction | 89 |

Mean absolute height error by band said the same: 7.84 at n ~ 0.2, 8.26 at 0.4, 7.06
at 0.6, then 0.24 beyond n = 1.4. The coastline already passed its own thresholds and
was never the defect. The interior was.

**One correction to an earlier reading of this.** The program is not incapable of going
below the Semantic Sea Level: `channel` landforms carry negative height and the fit had
already allocated 17 of them, down to -63.23. The defect was not a missing feature
class. It was scale.

## What was changed

The fitter gave every landform the same radius, `max(spacing * 2.2, 40)`, so all 40
were 40-unit blobs and matching pursuit spent them part-explaining features that are
not 40 units across. `radius` is already a per-landform control in the Bounded
Semantic Terrain Program, so nothing about the budget changed: each landform now picks
its scale from four declared multiples of the base radius, chosen by which one actually
removes the most squared residual. The fit now uses radii 12, 24, 48, and 96.

Two constraints came out of measuring rather than from theory, and both are worth
keeping in mind before touching this again:

1. **Fine scales are interior-only.** Letting every scale go anywhere brought height
   p95 to 12.84 but pushed coastline symmetric p95 from 15.75 to 27.85, past its
   frozen threshold of 22.03 — buying one gate with another, which the milestone
   forbids. The coastline is where the terrain crosses the Semantic Sea Level, so a
   small sharp landform on the shore band moves the shoreline. Scales finer than the
   base radius are refused beyond normalised coastal radius 0.8.
2. **A peak no allowed scale can improve is skipped, not fatal.** The first version of
   the constraint ended the whole pursuit at such a peak and placed 2 landforms of 40,
   leaving the island unfitted at height p95 17.21 — worse than before the change.

## Result

| metric | before | after | threshold |
| --- | --- | --- | --- |
| terrain height p95 (full) | 16.2617 | **8.5320** | 5.26875 |
| height p95 (interior) | 14.1582 | **8.7434** | — |
| shore height p95 | 12.4923 | **7.9996** | 2.85035 |
| land and sea agreement | 0.903491 | **0.922721** | 0.931361 |
| coastline symmetric p95 | 15.7475 | 20.1984 | 22.02965, still passes |
| coastline area error | 1.97% | 3.57% | 10.55%, still passes |
| inlets matched | 9/9 | 9/9 | 9/9 |

World layout is untouched: 672/672 entities at anchor p95 0, extent p95 0, orientation
p95 0.

Interior and shore are now within a unit of each other, so what is left is the general
fidelity of a 40-landform representation rather than one missing feature class.

**Honest note on side effects.** The terrain surface is more detailed now, and four
fixed-camera metrics moved the wrong way inside a layer that was already failing all
ten: worst group contour distance 391.562 to 416.302, group world normal p95 71.994 to
74.976, group depth p95 29.811 to 30.406, semantic agreement 0.921404 to 0.920705.
Three moved the right way: per-group silhouette IoU 0.421857 to 0.437679, worst group
IoU 0.000709 to 0.001371, group contour p95 74.532 to 62.141. No layer changed state
and no passing metric started failing, but the trade is real and should not be called
a clean win.

## What to try next

- The shore triple is three numbers for a transition the reference varies by azimuth.
  `shelfFraction` alone cannot describe a beach that is wide on one side and steep on
  the other, and shore height p95 is 7.9996 against a threshold of 2.85035. Per-node
  shore controls on the coastline curve would cost coast-node budget, of which 4 of 32
  are spare.
- The noise has an octave spare, 3 of 4, but noise is not where this residual lives.
- Slope is not measured at all. The ticket asks for it, and a height fit that is right
  on average while wrong in gradient would look like this.
