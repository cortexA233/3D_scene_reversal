# 01 — Safely reconcile stable reconstruction infrastructure

**What to build:** Bring the experiment branch onto a verified, conflict-free foundation that retains the current full-island prototype while incorporating the stable production-generation, calibration, evaluation, deterministic-RNG, native-evidence, and static-audit machinery already accepted on the main line. The separate main worktree and any unrelated actor-owned work must remain untouched.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Add one non-interactive reconciliation acceptance command that initially exposes the experiment branch's missing or incompatible stable infrastructure and passes after reconciliation.
- [ ] Resolve the actual main-line and experiment heads at implementation time; do not rely on the handoff's historical commit IDs when repository state has advanced.
- [ ] Record the main worktree's branch, HEAD, and status before and after the work and prove they are unchanged.
- [ ] Preserve every experiment-only full-island artifact and keep the measured prototype runnable.
- [ ] Incorporate only committed, stable main-line infrastructure; do not absorb unrelated uncommitted files from another worktree or actor.
- [ ] Preserve the accepted Object Generator, versioned RNG, calibration, visual-metric, native-browser, candidate-freeze, production-build, and static-audit behavior needed by the Foundation spec.
- [ ] Resolve documentation and ADR numbering without overwriting either the main-line history or the Scene Parity Foundation decisions.
- [ ] Run the reconciled unit and retained acceptance suites plus the full-island prototype smoke check from the experiment worktree.
- [ ] Finish with a clean, reviewable experiment worktree whose branch remains `experiment/full-island-scene`.
