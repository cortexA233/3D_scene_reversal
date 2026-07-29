# 08 — Candle Procedural Replacement

Type: task
Status: resolved
Blocked by: 07

Implement Candle as the measured candle-plus-carved-pedestal compound object
and pass its frozen visual, nonvisual, determinism, independence, and
three-browser gates.

## Resolution

The frozen `488b4f5` candidate restores the source's 20-point closed pedestal
profile, 12-direction carved stand and tray, wax pillar, and curved wick in 83
Object-specific Scalars, three draw calls, and 672 triangles. Category-v1
geometry passes at mean/worst silhouette IoU `0.99491/0.99273`; all nonvisual
ceilings pass.

Category-v1 exact-position textured appearance remains a historical FAIL.
`candle-semantic-category-baseline-v2` retains category-v1 geometry and material
gates and hard-gates dark/mid/light stone, wax, and wick roles. Flattened stone,
deleted wax, deleted wick, and wrong-palette controls reject while geometry
continues to pass. Chrome acceptance and two stable full-protocol native
hardware-GPU repetitions in Firefox and Safari pass. The eight-object exit is
now unblocked.
