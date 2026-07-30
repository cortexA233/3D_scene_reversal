# Full Island Reconstruction — handoff

Authority for a fresh session: this file, `spec.md`, the relevant ticket under
`issues/`, `CONTEXT.md`, and ADR-0036 through ADR-0048.

## Where the work stands

Branch `experiment/claude-full-island-scene`, worktree clean, everything pushed.

Scene Parity Foundation is complete and certified. `foundation=PASS` with
`candidate=RED`, which is the milestone's intended result. Full-island
reconstruction is planned as sixteen blocker-first tickets; one is done.

| Ticket | State |
| --- | --- |
| Foundation 01-12 | done, certified |
| Reconstruction 08 — vegetation canopies | done |
| Reconstruction 01-07, 09-16 | ready-for-agent |

## Environment

Every browser command needs these, because the harness looks for Chrome at
Unix paths and calls `python3`:

```bash
export CHROME_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
export PYTHON_BIN="python"
```

The normative observation host here is `windows-edge-150-swiftshader-subzero`.
It reproduces every scene-determined fact from the authoritative macOS profile
exactly; only the perceptual hash differs, under a separately versioned
cross-host bound. See ADR-0048.

## Commands

```bash
npm test                              # 187 tests
npm run check:scene-foundation-reconciliation
npm run check:reference-observation   # two full browser observations, slow
npm run check:scene-coverage
npm run check:scene-correspondence
npm run check:geography
npm run check:horizon
npm run check:scene-generation
npm run check:scene-calibration
npm run check:vegetation
npm run report:scene-parity           # exits 1 while the candidate is red
npm run certify:scene-parity-foundation
```

Measurement, which rewrites the evidence files:

```bash
npm run measure:scene-coverage        # browser, also writes elevation and horizon evidence
node scripts/run-scene-passes.mjs     # browser, six cameras, several minutes
npm run measure:scene-correspondence
npm run measure:geography
npm run measure:horizon
npm run calibrate:scene
npm run fit:tracer
```

Run the browser gates one at a time. Chained together they exceed ten minutes
and get killed.

## Current candidate result

```
structuralCorrespondence  pass
worldGeometry             fail
fixedCameraGeometry       not evaluated — no calibrated thresholds
nativeAppearance          not evaluated — geometry must pass first
```

World layout is exact and must stay that way: anchor, Target AABB Extent,
typed orientation, neighbourhood distance, zone occupancy, and overview overlap
ordering all report zero error across all 672 entities.

Failing world-geometry metrics, measured:

| metric | value | threshold |
| --- | --- | --- |
| surface p95 mean | 9.872 | 2.3479 |
| worst entity surface p95 | 165.6694 | 13.7587 |
| over-tolerance surface fraction | 0.6155 | 0.11835 |
| worst component deficit | 9 | 3.5 |
| terrain height p95 | 16.2617 | 5.26875 |
| shore height p95 | 12.4923 | 2.85035 |
| land and sea agreement | 0.9035 | 0.9314 |
| horizon profile p95 | 0.098887 | 0.0165 |
| worst azimuth horizon error | 0.124982 | 0.0165 |

## The next blocker

**Five of the six frozen cameras see only cloud and fog, not the island.**

`topDown` sits at y=4106 and the four obliques at y=3127. The cloud sprites
occupy y≈500-2600, so they sit between those cameras and the island, and linear
fog ends at 3500 while the island is 3100-4100 units away from them. The
reference's `oblique-north` capture is a field of white cloud; the candidate's
is a field of beige fog. Neither contains the island.

Consequences to take seriously before doing any more appearance work:

- `silhouette IoU mean 0.90` and `semantic agreement 0.867` are largely
  sky-agreeing-with-sky. Almost all real geometry signal comes from the single
  authored overview.
- `worst group paths IoU 0` on `oblique-north` means the paths are not visible
  from there at all, not that they are wrong.
- Calibrating the fixed-camera and appearance layers (reconstruction ticket 01)
  against five empty views would freeze thresholds that measure nothing.

This is a metric blind spot of exactly the kind the spec warns about. It cannot
be worked around by adjusting a threshold. The camera set is frozen by
ADR-0036, so changing it requires an explicit versioned migration with a new
ADR and full reference-only recalibration.

Recommended order from here:

1. Migrate the auxiliary camera set so the four obliques and the top-down view
   actually frame the island inside the fog range, with a new ADR and a
   re-derivation from reference world evidence only. Re-run the reference
   observation to re-freeze `reference-camera-set-v1` as v2.
2. Then reconstruction ticket 01, calibrating the two missing layers against
   cameras that see something.
3. Then ticket 02 atmosphere, 03 terrain, 05 horizon ridges, and onward.

Tickets 03 and 05 depend only on 3D evidence and are unaffected by the camera
problem, so they can proceed in parallel if useful.

## Things that are easy to get wrong

- The evidence files are inputs to the gate stack. After changing a generator,
  re-run the measurement commands before reading a report, or the report
  describes the previous candidate.
- `measureHorizon` and friends take an explicit recipe. Node caches modules by
  specifier, and busting only the importer still serves the cached recipe to
  everything it depends on.
- Semantic structure is a one-sided deficit. Do not restore an absolute delta:
  penalising extra parts equally pushes every generator toward a single mass.
- Generation is currently 3.2 s and 678k triangles. Both are outside any
  sensible budget and belong to ticket 14.
