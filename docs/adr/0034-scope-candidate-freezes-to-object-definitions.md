---
status: accepted
---

# Scope candidate freezes to object definitions

Stone v2 and Umbrella v3 originally froze the entire shared object registry.
That made an additive registration for an unrelated Stage 2 object appear to
mutate both accepted candidates. Their candidate manifests now freeze the
object-specific definition module that binds each immutable recipe to its
generator, together with the same generator, recipe, shared kernel, and RNG
files as before. The shared registry is no longer a candidate file.

This narrows the evidence seam without weakening it: changing which generator
or recipe defines Stone or Umbrella still changes the frozen definition hash,
while registering Bamboo Shoot, Mushroom, Blue Hat, or Candle cannot create a
false historical regression.
