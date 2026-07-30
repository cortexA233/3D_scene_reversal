# 08 - Reconstruct vegetation canopies

**What to build:** Make palms, blossoms, and bamboo read as dense canopy rather than sparse sticks, since vegetation is the island's dominant visual mass and its worst appearance region.

**Blocked by:** None.

**Status:** done

- [x] Added a non-interactive check. The calibrated per-group thresholds do not exist yet (reconstruction ticket 01), so it is a recorded regression guard on the measured result rather than a parity gate, and says so.
- [x] Rebuild palm fronds as layered curved blades rather than flat planes.
- [x] Rebuild blossom and willow canopies as bounded organic masses with visible foliage density.
- [x] Rebuild bamboo as an axial layer family of culms with foliage.
- [x] Keep each entity's anchor and Target AABB Extent exact and keep the per-entity controls compact.
- [x] Report the vegetation region's appearance evidence, which is currently the worst at mean DeltaE 50.6.
- [x] Draw calls fell from 3,389 to 1,699 by merging each canopy into one semantic part. Generation time rose to 3.2 s and triangles to 678k; both are carried to reconstruction ticket 14, which owns the budgets.
