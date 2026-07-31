---
status: accepted
---

# Record the horizon form budget as a representation boundary

The frozen skyline gates require the Horizon Profile's p95 and its worst azimuth to be within 0.0165 radians, and the eight-form cap on a Horizon Group's bounded multi-form controls cannot reach that. The limit is the number of crest controls, not the fitter and not the form family: the optimal piecewise-linear approximation of each group's own measured profile — computed exactly by dynamic programming over segment boundaries, which no generator carrying that many crest controls can beat — needs 3.257 degrees at eight nodes on the worst group, 1.955 at twelve, 1.417 at sixteen, and 0.952 at twenty-four, against a threshold of 0.945. The measured fit lands where that bound says it should, at 2.5002 p95 and 3.7618 worst azimuth.

Twenty-four crest nodes per group would be 1,152 numbers across the sixteen groups to describe a 720-bin skyline generated from three distinct authored meshes. That is a sampled skyline wearing a generator's name, and it is prohibited by the Production Runtime boundary rather than merely expensive; the compactness guard of sixty numbers per group refuses it first. The threshold is therefore not reachable under this milestone's own production constraints, and neither the threshold nor the cap is changed here: the threshold is frozen and honestly calibrated from reference-only damage, and raising the cap far enough to matter would breach a rule that exists for a better reason than this gate.

The gate stays red and the check that asserts it is marked outstanding rather than loosened or deleted, with this record as its reason. The declared resolution path is a shared form family: the sixteen groups are instances of three authored meshes, so three shared crest tables at twenty-four nodes would be 216 numbers rather than 1,152, and the per-group recipe would carry a family index and its existing placement. That changes what a Horizon Group's controls are and needs its own reference-only measurement, a versioned gate revision, and its own ADR, so it is named as the next step rather than taken here.


## Superseded in part: the boundary is crossable

The declared resolution path above has now been measured and it works, so the flat statement
that the threshold "is therefore not reachable under this milestone's own production
constraints" is too strong. It is not reachable *by per-group tables under the eight-form
cap*, which is what was measured at the time.

Two corrections. The node table above stops at 24, where the per-group bound is 0.952
against 0.945 — just over. At **32 nodes it is 0.516**, comfortably under. And per-group
tables cannot take 32 nodes because that is 96 numbers per group against the compactness
guard's 60, but **shared tables can**: clustering the sixteen groups by measured shape gives
families of 3, 7 and 6, and one shared table per family reaches **0.930 degrees at 32 nodes
for 9.0 numbers per group** and **0.680 at 40 nodes for 10.5**.

The clustering reads no mesh name, as this record required, and recovering 3/7/6 against the
stated 6/7/3 source split is independent confirmation that the families are real.

One assumption in this record does not survive either: it expected the path to need a
"versioned gate revision". It does not. The threshold is honestly calibrated and the
candidate can reach it as frozen; what is needed is a measurement, a recipe field, a
generator change and an ADR. `measure-horizon-form-budget.mjs --families` reproduces every
number above. Ticket 05 carries the build order.
