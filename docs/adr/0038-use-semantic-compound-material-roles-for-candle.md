---
status: accepted
---

# Use semantic compound-material roles for Candle

Candle's compact candidate reproduces the measured compound geometry closely,
including the carved pedestal profile, tray, wax pillar, and wick. Its analytic
stone mottling does not copy the Authored Reference's 512-pixel stone texels at
identical image positions, so category-v1 exact-position appearance remains a
historical FAIL.

A separately versioned semantic appearance v2 retains the unchanged category-
v1 geometry, roughness, and metalness gates and makes exact-position DeltaE,
SSIM, and palette clustering diagnostic. It hard-gates bounded dark, middle,
and light stone roles plus the distinct wax and wick roles. The hash-frozen
positive must pass, while flattening the stone system, deleting wax, deleting
the wick, or rotating the compound palette must reject with geometry still
passing. This object-specific boundary follows ADR-0035 and does not rewrite or
generally relax category-v1 evidence.

The v3 positive replaces the visually periodic sine bands with deterministic,
resolution-independent value noise fitted from development-only inspection of
the Authored Reference texture. It retains no texture pixels or sampled
derivatives and uses screen derivatives to band-limit material-role transitions.
The unchanged semantic v2 and geometry gates still apply, while a new 512-to-128
multi-scale check requires mean/P95 absolute channel disagreement no greater
than `2.5/8`. The v2 positive and the first Stage 2 certification remain
historical evidence rather than being overwritten.
