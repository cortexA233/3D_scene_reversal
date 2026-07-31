# 09 — Mechanical decomposition, semantic grouping, multi-unit composition

Type: task
Status: ready-for-agent
Blocked by: 06

**What to build:** handling inputs that are not one simple solid — the step where 17 mechanical
components become 3 families plus a hero plus a crown, and where a table with a cup on it becomes two
units instead of one deformed one.

There is no purely geometric criterion for "is this one object": five separated mushroom forms are one
unit while a table and a cup are two, and geometry alone cannot tell them apart. So the mechanical
layer only publishes evidence, a Decision Point supplies the grouping, and the design goal is that
misgrouping stays survivable rather than being prevented.

- [ ] The mechanical layer publishes welded connected components, material groups, shape-descriptor
      clusters, symmetry orbits and repetition tracks, axial and radial arrangement detection, and
      separation ratio — all recomputable, none of it deciding the grouping
- [ ] The unit-division and semantic-grouping Decision Points publish that evidence in numeric form
      and record the answer in the Structure Manifest
- [ ] A two-component separated fixture yields two units, each with its own budget, baseline, and
      tier, plus a composition module that returns them to their original placement
- [ ] A five-instance repeated-group fixture yields one unit whose instances share one generator
- [ ] Misgrouping degrades semantic quality only: geometry is still reproduced and the run still
      completes at a tier
- [ ] The composition module is asset-free and deterministic like any other emitted code
- [ ] Per-unit budgets are derived independently, so splitting an input does not inflate the total
      beyond the global ceiling
