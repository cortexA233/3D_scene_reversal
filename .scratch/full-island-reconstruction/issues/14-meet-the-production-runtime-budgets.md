# 14 - Meet the Production Runtime budgets

**What to build:** Bring generation time, bundle size, draw calls, triangles, and memory inside declared budgets, and freeze those budgets.

**Blocked by:** 13 - Stabilise the dynamic environment.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until every declared budget is met.
- [ ] Declare and freeze budgets for generation time, gzip bundle size excluding Three.js, draw calls, triangles, and retained memory.
- [ ] Measure from the isolated production package, not from the development page.
- [ ] Keep the static audit, reference-independence, and determinism checks green.
- [ ] Report each budget with headroom.
- [ ] Record any budget that cannot be met as a boundary result with an ADR.
