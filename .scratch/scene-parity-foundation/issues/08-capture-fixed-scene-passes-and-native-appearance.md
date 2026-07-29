# 08 — Capture fixed scene passes and native appearance

**What to build:** Produce aligned scene-level semantic, silhouette, depth, normal, and native appearance evidence for reference and candidate through the complete frozen camera, framebuffer, renderer, and time protocol.

**Blocked by:** 02 — Freeze Immutable Reference Observation v1; 05 — Compare semantic layout and direct surfaces.

**Status:** ready-for-agent

- [ ] Add one non-interactive scene-capture check that fails on any camera, projection, clipping, framebuffer, pass-encoding, time, or renderer mismatch.
- [ ] Capture the authored overview, one top-down, and four opposing oblique cameras using the exact matrices frozen by Immutable Reference Observation v1.
- [ ] Capture both subjects at 1440 by 810, device scale factor 1, under the normative Three.js/browser/GPU environment and declared Frozen Observation Clock moments.
- [ ] Produce pixel-aligned semantic ID, binary silhouette, linear depth, world normal, and native lit-RGB evidence with schema-versioned encodings.
- [ ] Preserve the native reference materials, lights, atmosphere, ocean, sky, clouds, post-processing, and dynamic state without injecting neutral or shared appearance.
- [ ] Capture the candidate's independently generated Material Families, Environment Recipe, Semantic Lights, ocean, atmosphere, and post-processing without adapter corrections.
- [ ] Report semantic occupancy/confusion, contour, depth, normal, occlusion, overlap, global appearance, small semantic-region appearance, palette, lighting, fog, and sea/sky evidence.
- [ ] Retain per-camera, aggregate, and worst-camera results rather than only the authored overview or a global pixel average.
- [ ] Generate overlays, differences, split views, pass previews, and contact sheets from the same evidence used by automated metrics.
- [ ] Verify repeated captures and fixed-time dynamic samples against reference repeatability, with complete browser/OS/GPU/color metadata.
- [ ] Reuse proven Single Mesh Lab pass and metric ideas where their encodings remain valid, but do not reuse its 38-degree cameras, object normalization, or thresholds.
- [ ] Demonstrate that independent candidate reframing, shared evaluation lighting, or a modified reference capture causes the protocol check to fail.
