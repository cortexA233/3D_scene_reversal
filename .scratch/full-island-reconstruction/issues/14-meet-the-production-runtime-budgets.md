# 14 - Meet the Production Runtime budgets

**What to build:** Bring generation time, bundle size, draw calls, triangles, and memory inside declared budgets, and freeze those budgets.

**Blocked by:** 13 - Stabilise the dynamic environment.

**Status:** done (ADR-0062).

- [x] Add one non-interactive check that is red until every declared budget is met. — `npm run check:scene-runtime-budget`; the evaluator's own fixtures put every metric over budget one at a time and assert it fails.
- [x] Declare and freeze budgets for generation time, gzip bundle size excluding Three.js, draw calls, triangles, and retained memory. — `scene-runtime-budget-v1`, five ceilings each with a stated reason naming the regression it forbids.
- [x] Measure from the isolated production package, not from the development page. — the certification's temporary root, and the test asserts each budgeted value equals the isolated run's own.
- [x] Keep the static audit, reference-independence, and determinism checks green. — `check:scene-generation` OK, 0 external requests, 0 third-party inputs, 711 semantic IDs byte-identical.
- [x] Report each budget with headroom. — recorded in `foundation.productionBudget`; the test refuses any budget under five per cent headroom.
- [x] Record any budget that cannot be met as a boundary result with an ADR. — none is unreachable; all five pass with 13.8 to 52.0 per cent headroom.


## Result

| budget | ceiling | measured | headroom |
| --- | --- | --- | --- |
| `generationMs` | 1,000 | 480.1 | 52.0% |
| `bundleGzipBytes` | 65,536 | 40,061 | 38.9% |
| `triangles` | 700,000 | 556,749 | 20.5% |
| `drawCalls` | 2,048 | 1,766 | 13.8% |
| `geometryBytes` | 41,943,040 | 26,637,868 | 36.5% |

`drawCalls` is the tightest and is worth watching: the remaining village work adds
primitives.

**This also closes `npm run check:scene-parity-foundation`**, which had been red for the
whole milestone for a structural reason rather than a candidate one — it compared
`generationMs`, a wall-clock value, byte for byte. The comparison now replaces wall-clock
fields with a placeholder on both sides and the budget gates them; everything else is
still compared exactly. Verified on two consecutive runs. ADR-0062.

`geometryBytes` is a new measurement: `renderer.info.memory` counts geometries and
textures and a count cannot be budgeted. The page sums each geometry's attribute and index
arrays once plus each instanced mesh's matrix and colour arrays, and its figure agrees
exactly with an independent offline sum over the same generated scene.
