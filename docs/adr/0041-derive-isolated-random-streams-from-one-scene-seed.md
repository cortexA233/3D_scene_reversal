---
status: accepted
---

# Derive isolated random streams from one scene seed

The Scene Recipe stores one root `sceneSeed` and `rngVersion`, while a stable derivation function combines that root with a Scene Semantic ID and purpose label to provide isolated geometry, material, distribution, and environment seeds at generator boundaries. A single shared sequential RNG would make insertion, reordering, one extra draw, selective generation, or parallel scheduling change unrelated entities across the island, whereas storing hundreds of authored seed fields would add unnecessary management cost; per-entity overrides remain absent until a concrete art-direction need justifies sparse exceptions.
