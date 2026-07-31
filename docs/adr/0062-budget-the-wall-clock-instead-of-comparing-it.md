---
status: accepted
---

# Budget the wall clock instead of comparing it

`npm run check:scene-parity-foundation` regenerates the Foundation certification report and compares it byte for byte with the stored one. The report carries `generationMs`, a measurement of how long the machine took, so the check could never pass: three consecutive runs against a stored 538.5 produced 540.4, 524.5 and 529.5. It has been red for the whole milestone, structurally, with nothing wrong in the candidate.

That is the wrong instrument on the wrong quantity. An equality comparison is the right check for a count, a digest, a threshold, or a gate result — every one of which is deterministic here — and it is never the right check for a duration. A noisy measurement wants a ceiling.

## What changed

The report keeps `generationMs`, because it is evidence and deleting an inconvenient measurement is the failure mode this repository has written down several times. The *comparison* replaces every wall-clock field with a placeholder on both sides, and a frozen budget does the gating. `WALL_CLOCK_BUDGET_METRICS` is a one-element list and `test/scene-runtime-budget.test.mjs` asserts its contents, because excluding a field from a byte-for-byte comparison is one keystroke from excluding a field that should be compared. The same test asserts that every non-wall-clock budgeted value is an integer count, so nothing else can quietly become a float that drifts.

This also completes ticket 14, whose budgets had never been declared. `tools/acceptance/scene-runtime-budget.mjs` freezes five, measured **from the isolated production package** — the certification's temporary root with the Authored Reference, its data and every development tool absent — rather than from the development page, because a budget measured on a page that can reach the reference is not a budget on what ships.

| budget | ceiling | measured | headroom | what the ceiling forbids |
| --- | --- | --- | --- | --- |
| `generationMs` | 1,000 | 480.1 | 52.0% | returning to the 3.2 s generation that layered vegetation blades produced |
| `bundleGzipBytes` | 65,536 | 40,061 | 38.9% | a serialized asset; the authored geometry alone is 3.2 M triangles |
| `triangles` | 700,000 | 556,749 | 20.5% | buying silhouette agreement with unbounded tessellation, having peaked at 678,000 |
| `drawCalls` | 2,048 | 1,766 | 13.8% | returning to a mesh per blade, which drew 3,389 |
| `geometryBytes` | 41,943,040 | 26,637,868 | 36.5% | the 678,000-triangle state, which would have retained about 31 MiB |

Each ceiling is a declared requirement with a stated reason rather than the current measurement rounded up, and each reason names a specific regression it prevents. A budget that only says "a bit more than today" cannot be violated by anything except growth and so constrains no design choice.

`geometryBytes` needed a new measurement. `renderer.info.memory` counts geometries and textures, and a count cannot be budgeted — 1,752 geometries says nothing about whether the island retains 25 or 250 MiB. The production page now sums each geometry's attribute and index arrays once, plus an instanced mesh's own matrix and colour arrays, which is what a Code-only Production Runtime actually holds, since it retains no texture at all. The page's figure and an independent offline sum over the same generated scene agree exactly at 26,637,868 bytes.

## Two things the test does that the budget alone would not

**It refuses a missing measurement.** `evaluateSceneRuntimeBudget({})` fails every metric and reports `null` headroom rather than treating an absent value as inside the ceiling. That is this repository's most frequently repeated defect — ADR-0051's `semanticConfusion.worstFraction` returning `null` when nothing was confused, and the gate stack reading a null as missing evidence — and a budget evaluator is exactly the shape of code where it recurs.

**It refuses marginal headroom.** A budget under five per cent headroom is one accepted representation away from being a boundary result, and the ticket asks for headroom rather than for a pass. `drawCalls` is the tightest at 13.8 per cent and is worth watching: the remaining village work adds primitives.

No budget turned out to be unreachable, so there is no boundary result to record here. If one becomes unreachable later, ticket 14's own instruction applies — record it as a boundary with its own ADR rather than raising the ceiling.
