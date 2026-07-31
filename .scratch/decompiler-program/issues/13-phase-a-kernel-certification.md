# 13 — Phase A kernel certification

Type: task
Status: ready-for-agent
Blocked by: 12

**What to build:** the frozen evidence that the deterministic kernel is correct and affordable, proven
without any agent in the loop.

This certification is what separates "the tooling is wrong" from "the automation is weak" in every
later failure. If Phase A passes and Phase B then fails, the fault is in decision quality, not in the
ruler. That distinction is the whole reason this stage exists as a separate gate.

- [ ] The kernel recomputes the eight regression units' published measurements and any divergence is
      explained, not tuned away
- [ ] The CPU-rasterizer divergence tolerance from ticket 03 is frozen and passing
- [ ] Measured wall-clock is within its declared budget, or the overage is recorded as backend evidence
- [ ] Complexity Budget Formula coefficients and the global ceiling are frozen
- [ ] The held-out corpus is frozen by name, drawn from the island scene and the unused asset files, and
      excludes all eight regression units
- [ ] The no-harness pipeline run and the clean-directory pack-and-install run both pass
- [ ] The drift check on copied frozen modules passes
- [ ] A frozen JSON report with a `--check` mode states explicitly that no agent decider participated
- [ ] No frozen Stage 1, Stage 1.5, or Stage 2 artifact is modified
