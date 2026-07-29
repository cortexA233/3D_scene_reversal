---
status: accepted
---

# Keep the first object-generator contract minimal

Each first-tranche recipe contains a stable semantic ID, generator kind, explicit seed, typed shape parameters, and separate appearance parameters. Its Object Generator receives an explicit seeded random source and returns one generated `THREE.Object3D` root in object-local coordinates and source-scene scale; Lab placement and canonical display normalization remain outside the generator. The development-only Evaluation Harness derives bounds, triangle and draw-call counts, generation time, and comparison metrics from the returned object. Collider, LOD, tags, sockets, animation, scatter, caching policy, declared bounds, and Authored Reference metadata remain outside the initial contract until an experiment provides evidence for them.
