# 03 - Fit terrain elevation and the shore profile

**What to build:** Bring the largest geometry residual down by fitting the Bounded Semantic Terrain Program's controls against the complete measured elevation field, inside the frozen control budget.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until terrain height and shore height evidence are inside their frozen thresholds.
- [ ] Improve the landform fit within the frozen budget of 32 coastline controls, 40 landforms, and 4 noise octaves.
- [ ] Fit the shore controls against the measured shoreline band rather than hand-picking them.
- [ ] Report height and slope separately over full, interior, and shore regions, keeping the worst region.
- [ ] Keep coastline symmetric distance, enclosed area, perimeter, and inlet matching inside their thresholds.
- [ ] Keep land, shore, and sea classification agreement above its threshold.
- [ ] Retain no elevation grid, regular sample array, per-vertex height, or distance field in production.
- [ ] If the frozen budget cannot reach the threshold, record that as a representation-boundary result with an ADR rather than growing the budget.
