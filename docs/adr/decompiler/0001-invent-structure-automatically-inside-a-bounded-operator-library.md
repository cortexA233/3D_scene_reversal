---
status: accepted
---

# Invent structure automatically inside a bounded Operator Library

The Decompiler Program introduces an Autonomous Object Decompiler, which requires automatic invention of the
generator program that [ADR-0003](../0003-human-guided-scene-decompiler-workflow.md) placed outside
the Single Mesh Lab's success criteria. This ADR supersedes ADR-0003 only for the automated path:
structure invention is confined to selecting and composing Contract Operators from the project-owned
Operator Library, continuous parameters remain owned by deterministic numerical fitting, and
authoring a new operator unlocks only after a library-only beam search has produced a measured
geometry-gate failure for that Reconstruction Unit. ADR-0003 continues to describe the frozen
Stage 1, Stage 1.5, and Stage 2 evidence, which was produced by the human-guided Scene Decompiler
Workflow and is never restated as an autonomous result.

## Considered options

Unbounded free-form generation of Three.js source was rejected: `mesh-to-program-technical-routes.md`
records that the LLM code route reliably reaches executability but not the geometric precision or
structural correctness required to reconstruct a given mesh, and 3DCodeBench measured that agent
scaffolding raises executable rate without raising conditioned shape quality. Restricting the
automation to parameter inversion over human-authored generators was also rejected, because it
cannot satisfy the requirement that a previously unseen object need no hand-written generator.

## Consequences

Any code authored under the escape hatch must satisfy the Contract Operator definition — pure,
deterministic, declared parameter signature, asset-free, scalar-counted — so that the existing
complete-source scalar audit required by
[ADR-0023](../0023-audit-object-specific-scalars-across-complete-production-source.md) still applies
and the operator can be admitted to the Operator Library for later reuse. One-off object-specific
generator source is not a permitted output of the automated path.
