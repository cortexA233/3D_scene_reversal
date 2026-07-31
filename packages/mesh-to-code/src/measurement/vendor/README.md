# Vendored measurement modules — do not edit

Every file under this directory is a **byte-identical copy** of a module in the
host repository. The directory layout mirrors the original paths so the copies'
own relative imports resolve unchanged.

## Why a copy and not an import

The fitting loop must score candidates with exactly the code and thresholds the
terminal acceptance gates use. Two implementations of one metric would make the
inner loop and the gates two different rulers, which is the failure this whole
arrangement exists to prevent.

A copy rather than a move, and not a re-export shim, because
`tools/evaluation/visual-metrics.mjs` is a frozen baseline entry in two
calibration contracts, and those contracts additionally assert their listed files
are git-clean. Replacing the original with a shim, or editing it at all, fails
both checks and invalidates already-frozen certifications. The same rule applies
to any file appearing in a frozen list.

Duplication is therefore the accepted cost, and it is bounded: the originals are
frozen, so they cannot change. Drift can only originate here.

## What keeps the duplication safe

`scripts/check-decompiler-measurement-drift.mjs` in the host repository asserts
that every file here is byte-identical to its original, and — where the original
participates in a frozen contract — that it also matches the `sha256` recorded in
that contract's frozen manifest. It runs in CI, not only on demand.

Editing a file here fails that check. If a metric genuinely needs to change, the
change belongs in a new module beside the vendored copy, never inside it.

## What is deliberately not re-exported

Some vendored files carry object-specific code alongside the generic algorithms —
`evaluateQualityGate`, `qualityBaselineDefinition`, and the Stone-specific
perturbation constructors. Byte-identity means those symbols are present in the
copies, but the package's measurement surface (`../index.mjs` and
`../perturbations.mjs`) does not re-export them, and a test asserts they stay
unreachable. Object-specific baseline evaluation stays in the host repository,
which owns the per-object thresholds and their versions.

## Contents

| Vendored path | Original | In a frozen contract |
| ------------- | -------- | -------------------- |
| `tools/evaluation/visual-metrics.mjs` | same | yes — both calibration contracts |
| `tools/evaluation/geometric-diagnostics.mjs` | same | no |
| `tools/evaluation/calibration-perturbations.mjs` | same | no |
| `tools/ground-truth/mesh-analysis.mjs` | same | no |
| `gt_designer/single-mesh-evaluation/evaluation-protocol.js` | same | no |

The evaluation protocol is vendored for the same one-ruler reason as the metrics.
It fixes the twelve-view set, the 512-pixel capture size, the 38-degree field of
view, the canonical maximum dimension, the framing margin, and the rule that
framing is derived from the Authored Reference bounds alone. A CPU-rasterized
score is comparable to a browser capture only while those are identical, so a
re-derivation would be a second ruler even if it started out numerically equal.
