---
status: accepted
---

# Separate contract hard gates from marked quality tiers

An Autonomous Object Decompiler must always return something usable, but the code-only asset
boundary cannot be a matter of degree. The Decompiler Program therefore splits acceptance into two kinds of
constraint. Contract constraints hard-block output: non-zero asset dependency, non-determinism,
unexecutable code, exceeding the global complexity ceiling, and multi-scale material inconsistency
that indicates sampled appearance disguised as shader constants. Quality constraints — every
visual-fidelity measurement and the per-unit compactness budget — never block output; they set the
Reconstruction Tier (`accepted`, `below-gate`, `coarse`) and are reported per axis.

## Consequences

The tier is enforced mechanically, not by convention: the Reference-layout Delivery builder admits
only `accepted` units, so
[ADR-0033](../0033-require-all-eight-lab-objects-for-formal-exit.md) is unaffected by the existence of
lower tiers. Tier and evidence stay in development-only artifacts and are read at build time,
because [ADR-0013](../0013-retain-generators-and-gates-discard-analysis-artifacts.md) prohibits
measurement artifacts from the Code-only Production Runtime; a Procedural Replacement therefore
never exports its own certification. A `below-gate` result is retained as a versioned negative
experiment on the same footing as the Stone loft and the Umbrella patterned-v2 result, and its
classified diagnosis is the intended growth signal for the Operator Library.
