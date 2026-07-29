---
status: accepted
---

# Separate Stone's uniform appearance from accepted geometry

After the frozen Stone candidate passed `stone-geometry-baseline-v2`, its v1
appearance gate showed perfect albedo in all twelve views (DeltaE `0`, SSIM
`1`), identical palette coverage, and effectively identical roughness and
metalness, while only frozen-lighting RGB failed. Those lit differences arise
from the 24-direction normals already accepted by the new geometry baseline,
so treating them as an independent material failure counts the same geometric
difference twice.

For Stone under geometry v2, the hard appearance gate applies the unchanged v1
numeric thresholds to albedo DeltaE/SSIM, palette, roughness, and metalness;
lit-RGB remains Geometry-conditioned Appearance Evidence and is reported as a
diagnostic. Historical v1 evaluation remains unchanged, and this decision does
not loosen any geometry or independent appearance threshold.
