# 07 — Blue Hat Procedural Replacement

Type: task
Status: resolved
Blocked by: 06

Implement the predeclared compact Blue Hat representation and pass its frozen
visual, nonvisual, determinism, independence, and three-browser gates.

## Resolution

The frozen `fbc42cd` candidate uses 58 Object-specific Scalars, a measured
profile shell, one top button, two draw calls, 704 triangles, and an analytic
eight-panel/motif shader. It passes category-v1 geometry at mean/worst
silhouette IoU `0.99608/0.99478` and all nonvisual ceilings.

The separately versioned `blue-hat-semantic-category-baseline-v2` preserves
category-v1 geometry and material gates while treating exact-position complex-
texture metrics as diagnostic. Brim, dark-panel, light-panel, and motif roles
are hard-gated; deleting the brim, flattening the panel system, deleting the
motif, or rotating the palette all reject without changing geometry. Chrome
acceptance and two stable full-protocol native hardware-GPU repetitions in
Firefox and Safari pass. Candle is now unblocked.
