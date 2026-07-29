---
status: accepted
---

# Decouple the reference mesh from replacement structure

Each Single Mesh Lab Reconstruction Unit contains one authored one-mesh/one-material reference, but its Procedural Replacement is constrained to one semantic object root rather than one `THREE.Mesh`. A replacement may preserve meaningful generated parts and hierarchy, then optionally merge compatible geometry during initialization to meet rendering budgets. Reference export batching must not dictate the generator's domain structure; slot, pivot, scale, bounds, triangle count, draw calls, and memory are evaluated on the resulting object as a whole.
