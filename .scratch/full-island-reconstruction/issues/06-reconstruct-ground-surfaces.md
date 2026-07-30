# 06 - Reconstruct plazas, decks, paving, and path stones

**What to build:** Give the ground surfaces their authored footprints and thickness so the worst-scoring semantic groups stop being empty.

**Blocked by:** 03 - Fit terrain elevation and the shore profile.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the paths, plazas, and rocks groups reach their calibrated per-group silhouette thresholds.
- [ ] Reconstruct plazas and decks as bordered paved slabs following their measured footprints.
- [ ] Reconstruct path stones and paving slabs with footprint extrusion, settled on the generated terrain.
- [ ] Reconstruct shore and inland rocks with the accepted bounded support-plane representation.
- [ ] Keep every entity's anchor and Target AABB Extent exact.
- [ ] Report per-group silhouette, depth, and world-normal evidence with the worst camera retained.
- [ ] Confirm the terrain and coastline evidence did not regress.
