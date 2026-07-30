# 08 - Reconstruct vegetation canopies

**What to build:** Make palms, blossoms, and bamboo read as dense canopy rather than sparse sticks, since vegetation is the island's dominant visual mass and its worst appearance region.

**Blocked by:** None.

**Status:** re-opened and advanced. It was marked done on palm and blossom evidence
while bamboo was left at more than five times their surface residual, hidden inside a
per-kind average that conflated two different authored forms.

- [x] Added a non-interactive check. The calibrated per-group thresholds do not exist yet (reconstruction ticket 01), so it is a recorded regression guard on the measured result rather than a parity gate, and says so.
- [x] Rebuild palm fronds as layered curved blades rather than flat planes.
- [x] Rebuild blossom and willow canopies as bounded organic masses with visible foliage density.
- [x] Rebuild bamboo as an axial layer family of culms with foliage.
- [x] Split the two authored forms that shared the `bamboo` kind, and fit each. See below.
- [ ] The 72 standing clumps still carry 3.2 of the failing 9.30 surface gate, and the cause is a sampler defect rather than the form. See below.
- [x] Keep each entity's anchor and Target AABB Extent exact and keep the per-entity controls compact.
- [x] Report the vegetation region's appearance evidence, which is currently the worst at mean DeltaE 50.6.
- [x] Draw calls fell from 3,389 to 1,699 by merging each canopy into one semantic part. Generation time rose to 3.2 s and triangles to 678k; both are carried to reconstruction ticket 14, which owns the budgets.


## `bamboo` was left behind, and an average hid it

This ticket reported palm surface p95 falling to 5.80 and blossom to 3.57, and both
still read exactly that. It never mentions bamboo, which was at **17.78** — and by
entity count bamboo was the single largest contributor to the failing
`surface p95 mean` gate at 3.44 of 9.45, more than the sixteen distant mountains
together.

### Two authored forms shared one kind

`bamboo_forest_fbx` is placed as two entirely different things, and one authored name
cannot say which. Measured by height-to-width aspect over the 130 placements:

| cluster | n | aspect | authored triangles | extent |
| --- | --- | --- | --- | --- |
| standing clumps | 72 | 3.85 – 4.00 | 19,908 | ~16 x 62 x 15 |
| flat pieces | 56 | 0.061 – 0.071 | 80 | 10.7 x 0.7 x 4.1 |
| flat mats | 2 | 0.061 | 1,748 | up to 85 x 5 x 60 |

Nothing sits between the clusters. Because Target AABB Extent is a hard output
target, generating a standing clump for a piece 0.7 units tall produced a squashed
clump, and the 17.78 average was the two failures mixed.

`resolveFamily` now splits them on the measured proportion — a stand is taller than
it is wide — the same way it already splits `paving-slab` into `deck` on measured
footprint. `bamboo-bed` is a fan of near-flat blades across the footprint.

**Result: the 58 beds went from inside a 17.78 average to 2.13**, against a
threshold of 2.3479. They are essentially done. And the split revealed the stands'
true residual of 30.28, which the average had been hiding.

### The stands: the canopy is right and the metric is not

Measured over 72 authored clumps and 6,912 triangle-uniform samples, 99.9 per cent of
the authored geometry sits above 60 per cent of its height. The authored culms are
about three parts in a thousand of its triangles — thin enough to carry the bounding
box and nothing else. The candidate's segmented culms with node rings were **77 per
cent** of its own triangles.

The canopy was already right, and the directional split proves it:

| kind | reference to candidate p95 | candidate to reference p95 | ratio |
| --- | --- | --- | --- |
| **bamboo** | **4.12** | **39.32** | **9.55** |
| bamboo-bed | 1.97 | 2.21 | 1.12 |
| palm | 6.20 | 4.53 | 0.73 |
| blossom | 3.13 | 3.68 | 1.18 |
| rock | 5.61 | 5.33 | 0.95 |

Every reference sample finds a candidate surface within 4.12 units. The entire
penalty is one-directional, and bamboo is the only kind where that is true —
`tools/development/measure-surface-sampling-symmetry.mjs` reports it across every
kind.

**The cause is the sampler's allocation, and it penalises the semantic part structure
ticket 10 exists to add.** `sampleEntitySurface` gives each mesh in an entity
`min(96, max(12, sqrt(triangles) * 3))` samples. That is sub-linear and floored, so a
small part is sampled far more densely than its share of the entity. An authored
placement is one mesh whose culms are never sampled; a generated clump carrying culms
and foliage as separate semantic parts gives its culms a floor of twelve samples
however few triangles they have, and each measures its distance to a canopy tens of
units away. Simplifying the culms from 77 per cent of the triangles to about 13 moved
the gate only 9.447 to 9.3025, because the floor does not care.

Fixing it means allocating an entity's budget across its meshes in proportion rather
than per mesh. That changes the frozen reference samples and moves the world-geometry
layer's thresholds, which are calibrated with the reference on both sides — the same
shape of work as ADR-0053, and a deliberate re-measurement rather than a free change.
It is the next step for this ticket and probably for the surface gate generally.
