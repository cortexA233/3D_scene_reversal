# 09 — Assemble the Scene Parity Gate Stack

**What to build:** Combine structural correspondence, world-space geometry, fixed-camera geometry, and native appearance into one schema-versioned, non-compensating Scene Parity Report with stable failure behavior and actionable worst-case evidence.

**Blocked by:** 05 — Compare semantic layout and direct surfaces; 06 — Quantify terrain, coastline, and Semantic Sea Level; 07 — Quantify Horizon Groups and the 360-degree Horizon Profile; 08 — Capture fixed scene passes and native appearance.

**Status:** ready-for-agent

- [ ] Add one non-interactive acceptance-stack check that begins red until every evidence family is present, versioned, and evaluated independently.
- [ ] Build four explicit gate layers: structural correspondence, world-space geometry, fixed-camera geometry, and native appearance.
- [ ] Make each layer independently blocking and prohibit a weighted overall similarity score from deciding acceptance.
- [ ] Preserve aggregate plus worst-entity, worst-region, worst-zone, worst-camera, and worst-azimuth results wherever applicable.
- [ ] Prevent large terrain or cover regions from hiding small identity-bearing entities and prevent one favorable camera from hiding an opposing-view failure.
- [ ] Require geometry layers to pass before a native-appearance pass can support final parity.
- [ ] Load baseline definitions as immutable versioned input and prohibit report generation from changing thresholds, Recipe values, generators, reference, or candidate.
- [ ] Emit one machine-readable report with exact Recipe/generator versions, semantic and derived-seed evidence, observation metadata, gate outcomes, and explicit failure reasons.
- [ ] Emit the matching human-review artifact index from the same run.
- [ ] Return a failing evaluation exit status when any candidate gate fails while keeping infrastructure/protocol failures distinguishable from candidate-quality failures.
- [ ] Test declared masking cases in which good appearance, low average error, large easy regions, or favorable views attempt to compensate for structural damage.
- [ ] Keep the diagnostic trend index, if any, visibly non-authoritative and absent from gate decisions.
