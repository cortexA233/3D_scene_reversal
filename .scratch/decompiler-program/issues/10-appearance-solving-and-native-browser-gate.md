# 10 — Appearance solving and the native cross-browser gate

Type: task
Status: ready-for-agent
Blocked by: 07

**What to build:** appearance, and the terminal gate that judges it.

Appearance cannot be fitted in the cheap tiers, because a procedural pattern program executes as a
shader and the CPU rasterizer cannot run it. So appearance is solved analytically from reference-side
statistics in one shot, and browser passes are spent as a scarce resource. This asymmetry is a hard
constraint, not a simplification.

- [ ] Reference surface albedo is clustered into material roles with centroid and coverage;
      development-only texture sampling is permitted but every retained value is
      resolution-independent
- [ ] Spatial statistics are derived: autocorrelation length, spectral bandwidth, anisotropy, and UV
      periodicity
- [ ] Those statistics select and parameterize an appearance operator from a bounded set — flat role,
      axial gradient, value-noise mottling, radial panels, motif scatter
- [ ] No iterative search loop exists on the appearance axis; appearance is computed, not tuned
- [ ] The native cross-browser gate participates in tier assignment within the L2 pass cap
- [ ] The multi-scale material consistency gate runs and rejects sampled appearance disguised as shader
      constants
- [ ] An input carrying no materials degrades to flat roles and is marked, rather than failing
- [ ] A fixture whose reference statistics match no available operator produces the corresponding
      classified failure rather than a silent flat fallback
