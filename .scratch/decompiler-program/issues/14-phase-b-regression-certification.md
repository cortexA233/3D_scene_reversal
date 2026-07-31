# 14 — Phase B certification on the regression corpus

Type: task
Status: ready-for-agent
Blocked by: 13

**What to build:** a real decider integrated behind the same protocol, measured against the eight
hand-authored results.

This proves tooling and integration, never generalisation — the answers are already in the repository,
so a decider can see the existing recipes and generators. That limitation is stated in the report
rather than argued away, and generalisation is Phase C's job.

- [ ] A real decider is integrated behind the unchanged Decision Point protocol, with no new pathway
      into the kernel
- [ ] Model identity, prompt version, candidate history, and per-round measurements are recorded in the
      decision trace
- [ ] Each of the eight units reaches a Reconstruction Tier at least as good as its hand-authored
      result, evaluated under that unit's existing frozen baseline version
- [ ] No frozen report, baseline, or candidate hash is modified
- [ ] The report names each unit's achieved tier beside its hand-authored result and does not combine
      them into a single aggregate score
- [ ] The report states that the regression corpus proves tooling correctness, not generalisation
- [ ] Operator authoring triggered during the run is recorded with its unlocking failure
