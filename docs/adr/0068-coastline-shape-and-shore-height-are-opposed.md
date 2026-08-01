---
status: accepted
---

# Coastline shape and shore height are opposed

Making the coastline follow its subject more closely in plan makes the shore's *heights*
less accurate. That is a real trade between two gated measurements, it is not a fitting
error, and it closes the route that looked most promising for `shore height p95`.

## Why this was investigated

`shore height p95` reads **7.9996 against a threshold of 2.85035** and was the only red
metric on the island with no recorded remedy. ADR-0054 says it "is not reachable by adding
forms at all", which is correct and incomplete: landforms are inland masses and do not
govern the shore. The terrain program has three budgets, not one, and only one was spent.

| control | used | budget |
| --- | --- | --- |
| landforms | 40 | **40 — at the cap** |
| coastNodes | 28 | 32 |
| noiseOctaves | 3 | 4 |

So the promising reading was that the shore is governed by the two controls with headroom,
and that ADR-0054 had recorded a boundary belonging to the one that does not touch it.

## The real constraint was the separation rule, not the budget

The fit was using 28 of 32 permitted coast nodes, and raising the budget would have changed
nothing. `chooseCoastControls` reserves `sweep / (budget * 3)` steps around each chosen
node — 15 of 1440 — and the authored shoreline's extrema are closer together than that. The
budget was never reached.

This is the second time in this milestone that a recorded "budget boundary" turned out not
to be binding; `HORIZON_PEAK_CAP` was the first, where the groups carried at most 5 summits
against a cap of 8. **A cap that has never been reached is not the constraint, and the two
are worth checking together whenever a budget is cited as a boundary.**

Relaxing the rule to `sweep / (budget * 6)` takes the fit to 32 of 32 immediately.

## What it measures, and the trade

| | baseline | 32 nodes, 4 octaves | 32 nodes, 3 octaves |
| --- | --- | --- | --- |
| coastline symmetric p95 | 20.1984 | **19.5534** | 19.6612 |
| coastline area error | 3.57% | **3.38%** | 3.40% |
| **land and sea agreement** | 0.922721 | 0.9233 | **0.9237** |
| **terrain height p95** | **8.532** | 8.9174 | 8.9029 |
| **shore height p95** | **7.9996** | 8.2966 | 8.218 |

Bold rows are gated. **Every coastline shape measure improves and every height measure gets
worse**, and the fourth noise octave is not the cause — the third column isolates it, and
the regression is entirely the coast nodes.

The mechanism is not subtle once seen. More nodes let the coastline curve track the
reference's plan more closely, which moves where the land/sea boundary sits; the height
field is compared at those positions, so a boundary that has moved compares its heights
against different ground. Plan accuracy is bought with height accuracy.

One of the three gated metrics improves — `land and sea agreement` 0.922721 to 0.9237,
against a 0.931361 threshold it still does not meet — and two regress. **It is reverted.**
`fit-terrain-program.mjs` is byte-identical to what it was and every number above returns
to its baseline column.

## What this leaves

`shore height p95` has no known remedy, and now has one more piece of negative evidence
than it had: adding coast nodes is not it, and neither is the fourth octave.

Two things worth carrying forward.

**The shore is the best of the three regions, not the worst.** It reads 7.9996 where the
interior reads 8.7434 and the whole terrain 8.532. It is red because its threshold is
almost twice as tight — 2.85035 against 5.26875 — which the calibration derived because the
shore band separates mild from severe damage at a lower value. Reaching it means cutting
the shore's error to 36 per cent of what it is, on the region that is already fitted best.

**The opposition is the finding.** Any future attempt that improves the coastline's plan
should expect the height metrics to move against it, and should measure both before
claiming either. Nothing in the gate stack pairs them, so it is possible to report a
coastline improvement that costs more than it gains and not notice.
