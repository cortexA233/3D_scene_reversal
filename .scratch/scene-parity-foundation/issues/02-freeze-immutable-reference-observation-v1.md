# 02 — Freeze Immutable Reference Observation v1

**What to build:** Deliver strictly read-only access to the ready Assembled Authored Scene and freeze the complete observation conditions that every later scene measurement, calibration, and comparison will use.

**Blocked by:** 01 — Safely reconcile stable reconstruction infrastructure.

**Status:** ready-for-agent

- [ ] Add one non-interactive reference-observation check that is red until camera, render, time, environment, and immutability evidence are complete.
- [ ] Observe the ready assembled runtime scene as the authority for final world transforms, visibility, geometry, materials, lights, procedural environment, and overrides.
- [ ] Permit direct read-only scene and reference-source queries while keeping the reference in an isolated execution context.
- [ ] Record reference structure, transforms, geometry, materials, lights, renderer state, and dynamic state before and after observation; reject any undeclared mutation.
- [ ] Freeze the Scene Anchor at `[86,26,-24]` and the authored overview at `[390,190,410]` targeting `[80,26,-20]`, with 58-degree vertical FOV, near 0.5, and far 30000.
- [ ] Derive one top-down and four opposing oblique camera matrices solely from Assembled Authored Scene evidence, then record and freeze them without consulting the candidate.
- [ ] Enforce a 1440-by-810 CSS viewport and framebuffer at device scale factor 1 under Three.js r170 for every blocking capture.
- [ ] Freeze and machine-verify Scene Render Contract v1, including renderer/color state, global and local lights, shadows, fog, sky, ocean, clouds, URL options, bloom, grading, vignette, and disabled film grain.
- [ ] Control animation through an external Frozen Observation Clock and declare one primary plus a bounded set of dynamic capture moments without patching reference code.
- [ ] Emit schema-versioned observation evidence with browser, OS, GPU/WebGL renderer, acceleration, color, Three.js, camera, framebuffer, and time metadata.
- [ ] Prove repeated observations are stable within declared reference repeatability while the native reference appearance remains unmodified.
