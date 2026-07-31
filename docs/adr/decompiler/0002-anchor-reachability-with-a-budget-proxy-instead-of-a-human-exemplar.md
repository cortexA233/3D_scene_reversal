---
status: accepted
---

# Anchor reachability with a Budget Proxy instead of a human exemplar

Five of the eight Stage 2 Reconstruction Units needed a human-anchored baseline
([ADR-0032](../0032-use-a-human-anchored-semantic-baseline-for-approved-patterns.md),
[ADR-0036](../0036-use-a-human-anchored-compact-geometry-baseline-for-mushroom.md)) because
reference-side separability does not imply candidate reachability: Umbrella's
`patterned-appearance-baseline-v2` passed its reference-only Calibration Bracket and then failed all
seven metrics against a candidate that a human judged acceptable. The human exemplar was supplying
an estimate of how well any compact procedural program could score, which no automated pipeline can
obtain from a candidate it has not yet built. The Decompiler Program replaces that estimate with a Budget Proxy —
a reference-derived construct rebuilt at the unit's declared compactness budget, with automatically
clustered material roles substituting for source texture — so the reachability bound is computed
from the Authored Reference alone and can therefore be frozen before fitting, as
[ADR-0010](../0010-calibrate-quality-baselines-without-replacements.md) requires.

## Consequences

Metric eligibility is decided by the existing Calibration Bracket rule executed by script rather
than by a human: a metric that cannot separate declared mild perturbations from declared
destructive controls becomes diagnostic instead of being loosened. Human-anchored baselines remain
valid historical evidence for the Stage 2 units that used them and are not the default path for any
new unit. A Quality Baseline that no Budget Proxy at the declared budget can satisfy is a signal
that the Complexity Budget Formula or the Operator Library is inadequate, not grounds for relaxing
the threshold.
