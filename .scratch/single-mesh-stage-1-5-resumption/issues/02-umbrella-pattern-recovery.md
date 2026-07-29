# 02 — Recover Umbrella bounded semantic appearance

Type: task
Status: ready-for-agent
Blocked by: 01

Freeze the accepted Umbrella geometry and then replace appearance only with a
Bounded Semantic Pattern Program.

Acceptance:

- [ ] A pre-change geometry/semantic freeze proves positions, indices,
      Reconstruction Frame, hierarchy, semantic IDs, and two batches unchanged.
- [ ] Production contains no texture, pixel, sampled grid, lookup, vectorized
      bitmap, or resolution-scaled appearance payload.
- [ ] Patterned Appearance Baseline v2 passes without changing its contract.
- [ ] Complete-source Object-specific Scalars are at most 96.
- [ ] Existing recipe, gzip, triangle, draw, memory, generation, determinism,
      and Reference Independence gates pass unchanged.
- [ ] Chrome and two stable native hardware-GPU runs in Firefox and Safari pass
      all twelve views and seven passes under explicit baseline versions.
- [ ] Any failure stops Tickets 03–04 and records a new negative boundary.

## Comments

No scalar headroom is inferred from the historical recipe-only `86/96` result.
