# 12 - Reconstruct Semantic Lights and emissive sources

**What to build:** Make the island's 32 local lights illuminate, with each tied to the entity that emits it, so lantern glow is light rather than colour.

**Blocked by:** 11 - Reconstruct Material Families and bounded appearance.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until local light contribution and shadow placement evidence are inside their thresholds.
- [ ] Reproduce each Semantic Light's position, colour, intensity, range, decay, and shadow behaviour.
- [ ] Keep the declared relationship between a light and its emissive source entity.
- [ ] Keep emissive materials and actual lights distinct.
- [ ] Report lighting evidence per camera with the worst camera retained.
- [ ] Keep the light count and shadow cost inside the runtime budget.
