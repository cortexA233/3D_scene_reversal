# 04 - Reconstruct the Ocean Appearance Surface

**What to build:** Give the sea an independently generated shaded water surface with displacement, transparency, and reflection at a frozen phase, without redefining the Semantic Sea Level.

**Blocked by:** 02 - Reproduce the Environment Recipe's atmosphere.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the geography region's appearance evidence is inside its calibrated threshold.
- [ ] Generate the water surface procedurally: analytic wave displacement, sun glint, depth-dependent transparency, and horizon blending.
- [ ] Freeze the wave phase to the declared observation moment so captures repeat exactly.
- [ ] Keep the Semantic Sea Level at world Y=16 with a +Y normal; wave displacement may not move the datum.
- [ ] Keep the surface's extent covering every frozen camera frustum.
- [ ] Retain no water normal map, sampled texture, or captured gradient.
- [ ] Report sea and sky transition evidence and the worst camera.
- [ ] Confirm the Semantic Sea Level and coastline evidence did not regress.
