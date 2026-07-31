# 02 — Measurement core copied into the package with drift checks

Type: task
Status: ready-for-agent
Blocked by: 01

**What to build:** the package owns its own copy of the generic measurement and mesh-analysis
algorithms, so the fitting loop scores candidates with exactly the code and thresholds the terminal
gates use. Without this, the inner loop and the acceptance gates are two different rulers.

This is a copy, not a move. The generic visual-metric module is a frozen baseline entry in two
calibration contracts, and those contracts also assert the files are git-clean, so replacing it with a
re-export shim would fail both checks. The same rule applies to any file appearing in a frozen list.
Duplication is the accepted cost, and a byte-identity drift check is what makes the duplication safe:
the repository copy can never change because it is frozen, so drift can only originate in the package
copy, and the check catches it before it lands.

- [ ] The package contains its own copy of the geometry and appearance metric functions, the triangle
      mesh analysis, the geometric diagnostics, and the generic perturbation helpers
- [ ] Nothing under the repository's existing tool or source tree is modified, moved, or shimmed
- [ ] All existing repository tests still pass unchanged
- [ ] Both existing calibration contract checks still pass unchanged
- [ ] A drift check asserts that every package copy of a file participating in a frozen contract is
      byte-identical to its frozen original, and fails loudly on any difference
- [ ] The drift check runs in CI, not only on demand
- [ ] Object-specific baseline evaluation stays in the repository and is not copied into the package
- [ ] The copied modules carry equivalents of their existing tests inside the package
