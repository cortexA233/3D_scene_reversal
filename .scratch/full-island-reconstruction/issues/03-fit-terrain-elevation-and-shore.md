# 03 - Fit terrain elevation and the shore profile

**What to build:** Bring the largest geometry residual down by fitting the Bounded Semantic Terrain Program's controls against the complete measured elevation field, inside the frozen control budget.

**Blocked by:** None.

**Status:** boundary recorded (ADR-0054). The landform fit is multi-scale and height
p95 fell 16.26 to 8.53; the budget's capability is now measured, and 40 landforms cannot
reach 5.26875 while about 101 can. One in-budget attempt remains and is named below.

- [x] Add one non-interactive check that is red until terrain height and shore height evidence are inside their frozen thresholds. — `test/terrain-reconstruction.test.mjs`, 4 assertions; the height one is marked outstanding with ADR-0054 as its reason, and a second asserts the fit has not bought height with the coastline.
- [x] Improve the landform fit within the frozen budget of 32 coastline controls, 40 landforms, and 4 noise octaves.
- [ ] Fit the shore controls against the measured shoreline band rather than hand-picking them.
      They already are fitted, by `fitShoreControls`. What is not fitted is the shelf's *shape*: `shelfFraction`, `beachHeight`, and `shelfDrop` are three numbers for a transition the reference varies by azimuth.
- [x] Report height and slope separately over full, interior, and shore regions, keeping the worst region.
      Both are, over all three, and always were — the note that slope was missing was stale.
      `compareGeography` reports slope p95 0.412 full, 0.4345 interior, 0.4650 shore. It is not
      gated; the new check asserts it is present so a future gate has evidence to gate on.
- [x] Keep coastline symmetric distance, enclosed area, perimeter, and inlet matching inside their thresholds.
- [ ] Keep land, shore, and sea classification agreement above its threshold.
- [x] Retain no elevation grid, regular sample array, per-vertex height, or distance field in production.
- [x] If the frozen budget cannot reach the threshold, record that as a representation-boundary result with an ADR rather than growing the budget. — ADR-0054, and it is a *count* boundary rather than a family one: detail below the program's own finest landform radius has p95 2.428, under both thresholds, so the family is adequate and only the count is short.

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

## The budget's capability, measured

`tools/development/measure-terrain-form-budget.mjs` runs the production landform
pursuit at increasing budgets and reports what each reaches, against the frozen
thresholds. Each row is an **upper bound** for that budget, because matching
pursuit is greedy.

| landforms | full p95 | full mean | interior p95 | shore p95 |
| --- | --- | --- | --- | --- |
| 10 | 18.901 | 5.852 | 19.524 | 15.984 |
| 20 | 15.800 | 4.685 | 16.537 | 10.857 |
| **40, frozen** | **8.657** | 3.119 | 8.987 | 8.128 |
| 60 | 7.492 | 2.722 | 7.492 | 7.447 |
| 80 | 5.937 | 2.217 | 5.711 | 6.127 |
| 120 | 4.673 | 1.861 | 4.251 | 5.135 |
| 160 | 4.198 | 1.677 | 3.597 | 4.976 |
| 240 | 3.389 | 1.391 | 2.693 | 4.536 |
| 320 | 3.004 | 1.212 | 2.161 | 4.121 |

Thresholds: full height p95 **5.26875**, shore height p95 **2.85035**.

Two different results, and they need separating.

### The full and interior height gates are budget-bound

Interpolating between the 80- and 120-form rows, the full gate is crossed at about
**101 landforms against a frozen budget of 40** — two and a half times the budget.
The curve is smooth and monotone with no sign of the fitter stalling: 20 to 40
forms removed 7.14 units of p95 and 80 to 120 removed 1.26, which is the shape of a
representation running out of capacity rather than a search running out of luck.

**This is evidence, not proof, and the difference matters.** Each row is a greedy
upper bound, so a better fitter at 40 forms might beat 8.657. What can be said is
that reaching 5.26875 at 40 forms would require beating the greedy fit by 39 per
cent while the greedy fit needs 80 forms to get to 5.94. ADR-0052 could do better
than this — it had an exact dynamic-programming bound — and the honest analogue
here would be a lower bound on K-term approximation error for these landform
families. That is why no ADR is written yet.

### The shore height gate is not budget-bound, and this is the real finding

Shore p95 flattens where the interior keeps falling: at 320 landforms the interior
is 2.161 and the shore is 4.121, still far above its 2.85035 threshold, improving
by only 0.385 per 0.42 doublings. Extrapolating that rate, the shore gate would
need thousands of landforms — which is another way of saying **more landforms will
never fix it.**

The cause is in this ticket's own previous round. Scales finer than the base radius
are refused beyond normalised coastal radius 0.8, because letting them in pushed
coastline symmetric p95 from 15.75 to 27.85 past its 22.03 threshold. That
constraint protects the coastline gate and it is correct, but it deliberately
starves the shore band of the only controls that could resolve it. So the shore
band is left with the three-number shelf — `shelfFraction` 0.12, `beachHeight` -1,
`shelfDrop` 0.4 — and nothing else, and 4.1 units is what that shelf is worth.

**One correction to this ticket's earlier next-step note.** It proposed per-node
shore controls because "the reference varies by azimuth". Measured over 24
azimuths, the candidate-minus-reference signed bias in the shore band runs -4.9 to
+6.6 while the absolute p95 is 8.89, so the residual is mostly *not* a systematic
per-azimuth offset and per-node controls would be fixing the smaller term. What the
three numbers cannot express is the shelf's **radial** shape: a single smoothstep
from `groundY` to sea level over a fixed fraction of the radius. The measured
reference is nothing like that at 8 of 24 azimuths, where it is already below sea
level at half the coastal radius — those are the nine inlets, and they are carried
by `channel` landforms that the fine-scale constraint then forbids near the shore.

## What to try next

- **The shelf's radial profile, not its azimuthal variation.** Three numbers buy one
  smoothstep. The measured transition is not one, and the fine-scale constraint means
  landforms cannot make up the difference in the band where it matters. Any change
  here has to be checked against coastline symmetric p95, which is the gate the
  current constraint exists to protect — that pairing is the whole difficulty.
- **A lower bound before an ADR.** If the full-height gate is to be recorded as a
  budget boundary, it needs better than a greedy curve. The horizon precedent
  (ADR-0052) computed an exact bound by dynamic programming; the terrain analogue is
  harder because landforms are two-dimensional and overlapping, but even a bound over
  a restricted family would be stronger than what exists now.
- Slope is still not measured at all. The ticket asks for it, and a height fit that
  is right on average while wrong in gradient looks exactly like this one.
- The noise has an octave spare, 3 of 4, and it is still not where this residual
  lives: value noise is uncorrelated with the reference's own detail, so raising its
  amplitude adds error as often as it removes it.

## Ticket 06 depends on this more than its checkbox suggests

Measured at the entities' own anchors, the terrain misfit beneath the `paths` group
is 4.73 units mean against a mean slab thickness of 0.67: **37 of 60 paving slabs
float entirely above the candidate terrain and 13 are fully buried.** `paths` owns
two of the ten fixed-camera gates because of it. Details in ticket 06.
