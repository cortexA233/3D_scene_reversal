---
status: accepted
---

# Keep world layout out of object generators

The Scene Recipe and Scene Generator exclusively own scene identity, grouping, world placement, terrain relationships, material-family assignment, and composition, while each Object Recipe and Object Generator owns only one entity's local shape and appearance in its Reconstruction Frame. Every identity-bearing entity's authoritative placement is absolute world space, semantic scene groups carry no hidden transform, the generator registry maps kinds to generators rather than storing island instances, and distributed populations use scene-level population generators; allowing object generators or transformed parent groups to reinterpret world measurements, cameras, island coordinates, neighboring entities, or global layout would recreate the hidden offsets and empirical scale drift that Scene Parity Foundation is intended to eliminate.
