# 12 - Reconstruct Semantic Lights and emissive sources

**What to build:** Make the island's 32 local lights illuminate, with each tied to the entity that emits it, so lantern glow is light rather than colour.

**Blocked by:** 11 - Reconstruct Material Families and bounded appearance.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until local light contribution and shadow placement evidence are inside their thresholds.
- [ ] Reproduce each Semantic Light's position, colour, intensity, range, decay, and shadow behaviour.
- [ ] Keep the declared relationship between a light and its emissive source entity.
- [ ] Keep emissive materials and actual lights distinct.
- [ ] Report lighting evidence per camera with the worst camera retained.
- [ ] Keep the light count and shadow cost inside the runtime budget.


## The emissive relationship existed and was wrong

Ticket 12 asks for Semantic Lights with "an explicit relationship to its emissive source
entity". The 32 lights are generated as `PointLight`s and 19 of them named a source — and
the naming rule attributed each light to the entity whose **anchor** was nearest.

An anchor is an entity's bottom-centre. A lantern's light sits at the *top* of the lantern,
so the anchor distance is roughly the fixture's own height, and the nearest anchor is
usually something else entirely. It put lights on a `panda`, a `bamboo-pile` and a
`paving-slab`, and needed a 25-unit threshold to reach past an entity's own height at all.

Measuring distance to the entity's **box** instead — zero inside it, so "inside" and "just
outside" are one continuous test rather than two rules — puts the same lights where they
belong, at a 5-unit threshold that is a light fixture's own scale:

| | anchor rule | box rule |
| --- | --- | --- |
| lights with a source | 19 of 32 | **15 of 32** |
| kinds named | `panda`, `bamboo-pile`, `paving-slab`, `dessert-shop`, … | `wish-tree` x6, `dessert-shop` x3, `dumpling-house` x3, `plaza`, `yin-yang`, `tea-booth` |

**Fewer, and that is the point.** A wrong relationship in a frozen artefact is worse than an
absent one, and the 17 unattached lights stay explicitly null rather than being handed the
nearest thing. `test/scene-recipe-contract.test.mjs` asserts every named source is within
five units of the light *and* is the nearest box of all 672 entities, so a light inside two
overlapping boxes names the one it is actually in.

This changes no geometry and no appearance — `emissiveSource` is a semantic record the
generator stores on the light's `userData` — so no capture was invalidated.

## Still open

The other 17 decoration kinds. They are mostly single placements, which is the evidence
thinness that sank the bridge attempt and the tree attempt; `name-plate` (659 authored
overview pixels) and `yin-yang` (505) are the only two above 250 that are not already done,
and neither has more than one placement.


## What the remaining decoration kinds actually are, measured

Ranked by authored overview pixels, with `lantern` and `npc-statue` already done (ADR-0060,
48 per cent of the group):

| kind | placements | authored px | |
| --- | --- | --- | --- |
| `name-plate` | **1** | 659 | |
| `yin-yang` | **1** | 505 | |
| `shop-sign` | 6 | 248 | not one asset — see below |
| `umbrella` | 3 | 186 | |
| `stone-table` | 1 | 73 | |
| everything else | 1-6 | ≤14 | |

The two kinds with real pixel weight have **one placement each**, which is the evidence
thinness that produced three reverts this milestone. And the two with enough placements are
worth 434 pixels between them.

**`shop-sign` is at least two different assets sharing a resolved kind.** The plan scan
settles it: `shop-sign-n0111` is **13,460 triangles** and projects as a rounded disc filling
its box, while `shop-sign-p0788` and `shop-sign-p0860` are **84 triangles** each and project
as flat rectangles with legs at the corners. A hundred and sixty-fold difference in triangle
count is not a variant. This is ADR-0057's "one kind, two assets" a fourth time, and a single
unparameterised program is wrong for one of them by construction.

Both remaining kinds do show the same defect the shops had — far too much mass at the base.
`shop-sign` puts 22.2 per cent of its area in the base decile against an authored 9.4, and
`umbrella` 28.1 against 4.9, both from `architecture`'s plinth. `umbrella` is also widest at
the *bottom*, 0.87 to 0.90, tapering to 0.5 at the top, which is not what its name suggests
and is worth looking at before assuming a canopy.

**Not built, and why.** The route is known and proven — per-entity measured controls, as the
bridge and pavilions took — but the payoff is about 1,700 authored pixels out of a million
per camera, `decorations` already contributes less than the group average to both the contour
mean (1.18) and the depth mean (2.24), and part of its 1.55 pixel ratio is ADR-0060's
deliberate trade of a fuller form for better agreement. Building a per-entity program on one
placement is precisely what was reverted three times here. The measurements are recorded so a
future attempt starts from them rather than from a guess.
