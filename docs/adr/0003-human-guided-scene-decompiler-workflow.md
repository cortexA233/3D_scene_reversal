---
status: accepted
---

# Validate a human-guided scene decompiler workflow

The Single Mesh Lab validates a repeatable, human-guided and measurement-assisted Scene Decompiler Workflow rather than an autonomous mesh-to-program synthesis system. Development tooling may automate geometric measurements, reference-pass capture, shape classification suggestions, and continuous parameter fitting, but a human may choose the procedural representation and author the generator. Automatically inventing generators or recovering complete authored operation trees is outside the experiment's success criteria because it would require a separate synthesis architecture and a substantially larger validation corpus; generated programs remain a possible future research direction.

Amended for the automated path only by [DECOMP-0001](./decompiler/0001-invent-structure-automatically-inside-a-bounded-operator-library.md), which authorizes bounded automatic structure invention for the Autonomous Object Decompiler. This ADR remains accepted and continues to govern the frozen Stage 1, Stage 1.5, and Stage 2 evidence, whose eight Object Generators were human-authored under it.
