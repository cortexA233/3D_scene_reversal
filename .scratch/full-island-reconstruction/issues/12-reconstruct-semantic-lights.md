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
