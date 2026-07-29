# 03 — Establish the Scene Recipe and production generation seam

**What to build:** Put the full-island candidate behind a validated, deterministic Scene Recipe and one production Scene Generation interface so the same generated scene can be used by the prototype page, acceptance workflow, and replacement-only entrypoint without reference or evaluation dependencies.

**Blocked by:** 01 — Safely reconcile stable reconstruction infrastructure.

**Status:** ready-for-agent

- [ ] Add one non-interactive production-generation check that starts red and passes only when the candidate is produced through the new Scene Recipe and Scene Generation interface.
- [ ] Define a versioned Scene Recipe containing the root scene seed, RNG and generator versions, Scene Anchor, world/environment values, identity-bearing entities, distributed populations, geography, horizon, material-family, and Semantic Light controls.
- [ ] Validate stable Scene Semantic IDs, generator kinds, compact local recipes, Material Family references, relationship targets, and absence of source-node identities.
- [ ] Implement stateless seed derivation from RNG version, root scene seed, semantic identity, and purpose label using fixed UTF-8 and integer semantics.
- [ ] Preserve golden derived-seed vectors across the normative Node/browser environment and supported JavaScript engines; reject current derived-key collisions.
- [ ] Make Scene Placement Anchor, Target AABB Extent, and typed Scene Orientation executable contract fields rather than scale or rotation hints.
- [ ] Require local Object Generator output to use the complete-AABB bottom-center Reconstruction Frame and reject hidden empirical scale or placement corrections.
- [ ] Keep every authoritative scene entity placement in absolute world space and reject semantic parent groups that alter child placement through hidden transforms.
- [ ] Return the generated scene plus a stable semantic index through one Scene Generation interface while keeping island instances out of the Object Registry.
- [ ] Drive the existing full-island presentation from the production generation path without losing the retained prototype's current observable behavior before later parity work.
- [ ] Provide a replacement-only entrypoint that builds and renders with reference directories unavailable and no reference, measurement, fitting, or acceptance import.
