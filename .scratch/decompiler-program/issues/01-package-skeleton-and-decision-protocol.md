# 01 — Package skeleton, suspend-resume decision protocol, mock decider

Type: task
Status: ready-for-agent
Blocked by: None — can start immediately

**What to build:** running the decompiler on a trivial generated fixture walks one Decision Point end
to end and emits a complete artifact directory. Geometry is stubbed on purpose — this ticket proves
the protocol and the harness-neutral shape, so that every later ticket only has to fill in real
geometry behind an interface that already works.

The walking skeleton: the command suspends at a Decision Point with a numeric evidence document and a
declared response schema, an external decider answers by writing a file, and resuming produces the
same result as an uninterrupted run.

- [ ] Running the pipeline with the mock decider on a code-generated fixture emits an artifact
      directory containing a recipe, a generator, a Structure Manifest, and a development-only
      evidence document carrying a Reconstruction Tier
- [ ] The pending-decision document contains the mechanical evidence in numeric form and the allowed
      response schema; imagery paths are an optional field
- [ ] Suspension exits with a code distinguishable from success and from error
- [ ] Resuming from a written decision reaches the same artifact as an uninterrupted mock run
- [ ] A schema-invalid decision is rejected without advancing the loop
- [ ] The Structure Manifest is hash-bound and the artifact reproduces bit-for-bit from it
- [ ] The mock decider ships as part of the package, not as test-only code
- [ ] CI runs the full pipeline with the mock decider in an environment with no agent harness
      installed
- [ ] CI packs the package, installs it into a clean directory, and runs it there
- [ ] `three` is a peer dependency and no dependency requires native compilation
- [ ] Test fixtures are generated from code; the package contains no binary asset
- [ ] The package is NOT a workspace of this repository: it has its own manifest and its own lockfile
      and is installed independently. The repository's dependency manifest and lockfile are frozen
      candidate files in two calibration contracts, so touching either fails those checks
- [ ] Nothing in the existing repository tree is modified, and both calibration contract checks plus the
      eight-object certification check still pass unchanged
