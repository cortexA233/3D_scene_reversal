# 04 - Reconstruct the Ocean Appearance Surface

**What to build:** Give the sea an independently generated shaded water surface with displacement, transparency, and reflection at a frozen phase, without redefining the Semantic Sea Level.

**Blocked by:** 02 - Reproduce the Environment Recipe's atmosphere.

**Status:** landed; the surface is reconstructed and the appearance gate is still
red behind vegetation and architecture

- [x] Add one non-interactive check that is red until the geography region's appearance evidence is inside its calibrated threshold. — `test/ocean-reconstruction.test.mjs`, 6 assertions, gating the `ocean-surface` Material Family as well as the region.
- [x] Generate the water surface procedurally: analytic wave displacement, sun glint, depth-dependent transparency, and horizon blending.
- [x] Freeze the wave phase to the declared observation moment so captures repeat exactly.
- [x] Keep the Semantic Sea Level at world Y=16 with a +Y normal; wave displacement may not move the datum.
- [x] Keep the surface's extent covering every frozen camera frustum.
- [x] Retain no water normal map, sampled texture, or captured gradient.
- [x] Report sea and sky transition evidence and the worst camera.
- [x] Confirm the Semantic Sea Level and coastline evidence did not regress.

## What was wrong

The authored sea is `THREE.Water`: a mirror render target, four samples of a
loaded `waternormals.jpg` at two fine and two coarse tilings, a Schlick Fresnel
blend between scattered water colour and that reflection, and a Blinn-Phong sun
term. The candidate answered it with a flat `MeshStandardMaterial` plane — one
saturated colour, no glint, no Fresnel, no horizon.

## What it is now

An analytic `ShaderMaterial`. The wave bands stand in for the normal map's own
tilings: the authored shader divides world XY by 103, 107, 1091 and 8907 at
`size` 2, hence declared wavelengths near 51, 53, 545 and 4450 world units, two
crossed terms each so a band is a swell rather than corduroy. The reflection
samples the same sky gradient the dome renders, rather than a second render
pass, so what the water reflects and what the camera sees behind it cannot
disagree. Fresnel, scatter, Blinn-Phong sun and fog follow the authored shader's
own structure. Thirteen numbers added to the Environment Recipe; nothing loaded.

The surface stays a flat plane on the datum, exactly as the authored one does:
`Water` perturbs the normal and never the vertex, so the Semantic Sea Level is a
consequence of the representation rather than a constraint bolted on.

**The phase is declared, not read.** The authored surface advances a `time`
uniform every frame, but the Frozen Observation Clock pins `performance.now()`,
so the reference's own frame delta is zero and it renders one repeatable phase.
The candidate declares `phase` in the recipe instead of reading a clock, which a
Production Runtime may not do in any case.

## Measured

| camera | ocean-surface DeltaE | geography region DeltaE |
| --- | --- | --- |
| authoredOverview | 26.04 -> **15.34** | 25.66 -> **16.34** |
| topDown | 25.64 -> **9.86** | 25.95 -> **12.12** |
| oblique-north | 16.13 -> **7.15** | 16.59 -> **7.80** |
| oblique-east | 20.29 -> **11.24** | 20.58 -> **11.68** |
| oblique-south | 18.89 -> **10.20** | 19.18 -> **10.64** |
| oblique-west | 19.70 -> **9.62** | 20.02 -> **10.14** |

Worst camera is `authoredOverview`, which is the framing that looks out along the
sea to the horizon. **Global appearance DeltaE 21.311 -> 13.369**, a 37 per cent
cut to the whole scene's appearance residual from one surface. Material-family
mean 27.525 -> 26.435. No gated metric regressed; every geometry metric is
unchanged, which is what an appearance-only change should do.

## Why the gate is still red

The threshold is 4.062 for the worst Material Family and 2.852 for the region.
The sea is now the fourth-largest family residual rather than the largest, behind
`palm-foliage` at 62.51, `blossom-foliage` and `painted-timber`. Those belong to
tickets 07 and 11. `nativeAppearance` is also `blockedBy` the two geometry layers
under ADR-0040's ordering rule, so the layer is not evaluated at all yet.

## Next

The wave amplitudes and the three fixed coefficients inside the shader — the 0.3
scatter weight, the 0.9 reflection weight, and the 100/3 specular pair, all taken
from the authored shader — have not been fitted; they are the authored values
used as-is. A fit needs a browser in the loop because the sea is only measurable
through a rendered capture, and no such harness exists yet: the Reference-guided
Fitting Loop is Node-side and measures geometry. That harness is worth building
before tickets 06, 07 and 11, which all have the same shape.
