# 09 - Reconstruct Distributed Scene Cover

**What to build:** Place the rock, pebble, grass, and cloud populations in their measured regions at their measured densities so ground and sky cover stops being effectively absent.

**Blocked by:** 03 - Fit terrain elevation and the shore profile.

**Status:** in progress — the reference measurement was wrong and is fixed; the
candidate now reproduces the measured distribution; the frozen worst-group gate is
a recorded metric boundary

- [x] Add one non-interactive check that is red until each population's region occupancy and density ratio are inside their thresholds. — `test/distributed-cover-reconstruction.test.mjs`, 8 assertions.
- [x] Settle ground populations on the generated terrain and keep sky populations in their measured shell. — and, which was the defect, only where that terrain is above water.
- [x] Compare by population identity, region occupancy, density, count, scale and orientation distribution, and neighbourhood statistics, never by instance pairing.
- [x] Report per-population evidence with the worst population retained.
- [x] Keep instancing within the draw-call budget. — 6,354 instances in 6 meshes.
- [x] Fit each population's region shape, centre, and extent from the reference's own instanced bounds rather than from an inscribed ellipse. — and its size distribution, its sink, and its form extent, which mattered more.
- [ ] Keep the cloud population's visible contribution consistent with the atmosphere work. — improved, not finished; see below.

## The measurement was wrong, by a factor of forty-one

Everything this ticket previously concluded about cover was drawn from a corrupted
reference mask. ADR-0053 has the full account; the part that matters here:

three.js multiplies a material's colour by an `InstancedMesh`'s `instanceColor`
whenever one is present. The mask passes replaced each renderable's material with
an encoded identity and never suppressed the tint, so the two ground-rock
populations — the only cover meshes that call `setColorAt` — decoded as a
different group entirely. Measured on the authored overview:

| group, reference pixels | before | after |
| --- | --- | --- |
| `cover` | 128 | **5,300** |
| `plazas` | 11,326 | **6,154** |

All 5,172 pixels went to `plazas`. `cover` was missing 98 per cent of itself and
`plazas` was 84 per cent scatter. The candidate draws 2,199, so cover was
**too sparse, not seventeen times too dense** — and the previous round's scale
correction, which took the candidate from 5,302 pixels to 2,199, moved a candidate
that was within 0.1 per cent of correct away from the reference because the
reference number it was fitted against was wrong.

Two related defects were fixed in the same pass: the depth and world-normal
shaders ignored `instanceMatrix`, so every instance rendered stacked on its mesh's
origin, and the identity lattice could not carry the fourteenth declared group.

## Fixed: the size distribution, not the surface area

The reference's per-instance evidence is now measured —
`tools/development/measure-cover-instances.mjs`, written to
`.scratch/full-island-reconstruction/evidence/cover-instances-v1.json`:

| count | scale | median | exponent | sink | form extent |
| --- | --- | --- | --- | --- | --- |
| 4200 | 0.117–1.008 | 0.296 | 2.317 | 0.291 | 2.17 x 1.82 x 2.47 |
| 948 | 0.424–1.732 | 0.983 | 1.226 | 0 | 2.09 x 1.92 x **0** |
| 900 | 0.344–2.561 | 0.844 | 2.148 | 0.271 | 2.17 x 1.83 x 2.47 |
| 145 | 0.464–1.945 | 1.129 | 1.156 | 0 | 1.58 x 2.00 x **0** |
| 127 | 0.540–1.416 | 0.923 | 1.194 | 0 | 2.02 x 0.89 x **0** |

Three things this makes plain that no summary could:

1. **The ladder has a shape.** The two rock populations are power laws at 2.15 and
   2.32, so most of their instances sit near the small end. The range derived from
   the measured total surface area was uniform with medians 1.30 and 0.49 and no
   instance below 0.71. Matching the sum of squared scales does not match rendered
   pixels, because rasterisation is not linear in size: an instance below a pixel
   across contributes almost nothing however much area it carries.
2. **The rocks are sunk and the grass is not.** 0.271 and 0.291 of each instance's
   own scale, proportional rather than constant. The generator centred every form
   on the surface.
3. **Three of the five populations are flat.** Two triangles, zero thickness —
   blades, not rocks. The `kind` rule called anything whose *population bounds*
   stood taller than three units a rock, and the grass ellipses span seven units
   of terrain, so all five were labelled ground rocks and the three blade
   populations were given rock albedo and a solid cone to render.

The recipe now carries ten measured numbers per population — the ladder's two ends
and its exponent, the sink, and the authored form's extent and origin height — and
the contract rejects a population without them, because every one of these was
invented before it was measured and two of them were invented twice.

## Not finished: clouds

The 34 cloud sprites have no instance matrices to read, so their evidence is
per-sprite bounds. Three corrections landed: the region is now the band the sprite
*centres* occupy rather than the band their extents reach, which was double-counting
each cloud's own radius; the span ladder is the measured sprite widths; and the form
carries the measured 0.542 height-to-width aspect instead of being a sphere. Cloud
bounds went from -1,394..4,190 to **-483..3,440** against an authored -502..3,175.

The residual is that authored span correlates with height at -0.46 — higher clouds
are smaller — and the generator draws scale independently of position. Carrying
that correlation is one more measured number but the clouds are hidden in every
auxiliary geometry pass, so their only gated contribution is through the `sky`
appearance region, which belongs to tickets 02 and 13. Left open rather than
closed.

## The frozen worst-group gate cannot be reached, and this is measured

`cover` owns two of the ten fixed-camera gates. Per-pixel silhouette IoU pairs
instances, and Distributed Scene Cover is *defined* as compared "by semantic
occupancy and spatial distribution rather than arbitrary instance pairing".

The frozen bracket's own controls prove the gate is unreachable, with no argument
required. From the stored calibration partials, cover on the authored overview:

| control | class | cover IoU | cover pixels |
| --- | --- | --- | --- |
| identity | identity | 1.0000 | 128 |
| extent-1pct | mild | 0.7929 | 123 |
| extent-8pct | intermediate | **0.1965** | 166 |
| extent-45pct | severe | **0.0000** | 130 |
| yaw-0.9 | severe | **0.0000** | 133 |

A 45 per cent scale change and a 0.9-radian rotation both leave the population's
count, region and density intact and drive the intersection to *exactly* zero,
because once an instance moves further than its own footprint there is nothing left
to intersect. A procedurally regenerated scatter moves every instance further than
its own footprint by construction, so cover's per-pixel IoU is identically near
zero for any correct reconstruction. An 8 per cent scale error already fails the
0.302569 threshold.

The candidate's current non-zero reading exists only because it over-draws in
places the reference does not, which means **fixing cover correctly pushes this
metric down**. That is the signature of a metric measuring the wrong thing.

The threshold itself is sound and is not touched: it was set between `plazas` at
0.341 under a mild yaw and `vegetation` at 0.187 under a severe collapse, neither
of which is cover.

The frozen assertion stays marked outstanding with that reason. The declared
resolution is a position-tolerant occupancy comparison for Distributed Scene Cover
— the precedent is Semantic Pattern Coverage, already an accepted representation
in this repo for exactly this situation — calibrated from a new reference-only
control that re-draws the scatter under the reference's own rule with a different
stream. That is a new metric with its own bracket and versioned gate revision, so
it is named here rather than taken.
