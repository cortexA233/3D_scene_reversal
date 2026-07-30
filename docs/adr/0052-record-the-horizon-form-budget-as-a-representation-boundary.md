---
status: accepted
---

# Record the horizon form budget as a representation boundary

The frozen skyline gates require the Horizon Profile's p95 and its worst azimuth to be within 0.0165 radians, and the eight-form cap on a Horizon Group's bounded multi-form controls cannot reach that. The limit is the number of crest controls, not the fitter and not the form family: the optimal piecewise-linear approximation of each group's own measured profile — computed exactly by dynamic programming over segment boundaries, which no generator carrying that many crest controls can beat — needs 3.257 degrees at eight nodes on the worst group, 1.955 at twelve, 1.417 at sixteen, and 0.952 at twenty-four, against a threshold of 0.945. The measured fit lands where that bound says it should, at 2.5002 p95 and 3.7618 worst azimuth.

Twenty-four crest nodes per group would be 1,152 numbers across the sixteen groups to describe a 720-bin skyline generated from three distinct authored meshes. That is a sampled skyline wearing a generator's name, and it is prohibited by the Production Runtime boundary rather than merely expensive; the compactness guard of sixty numbers per group refuses it first. The threshold is therefore not reachable under this milestone's own production constraints, and neither the threshold nor the cap is changed here: the threshold is frozen and honestly calibrated from reference-only damage, and raising the cap far enough to matter would breach a rule that exists for a better reason than this gate.

The gate stays red and the check that asserts it is marked outstanding rather than loosened or deleted, with this record as its reason. The declared resolution path is a shared form family: the sixteen groups are instances of three authored meshes, so three shared crest tables at twenty-four nodes would be 216 numbers rather than 1,152, and the per-group recipe would carry a family index and its existing placement. That changes what a Horizon Group's controls are and needs its own reference-only measurement, a versioned gate revision, and its own ADR, so it is named as the next step rather than taken here.
