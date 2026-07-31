# 10 - Restore semantic part structure

**What to build:** Give multi-part authored objects their parts, so a bounds-accurate single mass can no longer stand in for a structured object.

**Blocked by:** 07 - Reconstruct architecture and bridge silhouettes; 08 - Reconstruct vegetation canopies.

**Status:** done — the frozen `worst component deficit` gate passes at 0 against
its threshold of 3.5, and no entity is missing parts

- [x] Add one non-interactive check that is red until the semantic component delta is inside its frozen threshold. — `worst component deficit` in `scene-quality-baseline-v1`, threshold 3.5, plus `npm run check:semantic-parts` (4 tests) as the ratchet at 0.
- [x] Give each family's generator the semantic parts its authored counterpart has, with stable part identities. — `quadruped`, fifteen fixed identities, no rng.
- [x] Resolve the 14 entities currently missing components. — 14 to **0**; worst deficit 9 to **0**.
- [x] Keep openings, passages, disconnected parts, and layers meaningful rather than decorative. — a named body chain and named limb segments, asserted ordered along the body and mirrored across it.
- [x] Report aggregate and worst-entity component evidence. — `creature-parts-v1.json` for the authored structure, `scene-correspondence-v1.json` for the result.
- [x] Confirm no placement or extent regression. — anchor p95 0, extent p95 0, orientation p95 0, unchanged.

## The count said fifteen; the question was which fifteen

`worst component deficit` read 9 and the eight worst entities were all pandas. All
fourteen were: the authored wildlife rig carries fifteen meshes and the generator
emitted six, or seven when `rng.nextFloat() > 0.5` said so.

A part count does not say what to build, so the structure was measured before
anything was generated. Every rig has the same topology:

| | authored | generated |
| --- | --- | --- |
| body masses along the long axis | 3 | 3 |
| legs | 4 | 4 |
| segments per leg | 3 | 3 |
| **parts** | **15** | **15** |
| triangles | 1,879 / 2,316 | 1,140 |

The two distinct panda assets agree on that topology and, once each is expressed
as fractions of its own Target AABB Extent, on the proportions to within a few per
cent. So one program covers the family and what crosses into production is about
twenty fractions — no per-entity table, nothing that scales with the number of
pandas or with triangle count.

Two facts in the measurement were worth pinning down rather than assuming:

- **The rigs face their own local -Z.** In the local frame recovered by un-rotating
  each world offset by the entity's own Typed Scene Orientation yaw, all fourteen
  put the head mass at negative Z. Building the head at +Z satisfies the extent
  contract exactly and puts every panda's head where its tail is, so the chain's
  order is asserted rather than commented.
- **The proportions come only from the two yaw-0 representatives.** An authored
  AABB is a world AABB, so for a yawed placement it bounds the *rotated* form and
  its axes are not the rig's own. Normalising by it folds the rotation into the
  proportions.

## The result, including the part that was not asked for

| metric | before | after |
| --- | --- | --- |
| worst component deficit (gated, ≤ 3.5) | 9 ✗ | **0** ✓ |
| mean component deficit | 0.1786 | **0** |
| entities missing parts | 14 | **0** |
| `panda` surface p95 mean | 1.2691 | **1.1581** |
| `panda-statue` surface p95 mean | 1.8857 | **1.7037** |
| aggregate surface p95 mean | 7.2469 | **7.2441** |
| over-tolerance surface fraction | 0.6219 | **0.6201** |
| triangles / draw calls | 529,390 / 1,656 | 541,245 / 1,786 |

`panda-statue` is authored as one merged 204-triangle mesh and had no deficit to
fix, and it improved on the same program anyway. Structure measured rather than
invented tends to pay twice, which is why the statue keeps no special case.

## What is deliberately not gated

The component *delta* is 14 at its worst — `panda-statue` has fifteen generated
parts against one authored mesh — and that is not a defect. Nearly every authored
object on this island is a single merged mesh, an artefact of how the scene was
exported rather than a claim that a pavilion has one part; a generated form that
decomposes meaningfully therefore has a large delta and no deficit at all. Gating
the delta would pay a generator to merge its parts away, which is the exact
failure the deficit exists to catch. `tools/evaluation/scene-correspondence.mjs`
already says so at the point where the metric is computed, and the ratchet is on
the deficit.

## The checks can go red

Both negative directions were run rather than reasoned about:

| damage | result |
| --- | --- |
| head moved to +Z, hips to -Z | `the head is behind the chest` |
| legs cut from three segments to one | `panda emits 7 parts, not 15`, `expected twelve leg segments, saw 4`, and the deficit ratchet fails at 8 |

ADR-0056.
