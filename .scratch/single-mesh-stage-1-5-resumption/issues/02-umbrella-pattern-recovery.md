# 02 — Recover Umbrella bounded semantic appearance

Type: task
Status: resolved
Outcome: FAIL
Blocked by: 01

Freeze the accepted Umbrella geometry and then replace appearance only with a
Bounded Semantic Pattern Program.

Acceptance:

- [x] A pre-change geometry/semantic freeze proves positions, indices,
      Reconstruction Frame, hierarchy, semantic IDs, and two batches unchanged.
- [x] Production contains no texture, pixel, sampled grid, lookup, vectorized
      bitmap, or resolution-scaled appearance payload.
- [ ] Patterned Appearance Baseline v2 passes without changing its contract.
- [x] Complete-source Object-specific Scalars are at most 96.
- [x] Existing recipe, gzip, triangle, draw, memory, generation, determinism,
      and Reference Independence gates pass unchanged.
- [ ] Chrome and two stable native hardware-GPU runs in Firefox and Safari pass
      all twelve views and seven passes under explicit baseline versions.
- [x] Any failure stops Tickets 03–04 and records a new negative boundary.

## Comments

No scalar headroom is inferred from the historical recipe-only `86/96` result.

## Answer

The geometry-frozen Bounded Semantic Pattern Program used analytic layered
flowers, oriented leaves, branches, and panel borders in semantic canopy
coordinates. The complete Chrome protocol retained the v1 geometry pass and
the independent golden freeze before and after evaluation: two render batches
and 5,336 triangles, with unchanged positions, indices, attributes,
Reconstruction Frame, hierarchy, and semantic IDs.

Every nonvisual check passed. The candidate uses 83/96 complete-source
Object-specific Scalars, generates in 1.30 ms p95, stays within the unchanged
recipe, gzip, triangle, draw, and memory ceilings, is deterministic, renders in
the isolated offline audit, and contains no prohibited sampled appearance.

The frozen Patterned Appearance Baseline v2 failed all seven hard metrics:
mean DeltaE `10.1431 > 6.6966`, P90 DeltaE `56.9890 > 30.8300`, mean SSIM
`0.4189 < 0.7287`, worst-view SSIM `0.2800 < 0.5870`, and flower/leaf/branch
Semantic Pattern Recall `0.0157/0.0443/0.0100` below
`0.0451/0.1615/0.5905`. Candidate evidence did not change the baseline.

Because the normative Chrome gate failed, native Firefox and Safari candidate
runs were not started. Tickets 03 and 04 stop under this ticket's kill
condition; Stage 2 remains unauthorized. The full reports are
`gt_designer/single-mesh-evaluation/reports/umbrella-acceptance-v3.json` and
`gt_designer/single-mesh-runtime-audit/reports/umbrella-nonvisual-v3.json`.
