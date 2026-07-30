# 05 - Reconstruct Horizon Group ridge silhouettes

**What to build:** Replace the rounded summit masses with layered ridge, peak, saddle, and foothill forms so the skyline's angular profile matches the authored one.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the Horizon Profile and per-group silhouette evidence are inside their frozen thresholds.
- [ ] Extend each group's bounded multi-form controls with ridge direction, saddle depth, and flank falloff, keeping the eight-form cap.
- [ ] Fit the controls against each group's own measured profile through the Reference-guided Fitting Loop.
- [ ] Keep every azimuth the reference covers covered; a narrower summit may not buy a lower angular error by vanishing.
- [ ] Keep placement, Target AABB Extent, orientation, and overview overlap ordering exact.
- [ ] Report aggregate, worst group, and worst azimuth separately.
- [ ] Retain no sampled skyline table or dense angular array in production.
- [ ] Keep depth interval and visible subtended angle evidence improving alongside the profile.
