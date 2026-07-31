---
status: accepted
---

# Record the horizon form budget as a representation boundary

The frozen skyline gates require the Horizon Profile's p95 and its worst azimuth to be within 0.0165 radians, and the eight-form cap on a Horizon Group's bounded multi-form controls cannot reach that. The limit is the number of crest controls, not the fitter and not the form family: the optimal piecewise-linear approximation of each group's own measured profile — computed exactly by dynamic programming over segment boundaries, which no generator carrying that many crest controls can beat — needs 3.257 degrees at eight nodes on the worst group, 1.955 at twelve, 1.417 at sixteen, and 0.952 at twenty-four, against a threshold of 0.945. The measured fit lands where that bound says it should, at 2.5002 p95 and 3.7618 worst azimuth.

Twenty-four crest nodes per group would be 1,152 numbers across the sixteen groups to describe a 720-bin skyline generated from three distinct authored meshes. That is a sampled skyline wearing a generator's name, and it is prohibited by the Production Runtime boundary rather than merely expensive; the compactness guard of sixty numbers per group refuses it first. The threshold is therefore not reachable under this milestone's own production constraints, and neither the threshold nor the cap is changed here: the threshold is frozen and honestly calibrated from reference-only damage, and raising the cap far enough to matter would breach a rule that exists for a better reason than this gate.

The gate stays red and the check that asserts it is marked outstanding rather than loosened or deleted, with this record as its reason. The declared resolution path is a shared form family: the sixteen groups are instances of three authored meshes, so three shared crest tables at twenty-four nodes would be 216 numbers rather than 1,152, and the per-group recipe would carry a family index and its existing placement. That changes what a Horizon Group's controls are and needs its own reference-only measurement, a versioned gate revision, and its own ADR, so it is named as the next step rather than taken here.



## The declared resolution path is now measured, and it is closed

This record named a way through — three shared crest tables from clustering measured shape —
and left it as the next step. It has been measured. **It does not work, and this record's
conclusion stands with a stronger proof than it had.**

`tools/development/fit-horizon-families.mjs` clusters the sixteen groups by measured profile
shape, reading no mesh name as this record required, and the clustering recovers families of
**3, 7 and 6** against the 6/7/3 source-mesh split — independent confirmation that the
families are real. It then fits one shared table per family and rebuilds each group's own
profile from it.

| representation | numbers per group | worst error | reaches 0.945? |
| --- | --- | --- | --- |
| shared table, 3 families | 10.5 | **3.670** bound, **3.830** rebuilt | no |
| shared node *positions*, per-group values | ~43 | 0.680 | yes |
| today's two peaks and six scalars | 14 | 2.50 achieved | no |

**The shared table's error is independent of node count.** 16, 24, 32, 40 and 48 nodes all
give 3.670 degrees, because the error is set by how much a family's members differ from each
other rather than by how finely the table is sampled. There is no node budget that reaches
the threshold, so the compactness argument this record makes never even comes into play.

The representation that *does* reach 0.945 is shared node positions with per-group values —
and at 40 values per group that is 640 numbers to describe a 720-bin skyline, which is the
sampled-skyline objection this record already raised, met at a smaller scale. The per-group
bound crossing between 24 nodes (0.952) and 32 (0.516) is real and worth recording, and it is
what that representation would buy; it does not change the verdict.

One correction to this record's own framing: it expected the path to need a "versioned gate
revision". No revision is needed or wanted, because the threshold was never the problem.

So the horizon boundary is not "the next step, unmeasured" any more. It is closed, and the
two skyline gates stay red with this as their reason.
