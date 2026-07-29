---
status: accepted
---

# Permit gated JavaScript dependencies in the code-only runtime

The Code-only Production Runtime may use ordinary npm JavaScript Runtime Kernels because the relevant boundary is between general algorithms and retained authored scene content, not between first-party and third-party code. Each dependency must have an acceptable license, be version-locked and bundled locally for offline execution, contain no authored geometry or appearance data, support deterministic generation without implicit randomness, and pass bundle-size, initialization-time, and generation-time gates. A modeling dependency must convert its generated result to `THREE.BufferGeometry` before the geometry enters the production scene. Permission is evidence-based per dependency and does not justify adding a general modeling library before an object demonstrates the need.
