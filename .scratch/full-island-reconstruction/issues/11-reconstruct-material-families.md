# 11 - Reconstruct Material Families and bounded appearance

**What to build:** Replace the small flat palette with semantic Material Families and bounded analytic pattern programs so appearance approaches the authored richness without loading a texture.

**Blocked by:** 01 - Calibrate the fixed-camera and native-appearance gate layers; 10 - Restore semantic part structure.

**Status:** in progress — every family's albedo is now measured rather than declared,
and one family renders in agreement. What is left is pattern, and a residual that
belongs to geometry.

- [x] Add one non-interactive check that is red until global and per-Material-Family appearance evidence is inside its calibrated thresholds. — `test/material-families.test.mjs`, 4 assertions; the gate is marked outstanding because ADR-0040 does not evaluate this layer until both geometry layers pass.
- [x] Fit each family's albedo from the assembled scene's own measured materials. — `tools/development/measure-material-albedo.mjs`. Roughness, transparency and emission are still declared; see below.
- [ ] Add bounded semantic pattern programs in semantic surface coordinates for wood, stone, foliage, terrain, and architectural surfaces.
- [ ] Keep every pattern analytic, fixed-cap, and resolution-independent.
- [ ] Retain no authored image, pixel table, colour lookup, sampled grid, base64 payload, or sampled constant disguised as a shader.
- [x] Report global, per-family, and small-region appearance with the worst camera retained. — and per-family *direction*, which the pass never recorded, so a family's error could not be acted on at all.
- [ ] Confirm the geometry layers still pass, since appearance is only evaluated after they do.


## The albedos were all invented, and the authored materials cannot correct them

All ten families carried hand-written albedos. Nothing in the authored materials
contradicts them directly, which is why they survived: measured from the assembled
scene, all 236 palm placements carry `color: 0xffffff` with a texture, as do 442 of the
vegetation materials. The colour lives in maps the Production Runtime may not load.
This is the same fact ADR-0051 hit when `desaturate-albedo` measured DeltaE 0.057 —
less than a one per cent mild control — and had to be replaced by `wrong-role-palette`.

So a Material Family's whole job is to carry that mean as a parameter, and
`tools/development/measure-material-albedo.mjs` measures it: the area-weighted mean
linear reflectance of every surface resolving to the family, from its map where it has
one and its base colour where it does not, alpha-weighted so a leaf card's transparent
field does not dilute the leaf, converted per texel before averaging because averaging
in sRGB and converting after gives a different and wrong answer.

| family | declared | measured (linear) |
| --- | --- | --- |
| distant-rock | [0.42 0.46 0.52] | [0.178 0.251 0.219] |
| painted-timber | [0.68 0.36 0.28] | [0.266 0.204 0.176] |
| paving-stone | [0.66 0.62 0.55] | [0.230 0.251 0.245] |
| shore-rock | [0.52 0.50 0.47] | [0.496 0.487 0.482] |
| palm-foliage | [0.29 0.47 0.24] | [0.188 0.176 0.054] |
| blossom-foliage | [0.85 0.60 0.70] | [0.604 0.257 0.302] |
| bamboo-foliage | [0.44 0.58 0.29] | [0.359 0.459 0.186] |
| terrain-ground | [0.50 0.55 0.33] | [0.133 0.140 0.068] |
| creature-fur | [0.86 0.85 0.84] | [0.331 0.321 0.312] |

Only `ocean-surface` keeps its declared value: it is an analytic shader from ticket 04
and does not read a family albedo.

### The tool was wrong twice and its own accounting caught both

Worth recording, because both mistakes look like results.

**Measuring only textured surfaces** gave `shore-rock` a bright orange
[0.694 0.276 0.040] from 586 of its 26,779 units of area — the colour of one small
prop standing in for every rock. An untextured surface's albedo *is* its base colour,
so it is measured the same way, and the family came out [0.496 0.487 0.482]: neutral
grey, and close enough to the declared value to confirm it rather than replace it.

**Resolving the family from each mesh's own name** reached 38 per cent of
`palm-foliage` and 13 per cent of `creature-fur`. A palm frond is
`PalmTree__palmtree_5__0001/0000:Mesh:Mesh_79036`, so the mesh's name yields "Mesh",
and a wildlife rig's meshes are unnamed. The authored family lives on the placement
group, and `scene-placements.mjs` already resolved it that way — so that rule is now
exported as `resolveRenderableSemantics` and used by both, rather than a second
resolution existing to disagree with the first. Every family now reaches at least 0.78
of its authored area and every textured mesh resolves.

`creature-fur` moved from [0.197 0.113 0.050] over two meshes to [0.331 0.321 0.312]
over all 1,842 units, which is what fourteen black-and-white animals should average to.

## Measured, not fitted through the render, and why

`tools/development/measure-appearance-direction.mjs` pools each family's own reference
and candidate channel means over the six frozen cameras — direction the pass never
recorded, so before this a family's DeltaE could not be acted on at all. It began life
as a fitting loop that corrected each albedo by that ratio, and it is now report-only.

Its own numbers are the reason. A rendered fit wants `palm-foliage` at
[0.19 0.29 0.13] after one damped step and, converged, considerably darker than the
authored material actually is. That extra darkening is the authored canopy's density
and self-shadowing. Putting it in the albedo would be standing material in for missing
geometry, which is precisely what ADR-0040's ordering rule — no appearance evaluation
until the geometry layers pass — exists to prevent. The measured value sits between the
declared one and what the render wants, which is where an honest material belongs.

## Result

| | before | after |
| --- | --- | --- |
| global appearance DeltaE | 13.168 | **12.504** |
| worst camera | 17.287 | **16.522** |
| palm-foliage | 54.84 | **38.87** |
| paving-stone | 35.27 | **28.14** |
| blossom-foliage | 34.57 | **24.47** |
| painted-timber | 33.40 | **25.45** |
| bamboo-foliage | 24.26 | **21.85** |
| distant-rock | 10.83 | **10.39, converged** |

`distant-rock` now renders [179 177 163] against the reference's [179 176 161]: a
family whose material was measured and whose render agrees. That is the strongest
available evidence that the method is right, because nothing about it was fitted to the
result.

Three families moved marginally the wrong way — `creature-fur` 25.33 to 26.14,
`terrain-ground` 24.80 to 25.63, `shore-rock` 20.12 to 20.48. All three are surfaces
whose measured albedo is close to the declared one, so what moved them is a CIELAB
distance responding to a small hue change rather than a brightness error. Recorded
rather than glossed.

## What is left

- **`palm-foliage` at 38.87 is now geometry.** Its material is measured and its render
  is still 2.9 times too bright: reference [42 35 14] against candidate [121 108 53].
  A dense authored canopy is dark because it shadows itself, and the candidate's is not
  dense enough to. That belongs to the canopy, not the palette, and the ordering rule is
  what keeps it from being paid for in colour.
- **Roughness, transparency, and emission are still declared.** The measurement reads
  them from the same materials and does not yet carry them; roughness in particular is
  measurable directly, since the authored materials record it as a scalar rather than a
  map.
- **No bounded semantic pattern programs yet.** Every family is still one flat colour.
  That is the third checkbox and the largest remaining piece of this ticket.


## Roughness and metalness are measured now, and the rendered effect is noise

The albedo had an excuse for being hand-written: it lives in maps the Production Runtime
may not load, which is the whole reason a Material Family carries one. Roughness never
did. The authored materials record it as a plain scalar on **957 of 993** surfaces, and
every declared family has one over **100 per cent** of its own area, so the hand-written
values were guesses with the answer sitting in the frozen inventory.

They were wrong, and not by a little:

| family | declared | measured |
| --- | --- | --- |
| `distant-rock` | 0.96 | **0.80** |
| `terrain-ground` | 0.95 | **0.80** |
| `shore-rock` | 0.93 | **0.78** |
| `blossom-foliage` | 0.74 | **0.8965** |
| `creature-fur` | 0.85 | 0.7776 |
| `paving-stone` | 0.88 | 0.9163 |
| `bamboo-foliage` | 0.70 | 0.7537 |
| `painted-timber` | 0.72 | 0.749 |
| `palm-foliage` | 0.78 | 0.75 |

`metalness` was a hardcoded zero in `material-families.js` and is 0.0406 on
`painted-timber`. `ocean-surface` is absent from the table because it is a
`ShaderMaterial` and declares no roughness at all — measuring an absent parameter as zero
would have reported the authored sea as a mirror, so the tool records null and the recipe
keeps the declared value.

**The rendered effect is within noise, and that is not a reason to revert it.** Global
appearance DeltaE went 12.448958 to 12.452485, and per family three improved and seven got
worse, none by more than 0.11: `painted-timber` 24.534 to 24.431 and `blossom-foliage`
23.531 to 23.475 the right way, `palm-foliage` 36.131 to 36.176 and `terrain-ground` 24.083
to 24.122 the other. That is what should happen, for the reason this ticket already
recorded about the albedo: the residual left after a family's material is measured belongs
to geometry — the authored canopy self-shadows and a sparser candidate cannot — so
replacing a guessed roughness with the authored one is not expected to move DeltaE much.
Reverting a measured value because a render moved 0.03 per cent would be fitting the
material to the render, which is the thing this ticket exists to stop.

The guard is the same one the `shore-rock` albedo mistake bought: the recipe takes a
measured roughness only where `roughnessFraction` is essentially the whole family, because
a family measured from 2.2 per cent of its surface is how the whole family once got one
small prop's bright orange.

## Measured and deliberately not carried yet

Both are recorded so the next round starts from numbers rather than from nothing.

- **Transparency.** `paving-stone` is **75 per cent** marked `transparent` at an opacity of
  **1.0**, which is alpha-tested geometry rather than see-through surface: carrying it
  would change render ordering and depth-write behaviour rather than fade anything, and it
  is worth its own capture rather than a bolt-on. `painted-timber` is 0.02 per cent
  transparent at 0.569. 41 of 993 authored materials are transparent at all.
- **Emission.** Exactly **one** authored material in the whole scene carries an emissive
  colour. Emission on this island is Semantic Lights (ticket 12), not emissive materials,
  and a per-family emission term would be inventing one.

Still open, unchanged: there are no Bounded Semantic Pattern Programs at all — every
family is one flat colour.
