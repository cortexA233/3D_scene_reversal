# 07 — Operator Library seeded from the eight generators

Type: task
Status: ready-for-agent
Blocked by: 06

**What to build:** the reusable abstraction layer that decides whether the ninth object costs as much
as the first. Roughly ten Contract Operators carrying the algorithms currently locked inside the eight
hand-authored generators.

The eight generators are **read, not refactored**. Their Object-scoped Candidate Freezes bind the
shared generation kernel as part of the hash surface, so moving code into a shared operator would
change frozen candidate hashes and force re-certification of accepted evidence. The Operator Library
is therefore new code carrying the same algorithms. The resulting duplication is a bounded one-time
cost because the eight generators do not grow further.

- [ ] Around ten operators exist: profile lathe, shell profile offset, footprint extrusion, bounded
      support-plane polyhedron, axial layer family, repeated-form instancing, sweep along a
      Catmull–Rom curve, radial panel subdivision, axial gradient vertex colour, and band-limited
      value-noise mottling
- [ ] Every operator passes the Contract Operator checks: purity, determinism, declared parameter
      signature, declared scalar count, and asset-freedom
- [ ] No file participating in an Object-scoped Candidate Freeze hash surface is modified — not the
      eight generators, their recipes or definitions, nor the shared generation kernel they import
- [ ] All existing repository tests and every frozen contract check still pass unchanged
- [ ] Each seeded operator reproduces its source generator's geometric behaviour on a synthetic
      fixture, which is the evidence that the algorithm transferred correctly
- [ ] The library is versioned, and its manual documents each operator's semantics, parameters, and
      applicability conditions in terms a decider can act on
- [ ] Scalar counts are declared per operator so the complete-source audit can total them without
      inspecting operator bodies
