# 08 - Reconstruct vegetation canopies

**What to build:** Make palms, blossoms, and bamboo read as dense canopy rather than sparse sticks, since vegetation is the island's dominant visual mass and its worst appearance region.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the vegetation group reaches its calibrated per-group silhouette and appearance thresholds.
- [ ] Rebuild palm fronds as layered curved blades rather than flat planes.
- [ ] Rebuild blossom and willow canopies as bounded organic masses with visible foliage density.
- [ ] Rebuild bamboo as an axial layer family of culms with foliage.
- [ ] Keep each entity's anchor and Target AABB Extent exact and keep the per-entity controls compact.
- [ ] Report the vegetation region's appearance evidence, which is currently the worst at mean DeltaE 50.6.
- [ ] Keep triangle count and draw calls inside the declared budgets.
