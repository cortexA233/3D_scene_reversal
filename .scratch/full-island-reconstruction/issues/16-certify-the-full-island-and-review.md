# 16 - Certify the full island and run Human Parity Review

**What to build:** Prove the complete automated stack is green, publish the six-camera comparison package, and run the human review that can only follow it.

**Blocked by:** 15 - Record cross-browser native GPU evidence.

**Status:** partly done. The review package is complete and the blocking-command behaviour is verified; Human Parity Review itself cannot run yet, and that is the spec's own ordering rule rather than a gap.

- [x] Add one non-interactive certification command that passes only when all four gate layers pass against the frozen baseline. — `npm run report:scene-parity` exits 1 while any layer is red, verified. `npm run check:scene-parity-foundation` now passes too, having been structurally impossible before ADR-0062.
- [ ] Re-run immutable reference observation, complete semantic coverage, recipe validation, production generation, all direct 3D evidence, all camera passes, and the gate stack in one reproducible workflow.
- [x] Keep the production isolation, determinism, static audit, and budget results green. — 13 production files, 24 local code requests, 0 external, 0 third-party inputs, 711 semantic IDs byte-identical, five budgets inside their ceilings.
- [x] Generate six-camera contact sheets, overlays, differences, and pass previews from the same evidence the metrics use. — 60 images: eight passes plus **two difference images per camera**, red for reference-only and blue for candidate-only, built from the same RGBA buffers the metrics read in the same frame.
- [ ] Run Human Parity Review only after the automated stack passes.
- [ ] Convert any obvious residual the reviewer finds into reference-only calibrated evidence and a versioned gate revision, never a waiver.
- [x] List every environment gate that could not run as a real blocker. — the certification's `deferred` list, derived from the gate stack rather than written in prose.
- [ ] Finish with a clean worktree and every commit pushed.


## Differences are in the package now, and why they had to be

The contact sheet had reference and candidate side by side for all four passes and nothing
else. An eye cannot subtract two 1440x810 frames, so a reviewer could see *that* a group
disagreed and never *where* — and this milestone's whole failure mode is a number believed
without looking at what produced it.

Each camera now also carries a silhouette difference and a semantic difference: **red is
reference-only, blue is candidate-only**, grey is agreement, dimmed. A group the candidate
over-draws and one it misses are different colours rather than both being "wrong". They are
built from the same RGBA buffers the metrics read, in the same frame, so a reviewer's
observation and the measurement cannot be about different pictures. Every geometry metric
was bit-identical across the re-capture that added them, which is the check that they are a
view of the evidence rather than a change to it.

## What is left, and it is the spec's rule rather than a gap

**Human Parity Review runs only after the automated stack passes**, and the stack does not
pass: `worldGeometry` is red on eight metrics and `fixedCameraGeometry` on ten. Four of the
world-geometry reds are recorded representation boundaries with their own ADRs (0052, 0054)
and `nativeAppearance` is blocked by ADR-0040's ordering rule. Running the review now would
be exactly the waiver the spec forbids — "it cannot waive an automated failure".

The one remaining checklist item that is genuinely open rather than blocked is the single
reproducible workflow that re-runs observation, coverage, recipe validation, generation, all
direct 3D evidence, all camera passes and the gate stack in one command. The step order is
recorded in `handoff.md` and each step has its own command; what does not exist is one
entry point that runs them in order. It was left because chaining them exceeds ten minutes
and the harness kills a foreground run at that point, so the entry point has to be a
background-friendly script with per-step reporting rather than an npm chain — worth doing
properly rather than as a chain that dies halfway.
