# 06 — Quantify terrain, coastline, and Semantic Sea Level

**What to build:** Replace the prototype's ambiguous radial-terrain contract with a production-safe Bounded Semantic Terrain Program and an end-to-end 3D geography comparison that can quantify the current candidate without retaining the reference heightfield.

**Blocked by:** 04 — Measure and classify the Assembled Authored Scene; 05 — Compare semantic layout and direct surfaces.

**Status:** ready-for-agent

- [ ] Add one non-interactive geography check that is red for declared terrain, shore, inlet, and sea-level damage and reports the current candidate honestly.
- [ ] Define and validate a fixed-cap Bounded Semantic Terrain Program with semantic coastline curves, named analytic landforms, compact falloff controls, and versioned deterministic noise.
- [ ] Derive the initial representation cap from reference complexity evidence and freeze it before the later fitting ticket; reject unbounded growth or source-resolution controls.
- [ ] Generate candidate terrain through the production Scene Generation interface with tessellation independent of Recipe shape semantics.
- [ ] Prohibit runtime height grids, regular height samples, per-vertex retained heights, distance fields, sampled coast arrays, or encoded terrain geometry.
- [ ] Read the complete reference terrain in development and compare deterministic height and slope evidence over declared full, interior, and shore regions.
- [ ] Extract and compare world-space coast classification, symmetric contour distance, area, perimeter, inlet locations, and named coastline features.
- [ ] Freeze Semantic Sea Level at world `Y = 16` with normal `+Y` and compare height, tilt, land/sea classification, flooding relationships, and coverage.
- [ ] Keep the independently generated Ocean Appearance Surface from redefining the semantic datum and prove its extent covers every frozen camera frustum.
- [ ] Validate analytical terrain and contour fixtures with known height, slope, shoreline, and sea-plane errors.
- [ ] Emit aggregate and worst-zone geography evidence using development-only reference queries while retaining only bounded semantic production parameters.
- [ ] Confirm the candidate can remain red on geography quality while every representation-boundary and measurement check passes.
