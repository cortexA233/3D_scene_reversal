# 02 — Measurement core copied into the package with drift checks

Type: task
Status: resolved
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

- [x] The package contains its own copy of the geometry and appearance metric functions, the triangle
      mesh analysis, the geometric diagnostics, and the generic perturbation helpers
- [x] Nothing under the repository's existing tool or source tree is modified, moved, or shimmed
- [x] All existing repository tests still pass unchanged
- [x] Both existing calibration contract checks still pass unchanged
- [x] A drift check asserts that every package copy of a file participating in a frozen contract is
      byte-identical to its frozen original, and fails loudly on any difference
- [x] The drift check runs in CI, not only on demand
- [x] Object-specific baseline evaluation stays in the repository and is not copied into the package
- [x] The copied modules carry equivalents of their existing tests inside the package

## Resolution

Four modules are vendored under
`packages/mesh-to-code/src/measurement/vendor/`, laid out so their own relative
imports resolve unchanged — `geometric-diagnostics.mjs` still reaches
`../ground-truth/mesh-analysis.mjs`, which is what makes byte-identity possible
at all:

| Vendored copy | sha256 | Bytes | Frozen |
| ------------- | ------ | ----: | ------ |
| `tools/evaluation/visual-metrics.mjs` | `141a064b405b4b17f74f85e14b8f0d5ce9c76b04ae36b555dd0bb01aff6d5c02` | 31,800 | both calibration contracts |
| `tools/evaluation/geometric-diagnostics.mjs` | `424b02c4a4a2795edec1bc00b5d6d72333031c73f03950020d47b76285e371c6` | 3,081 | no |
| `tools/evaluation/calibration-perturbations.mjs` | `fcc441b0a619e2d9daeebe14176acf617b882574440ff2d223e491b1e0cc3eab` | 15,151 | no |
| `tools/ground-truth/mesh-analysis.mjs` | `84e25210476e0ff27c5acaed45733fc622f6fdefd6c041c26414d981c19a6587` | 8,027 | no |

`visual-metrics.mjs` covers both required halves — `evaluateGeometryView` and
`evaluateAppearanceView` with their aggregators. Its copy's hash equals the
`sha256` recorded for it in `stone-v2-candidate-freeze.json`, so the package copy
is bound to the hash the certification was issued under, not merely to the
current working tree.

`node scripts/check-decompiler-measurement-drift.mjs` performs the guard. It
compares every vendored file two ways: against the current repository original,
and — where the original appears in a frozen candidate-freeze manifest — against
the `sha256` recorded there. It also fails if the package carries a copy of a
module that no longer exists in the repository, and if two frozen manifests
disagree about a hash. Its failure was demonstrated, not assumed: appending one
comment line to the vendored `mesh-analysis.mjs` produced

```
measurement drift: FAIL
  × tools/ground-truth/mesh-analysis.mjs: package copy has drifted
      repository 84e25210476e0ff27c5acaed45733fc622f6fdefd6c041c26414d981c19a6587 (8027 bytes)
      package    9d67a06a6fa4c2423a3ebf436b056d33b287a4396b83cd0765ece9f1dd3cea8c (8039 bytes)
```

with exit code 1 and a message naming where drift must originate and what not to
do about it. Byte-identity was restored and the check returned to PASS.

The check lives on the repository side because the dependency runs one way: it
must read repository originals, and the package may never reference the
repository. It runs in CI in the workflow's repository job, before the suite, and
through `node scripts/check-decompiler-package.mjs`, which now reports five
checks.

Object-specific baseline evaluation stays in the repository. Byte-identity means
`evaluateQualityGate`, `qualityBaselineDefinition`, `QUALITY_BASELINE_VERSION`,
and the four Stone-specific perturbation constructors are physically present in
the copies — the alternative would be editing a frozen file. They are not
re-exported: `src/measurement/index.mjs` publishes only the generic metric,
analysis, and diagnostic functions and names the withheld symbols in
`OBJECT_SPECIFIC_EXPORTS_WITHHELD`, and a test asserts none of them is reachable
from the package's surface and that no exported name mentions a Reconstruction
Unit. The package therefore never evaluates an object-specific baseline and owns
no per-object threshold.

The generic perturbation helpers are a separate entry point,
`src/measurement/perturbations.mjs`, exporting exactly
`createLocalReferenceClone`, `quantizeRadialResolution`,
`removeMeaningfulComponent`, and `removeMeaningfulComponentFamily`. They are split
out because they need a Three.js namespace and the kernel's measurement path must
stay free of one.

Test equivalents inside the package: `test/measurement-metrics.test.mjs` mirrors
the repository's `visual-metrics.test.mjs` cases against the copy — silhouette
IoU and symmetric edge distance, the one-pixel shift, the missing-silhouette
frame-diagonal penalty, depth MAE and P95 on the intersection, world-normal
angular error, the published Sharma CIEDE2000 pair, eroded-mask appearance
identity, a strong colour mismatch, and view aggregation — plus buffer-shape
rejection. `test/measurement-analysis.test.mjs` mirrors `mesh-analysis.test.mjs`
and adds coverage for the vendored diagnostics. `test/measurement-boundary.test.mjs`
guards the withheld surface and asserts no module outside the vendor tree
reimplements a vendored metric, which is the concrete form of the
one-ruler requirement.

Nothing under the repository's tool or source tree was modified, moved, or
shimmed. The repository's own test count is unchanged at 92; the rise to 138 is
exactly the package's 46.

Verification block: `npm test` 138 passing / 0 failing; Stone v2 contract
PASS (6 candidate files, 3 evidence files); Patterned Appearance v2 contract PASS;
eight-object certification `PASS under versioned category-specific baselines
(8/8)`; `node scripts/check-decompiler-package.mjs` PASS (5 checks);
`git status --short` shows no modification to any red-line file.

## Comments

`tools/evaluation/patterned-appearance-metrics.mjs` was deliberately not copied.
Its `HUMAN_ANCHORED_PATTERN_ROLES_V3` is one Reconstruction Unit's declared motif
palette, which is object-specific baseline material, and semantic-pattern
appearance belongs to ticket 10 rather than to this run's geometry path. Copying
it now would put an object-specific role table in the package for no ticket in
01–06 to use.

The two checkboxes "byte-identical to its frozen original" and "object-specific
baseline evaluation … is not copied into the package" cannot both hold literally,
because the frozen original contains `evaluateQualityGate`. The ticket's own
preamble makes byte-identity the load-bearing requirement, so the resolution
above satisfies the second at the level that matters — nothing object-specific is
reachable, and the repository keeps ownership of every per-object threshold — and
records the tension rather than quietly picking one side.
