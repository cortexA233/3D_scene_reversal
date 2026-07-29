---
status: accepted
---

# Freeze Stage 2 nonvisual budgets before fitting

Before either Stage 2 candidate is fitted, Bamboo Shoot is limited to 64 object-specific scalars, 1.5 KB of recipe JSON, a 6 KB gzip production delta, 1,536 triangles, two draw calls, 96 KB of generated geometry, and 8 ms warm-generation p95; Mushroom is limited to 96 scalars, 2 KB of recipe JSON, an 8 KB gzip delta, 3,840 triangles, two draw calls, 192 KB of geometry, and 10 ms warm-generation p95. The complete six-object Production Runtime remains limited to 40 KB gzip excluding Three.js and 40 ms sequential warm generation, with zero runtime textures and WASM plus the existing determinism, Reference Independence, and Native GPU Visual Gates; visual tolerance may be category-calibrated, but greater retained data or runtime machinery cannot buy back similarity.
