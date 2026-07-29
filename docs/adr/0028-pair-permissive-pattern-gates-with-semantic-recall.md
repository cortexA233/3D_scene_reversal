---
status: accepted
---

# Pair permissive pattern gates with semantic recall

`patterned-appearance-baseline-v2` uses reference-only widest-safe thresholds
for global color and structure: mean DeltaE at most 6.6967, P90 DeltaE at most
30.8300, mean masked SSIM at least 0.7287, and worst-view SSIM at least 0.5870.
These values are intentionally materially looser than Umbrella v1 so a compact
analytic program is judged as a semantic reconstruction rather than a sampled
texture copy.

Global metrics alone cannot distinguish a small identity-bearing branch or leaf
family deletion from allowed mild motif movement. The baseline therefore adds
Semantic Pattern Recall over reference albedo with flower, leaf, and branch
minima of 0.0451, 0.1615, and 0.5905. Global SSIM remains responsible for large
phase, scale, and half-coverage errors; semantic recall is responsible for the
three family-deletion controls. Roughness and metalness keep their unchanged v1
limits.

Palette centroid and palette coverage clustering become diagnostic because
their discrete clusters changed discontinuously under mild complex-texture
palette perturbations. This is the one candidate-free reference-side correction
recorded before candidate fitting. It does not relax any historical v1 value,
and no patterned v2 metric may change after the Umbrella candidate is fitted.
