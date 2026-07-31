# 05 - Reconstruct Horizon Group ridge silhouettes

**What to build:** Replace the rounded summit masses with layered ridge, peak, saddle, and foothill forms so the skyline's angular profile matches the authored one.

**Blocked by:** None.

**Status:** landed, gate red at a recorded representation boundary (ADR-0052)

- [x] Add one non-interactive check that is red until the Horizon Profile and per-group silhouette evidence are inside their frozen thresholds. — `test/horizon-reconstruction.test.mjs`, 7 assertions.
- [x] Extend each group's bounded multi-form controls with ridge direction, saddle depth, and flank falloff, keeping the eight-form cap. — plus run-out and apron; six group controls and two per summit, 27.8 numbers per group against a 60 guard.
- [x] Fit the controls against each group's own measured profile through the Reference-guided Fitting Loop. — `tools/reconstruction/fit-horizon-ridge.mjs`.
- [x] Keep every azimuth the reference covers covered; a narrower summit may not buy a lower angular error by vanishing. — `missingBins` 0, and the fit rejects any group whose coverage falls below its unfitted state.
- [x] Keep placement, Target AABB Extent, orientation, and overview overlap ordering exact. — all still 0.
- [x] Report aggregate, worst group, and worst azimuth separately.
- [x] Retain no sampled skyline table or dense angular array in production.
- [x] Keep depth interval and visible subtended angle evidence improving alongside the profile. — every one of them improved.

## What was wrong

Each group was a union of half-buried spheres. A sphere's widest point is its own
equator, so every group stood near summit height across nearly all of the azimuth
it covered. The absolute angular error reported that only as a large number; the
signed bias named it: the candidate was **2.6453 degrees above** the reference on
average and was the higher of the two in **624 of 720 bins**. The recorded visual
impression — that the candidate's distant mountains were low and blocky — was the
wrong way round, and `profile.signedBias` now exists in the evidence so the next
reader does not have to rediscover that.

The authored form, read from the reference GLB: a narrow diagonal ridge band
filling **31 per cent** of its own bounding box, with the measured summits strung
along it. Reproduced as one swept crest ridge per group.

## Measured

Pre-change numbers re-measured with the current metric, not quoted from the old
report, so the two columns are comparable.

| evidence | before | after |
| --- | --- | --- |
| profile p95 | 5.6658 deg | **2.5002 deg** |
| worst azimuth | 7.1609 deg | **3.7618 deg** |
| profile mean | 2.7981 deg | **1.0762 deg** |
| signed bias | +2.6453 deg, high in 86.7% of bins | **-0.0036 deg, high in 48.5%** |
| per-group silhouette p95 | 0.062652 | **0.025342** |
| depth interval error p95 / mean | 171.30 / 84.90 | **168.45 / 42.27** |
| depth centre error p95 / mean | 84.43 / 32.77 | **17.27 / 7.84** |
| subtended angle rel. error p95 / mean | 2.1308 / 0.7663 | **0.4835 / 0.0787** |
| worst entity surface p95 (correspondence) | 165.6694 | **143.0972** |
| draw calls | 1,714 | **1,708** |

Placement, extent, orientation, overlap ordering and skyline coverage all stayed
exact. Triangles rose 679,745 to 686,609.

## Why the gate is still red

ADR-0052. The eight-form cap cannot reach 0.0165 radians and the bound is a
property of the control budget, not of the fitter: the optimal piecewise-linear
approximation of the worst group's own measured profile, exact by dynamic
programming, needs 3.257 deg at eight nodes, 1.955 at twelve, 1.417 at sixteen
and 0.952 at twenty-four, against a 0.945 threshold. The achieved fit lands where
that bound predicts. Twenty-four nodes per group is 1,152 numbers for a 720-bin
skyline, which is a sampled skyline and is prohibited.

The frozen assertion is marked `todo`, unchanged, rather than loosened.

## Next

The sixteen groups are instances of **three** authored meshes — `m14887720468`
(6), `m15224226592` (7), `m15230860430` (3) — which is why their measured summit
sets are the same heights under rotation and mirroring. Three shared crest tables
at twenty-four nodes is 216 numbers rather than 1,152, and would put the bound
under the threshold while staying compact. The family assignment must be derived
by clustering measured shape, never from the source mesh identity. That is a new
representation for a Horizon Group and needs its own reference-only measurement,
a versioned gate revision, and its own ADR.

Two smaller residuals, both understood:

- The seven square-footprint groups carry a low authored apron out to their own
  bounding-box corners. It sets their depth interval and contributes nothing to
  their skyline, so `depthError` — an extremum over two vertices — rewards a
  box-filling blob over a correctly narrow ridge. `depthCentreError` was added
  for that reason and is the statistic to read.
- The measured summit offsets come off a 12x12 grid over each group's box, which
  at these distances is +/- 4.7 azimuth bins of quantisation, wider than the whole
  error budget. A finer summit measurement would help a future fit; letting this
  fit move summits inside that window was tried and made the result worse.



## The declared resolution path is measured and closed — do not re-open it

ADR-0052 named three shared crest tables as the way through and left it unmeasured.
`tools/development/fit-horizon-families.mjs` measures it. **It does not work.**

The clustering itself is sound: reading no mesh name, it recovers families of **3, 7 and 6**
against ADR-0052's stated 6/7/3 source-mesh split, which is independent confirmation the
families are real.

| representation | numbers/group | worst error | reaches 0.945? |
| --- | --- | --- | --- |
| shared table, 3 families | 10.5 | **3.670** bound, **3.830** rebuilt | no |
| shared node positions, per-group values | ~43 | 0.680 | yes |
| today's 2 peaks + 6 scalars | 14 | 2.50 achieved | no |

**The shared table saturates at 3.670 degrees regardless of node count** — 16, 24, 32, 40 and
48 all give the same number. The error is set by how much a family's members differ from each
other, not by how finely the table is sampled, so there is no node budget that reaches the
threshold and the compactness question never arises.

What *does* reach 0.945 is shared node positions with per-group values, at 40 values per group
— 640 numbers for a 720-bin skyline, which is the sampled skyline ADR-0052 prohibits on
Production Runtime grounds rather than on cost grounds. The per-group bound crossing between
24 nodes (0.952) and 32 (0.516) is real and is what that representation buys; it does not
change the verdict.

**A correction worth carrying, because it nearly shipped as a finding.** The first version of
the shared cost let every member interpolate through *its own* values at the shared node
positions. That measures per-group values with shared positions, not a shared table, and it
reported 0.680 degrees — which was then written up as "the boundary is crossable". The
reconstruction check in `fit-horizon-families.mjs` caught it: rebuilding a group's profile from
the table gave 4.909 degrees against a claimed bound of 0.680, a sevenfold disagreement that
can only mean the bound was measuring something else. **A bound and a rebuild are two
measurements of one quantity, and this milestone's recurring lesson is that redundancy is what
finds a wrong measurement.**

So the two skyline gates stay red at 0.0436 and 0.0657 radians against 0.0165, with ADR-0052
as their reason, and that reason is now proved rather than declared.
