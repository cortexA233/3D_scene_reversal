# 07 - Reconstruct architecture and bridge silhouettes

**What to build:** Rebuild the pavilions, booths, shops, houses, and bridges as roofed, posted, multi-level forms whose silhouettes and part counts match the authored buildings.

**Blocked by:** 06 - Reconstruct plazas, decks, paving, and path stones.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the structures and bridges groups reach their calibrated per-group silhouette thresholds.
- [ ] Build one architecture family program with compact per-entity controls for levels, eaves, platform, posts, and roof pitch.
- [ ] Build a bridge program with deck, railing, abutment, and arch as separate semantic parts.
- [ ] Keep the family's controls compact; a per-building transform list is not a reconstruction.
- [ ] Keep every entity's anchor and Target AABB Extent exact.
- [ ] Report per-group silhouette, contour distance, depth, and world normal with the worst camera retained.
- [ ] Improve the semantic component delta for these groups.
