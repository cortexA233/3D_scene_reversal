---
status: accepted
---

# Keep authoritative reference captures immutable

Scene appearance parity compares an Immutable Reference Capture with a fully independent, code-generated Procedural Replacement: evaluation may use only the reference's existing frozen camera controls plus a development-side Frozen Observation Clock, and may not replace or inject its materials, lighting, atmosphere, scene content, or post-processing. Development tooling may read reference geometry into a separate Reference Analysis Projection for depth, normal, semantic, and surface-distance evidence, but that projection is not an authoritative reference rendering; the replacement must independently reproduce the authored material and lighting result rather than inheriting a shared evaluation look.
