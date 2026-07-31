# 03 — CPU rasterizer, divergence tolerance, wall-clock budget

Type: task
Status: resolved
Blocked by: 02

**What to build:** a project-owned pure-JavaScript triangle rasterizer that produces the buffers the
copied metric functions already accept, plus the calibration evidence that proves it is a usable
stand-in for the browser.

This ticket closes the single largest risk in the whole effort. If the CPU rasterizer and the browser
disagree by more than the fitting loop's discrimination margin, then the inner loop is optimising an
unproven ruler and every downstream result is suspect. The choice of a CPU backend also rests on a
performance estimate, so measured wall-clock is a deliverable, not a nice-to-have.

- [x] The rasterizer emits silhouette, depth, and normal buffers in the exact shape the copied metric
      functions accept, so no metric is reimplemented
- [x] Progressive resolution is supported: fewer views at low resolution for coarse search, the full
      twelve-view capture protocol for final scoring
- [x] Reference-side buffers are computed once and cached across fitting iterations
- [x] Beam candidates rasterize in parallel using Node's built-in worker threads, with no added
      dependency
- [x] Output is byte-stable across two runs on the same platform and across platforms
- [x] An acceptance script rasterizes the eight accepted replacements and their references and
      compares every geometry metric against the existing browser-captured values
- [x] The report freezes a per-metric divergence tolerance and states the discrimination margin that
      tolerance must stay below
- [x] The report publishes measured wall-clock per fitting iteration and per unit against a declared
      budget
- [x] The script follows the existing calibration pattern: a `--check` mode and a frozen JSON report
- [x] Exceeding the declared wall-clock budget is reported as evidence for revisiting the backend, and
      does not weaken any gate

## Resolution

`packages/mesh-to-code/src/rasterizer/` holds a pure-JavaScript triangle
rasterizer with zero dependencies. It emits `silhouette`, `depth`, and
`worldNormal` as `Uint8Array` RGBA buffers of exactly `width * height * 4`,
which is the shape `evaluateGeometryView` already validates, so the buffers are
handed straight to the copied metric functions and no metric is reimplemented for
this backend.

Reproducing the harness mattered more than being textbook-correct. The
conventions matched, each of which changes the result:

- every pass material is `THREE.DoubleSide`, so nothing is culled and back faces
  flip their normal exactly as `if (!gl_FrontFacing)` does;
- captures read from a `WebGLRenderTarget` created with no `samples` option, so
  they are **not** multisampled — a hard-edged pixel-centre rule is the right
  model, not coverage blending;
- depth carries `-viewPosition.z`, the view-space distance, clamped to `[0,1]`
  over `far - near`, with a white background;
- world normals use `normalize(mat3(modelMatrix) * normal)` — the plain upper-left
  3×3, not its inverse transpose;
- `Matrix4.lookAt` handedness and `Matrix4.makePerspective` framing, rather than a
  textbook equivalent;
- framing derives from the Authored Reference bounds alone and is never reframed
  from the replacement.

The evaluation protocol itself is vendored byte-identically alongside the metric
modules, for the same one-ruler reason: a CPU score is comparable to a browser
capture only while the twelve-view set, the 512-pixel capture size, the
38-degree field of view, the canonical maximum dimension, and the framing margin
are literally the same numbers. The drift check now covers five vendored files
and extends to `.js` as well as `.mjs`.

Progressive resolution is three declared stages: `coarse` at 128 pixels over four
views, `fine` at 256 over the eight low-elevation views, and `final` at the full
`CAPTURE_SIZE` over all twelve. The final stage is the protocol rather than a
sample of it, which is what makes a final score comparable to a browser capture
at all. Reference-side buffers are cached per stage: a test asserts that three
scoring iterations rasterize the reference exactly once. Beam candidates
rasterize through a `node:worker_threads` pool with transferable `ArrayBuffer`s
and no added dependency, and results are keyed by candidate rather than by
completion order, so a parallel run and a serial run produce identical bytes.

Byte stability rests on the inner loop using only IEEE-754-exact operations —
add, subtract, multiply, divide, `Math.sqrt`, `Math.floor`, `Math.min`,
`Math.max`, `Math.round`, and comparisons. No `Math.hypot`, no trigonometry, and
no iteration over a hash-ordered collection appear in it; the camera's single
`Math.tan` call happens once outside the raster loop and is the same call
Three.js makes. Two runs and the worker-thread path agree byte-for-byte on all
eight units, verified by sha256 over every buffer.

### Divergence evidence

`node scripts/run-decompiler-rasterizer-calibration.mjs` rasterizes all eight
accepted replacements and their Authored References, computes every geometry
metric through the copied functions, and compares against
`visual.comparison.perView` in the frozen acceptance reports. No browser ran,
nothing was recaptured, and no frozen report, baseline, or gate was modified.
Frozen output:
`gt_designer/single-mesh-evaluation/reports/decompiler-rasterizer-divergence-v1.json`.

The discrimination margin is defined as the smallest distance, across the eight
units, between an accepted candidate's browser-measured aggregate and the hard
threshold it was accepted under. A divergence larger than that could flip an
accepted verdict, which is precisely the unproven-ruler failure.

| Metric | Max divergence | Frozen tolerance | Margin | Tolerance / margin |
| ------ | -------------: | ---------------: | -----: | -----------------: |
| `bounds.maxAxisRelativeError` | 3.883e-15 | 5.830e-15 | 1.324e-2 | 0.0000 |
| `bounds.bottomAnchorErrorCanonical` | 3.794e-15 | 5.700e-15 | 1.158e-2 | 0.0000 |
| `silhouette.meanIou` | 2.710e-4 | 4.070e-4 | 1.110e-2 | 0.0367 |
| `silhouette.worstViewIou` | 6.176e-4 | 9.270e-4 | 1.453e-2 | 0.0638 |
| `silhouette.meanEdgeDistancePixels` | 6.329e-3 | 9.500e-3 | 2.397e-1 | 0.0396 |
| `silhouette.edgeDistanceP95Pixels` | 2.861e-1 | 4.300e-1 | 1.113e+0 | 0.3863 |
| `depth.mae` | 3.741e-5 | 5.620e-5 | 4.243e-3 | 0.0132 |
| `depth.p95` | 0.000e+0 | 0.000e+0 | 7.413e-3 | 0.0000 |

Every tolerance is below its margin; the worst ratio is `edgeDistanceP95Pixels`
at 0.386. The tolerance rule is the observed maximum absolute divergence across
the eight units times a declared 1.5 guard factor, rounded up to three
significant digits — the guard exists because the observation is a single
measurement on one machine.

The strongest single result is not in the table: for all eight units across all
eight metrics, the pass-or-fail verdict computed from CPU buffers is the same as
the verdict computed from the browser's, so on the whole regression corpus the
CPU ruler never flips an accepted unit.

### Wall-clock evidence

The budget was declared before measuring, and derived rather than picked: K≈3
structure candidates × R≈3 rounds × 40 fitting iterations = 360 coarse-stage
scores per unit, so 150 ms per coarse iteration puts a unit at 54 s, three
final-stage scores at 2 s put it at 6 s, both inside a 600 s per-unit ceiling
that leaves room for decomposition, baseline generation, and emission.

| Measure | Budget | Measured maximum | Factor |
| ------- | -----: | ---------------: | -----: |
| Coarse-stage fitting iteration | 150 ms | 17.0 ms (umbrella) | 0.11× |
| Final twelve-view score | 2,000 ms | 753 ms (blue-hat) | 0.38× |
| Per unit | 600,000 ms | 838 ms (blue-hat) | 0.001× |

Per-unit coarse-iteration means: stone-path 12.0, stone 13.7, bamboo-shoot 10.9,
blue-hat 16.5, vase 14.7, candle 12.7, mushroom 13.4, umbrella 17.0 ms. Every
measure is inside its declared budget, so the over-budget reporting path was not
exercised by these numbers; the script implements it and reports the factor
either way, and its policy line states that exceeding the budget is backend
evidence and never weakens a gate, a threshold, or a tier.

`--check` recomputes divergence, tolerances, and margins and requires them to
match the frozen report exactly, then re-measures wall-clock against the declared
budget rather than against the frozen measurement, because a frozen wall-clock
number would drift with hardware. `--check` passes.

## Comments

**A real convention mismatch surfaced, and it was a bug in this work rather than
a rasterizer limit.** The first full run had `bounds.bottomAnchorErrorCanonical`
diverging by 1.894e-2 against a margin of 1.158e-2 — a FAIL. That metric is
purely analytic and never touches a pixel, so the cause could not be the
rasterizer. It was mushroom: its generator sets `root.position.y = -0.019646`,
and the harness's frame assigns `root.position` from the replacement transform's
`translationBeforeScale`, which is always the origin. Every frozen browser number
for mushroom was therefore produced with that offset discarded. Reproducing the
overwrite — `0.019646 × 0.9975287 = 0.019597`, combining with the x/z offset to
`0.019608` against the frozen `0.019609223` — brought the divergence to 3.794e-15
and mushroom's mean silhouette IoU to `0.83112` against the frozen `0.83110`.

That is worth recording beyond this ticket: the evaluation frame silently
re-anchors a generated root, so a generator that positions its own root is
measured at the origin regardless. Any later emission path must not rely on root
placement to position a unit.

**The divergence `--check` is deliberately not a CI job.** It reads the 69 MB
Authored Reference, which is Git LFS content, so it belongs with the other
reference-dependent calibrations that run on hardware. The rasterizer's own
behaviour — buffer shape, byte stability, the worker-thread path, progressive
resolution, the reference cache, and discrimination on a displaced candidate — is
covered by ten package tests that need no reference asset and do run in CI.

Verification block: `npm test` 147 passing / 0 failing; Stone v2 contract PASS;
Patterned Appearance v2 contract PASS; eight-object certification
`PASS under versioned category-specific baselines (8/8)`;
`node scripts/check-decompiler-package.mjs` PASS (5 checks);
`git status --short` shows no modification to any red-line file.
