# 04 — Complexity Budget Formula, global ceiling, Budget Proxy

Type: task
Status: ready-for-agent
Blocked by: 03

**What to build:** the two constructs that replace human judgement about how compact a reconstruction
should be and how good a compact reconstruction could possibly get.

The formula answers "what budget does this object get" without a human sizing it. The Budget Proxy
answers "what score is reachable at that budget" without a human approving a candidate — it is a
reference-derived construct, so it can be frozen before fitting, which is what keeps automatic
baselines legitimate under the existing calibrate-before-fitting rule.

- [ ] The formula maps reference-side complexity measurements — connected component count,
      symmetry-reduced independent part count, material role count, contour curvature complexity — to
      per-unit budgets for scalars, triangles, draw calls, geometry memory, recipe size, gzip delta,
      and warm generation
- [ ] Coefficients are back-calibrated on the eight regression units and frozen, with a published
      side-by-side comparison against the eight hand-set budgets
- [ ] A single global ceiling is declared that no unit may exceed for any reason
- [ ] The formula is applied identically to every unit; no per-object override path exists
- [ ] Budget Proxy construction rebuilds the reference at the declared budget, with automatically
      clustered role colours standing in for source texture, and retains nothing
      resolution-dependent
- [ ] The proxy is scored through the same L1 stack as a candidate, and its per-metric scores are
      published as that unit's reachability bound
- [ ] A frozen JSON report with a `--check` mode records formula coefficients, ceiling, per-unit
      budgets, and per-unit proxy scores
