---
status: accepted
---

# Treat Stone's fitter drift as a reproducibility failure

ADR-0025 suspected that the production Stone artifact assigned the wrong
normals to ten support distances. After the fitter was changed to consume the
production direction definition, a full deterministic refit regenerated all
24 existing recipe distances exactly, and the unchanged v1 visual metrics were
reproduced. The production recipe/generator contract was therefore valid; only
the development fitter had drifted, making this a Fitting Reproducibility
Failure rather than a Representation Contract Failure.

The fitter repair and regression check remain required, but the historical
Stone negative result still counts as the second representation failure and
ADR-0024 activates. Stone enters candidate quarantine without another refit,
direction change, budget change, or v1 threshold change.
