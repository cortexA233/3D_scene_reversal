# 11 - Reconstruct Material Families and bounded appearance

**What to build:** Replace the small flat palette with semantic Material Families and bounded analytic pattern programs so appearance approaches the authored richness without loading a texture.

**Blocked by:** 01 - Calibrate the fixed-camera and native-appearance gate layers; 10 - Restore semantic part structure.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until global and per-Material-Family appearance evidence is inside its calibrated thresholds.
- [ ] Fit each family's albedo, roughness, transparency, and emission from the assembled scene's own measured materials.
- [ ] Add bounded semantic pattern programs in semantic surface coordinates for wood, stone, foliage, terrain, and architectural surfaces.
- [ ] Keep every pattern analytic, fixed-cap, and resolution-independent.
- [ ] Retain no authored image, pixel table, colour lookup, sampled grid, base64 payload, or sampled constant disguised as a shader.
- [ ] Report global, per-family, and small-region appearance with the worst camera retained.
- [ ] Confirm the geometry layers still pass, since appearance is only evaluated after they do.
