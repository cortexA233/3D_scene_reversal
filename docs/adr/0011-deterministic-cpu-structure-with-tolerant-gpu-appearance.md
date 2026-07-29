---
status: accepted
---

# Require deterministic CPU structure and tolerate bounded GPU appearance variance

Object Generators use an explicit, versioned integer RNG and may not depend on `Math.random()`, time, device state, unstable iteration, or GPU feedback. On a fixed Three.js and browser-engine version, repeated generation from the same recipe and seed must produce identical semantic hierarchy, IDs, attribute and index lengths, typed-array bytes, material parameters, bounds, triangles, and draw calls. Across Chrome, Firefox, and Safari, semantic structure, topology, and branch choices remain identical and canonical bounds agree within `1e-6` of the canonical maximum dimension; byte-identical floating-point arrays are not required across engines, and bounded GPU shader variance is accepted only when it still passes the visual Quality Baseline. Shader noise may affect appearance or declared micro-deformation but never object count, IDs, layout, or collision structure.
