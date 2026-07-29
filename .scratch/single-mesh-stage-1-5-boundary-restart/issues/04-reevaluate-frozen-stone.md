# 04 — Reevaluate the frozen Stone candidate

Type: task
Status: resolved
Outcome: PASS
Blocked by: 03

Evaluate the commit- and hash-frozen 24-direction candidate against the frozen
Stone Geometry Baseline v2 without refitting or changing any nonvisual budget.

Acceptance:

- [x] Candidate content hashes match Ticket 01 before and after evaluation.
- [x] Chrome passes frozen v2 geometry and the ADR-0027 uniform-material v1
      appearance protocol; lit-RGB remains diagnostic.
- [x] Native hardware Firefox and Safari each pass two stable twelve-view,
      seven-pass capture runs with the required GPU and color metadata.
- [x] Complete-source scalar, recipe, gzip, triangle, draw, memory, generation,
      determinism, and Reference Independence gates pass unchanged.
- [x] A passing report reopens Stage 1.5 at Patterned Appearance Baseline v2.
- [x] Any failure records a new negative boundary result and does not relax v2.

## Comments

This ticket evaluates an already exposed candidate under an independently
derived baseline; it is not permission to fit the candidate again.

## Answer

The hash-frozen candidate passes all eight Stone Geometry Baseline v2 metrics
in Chrome. Its independent uniform appearance is exact across all twelve views
(`DeltaE = 0`, `SSIM = 1`, zero palette error, negligible roughness error, and
zero metalness error); the lit-RGB difference remains an explicit
geometry-conditioned diagnostic under ADR-0027.

Firefox and Safari each completed two checksum-stable, headful, vendor-driver
runs of 12 views × 7 passes. Firefox reported hardware WebGL 2 from Apple and
Safari reported hardware WebGL 2 on Apple GPU; both rejected software-renderer
patterns and passed the versioned geometry/appearance gates.

Nonvisual evidence passes at 32/32 scalars, 80/320 triangles, one draw,
1,488/24,576 geometry bytes, and 0.2/5 ms warm p95. Candidate hashes match
before and after every phase. The boundary-restart certification is PASS,
Stage 1.5 resumes at Patterned Appearance Baseline v2, and Stage 2 remains
denied pending the remaining Stage 1.5 gates.
