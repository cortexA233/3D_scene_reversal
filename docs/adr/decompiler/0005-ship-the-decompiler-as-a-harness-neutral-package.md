---
status: accepted
---

# Ship the decompiler as a harness-neutral package

The Autonomous Object Decompiler must run under more than one agent harness, so its capabilities
live in a standalone Node package (`packages/mesh-to-code`, `bin: mesh-reverse`) and its agent-facing
contract lives in one authoritative `SKILL.md` plus JSON schemas. Harness manifests
(`.claude-plugin/`, `.codex-plugin/`) are thin parallel distribution adapters over that single
source; deleting all of them must leave the package fully usable. Dependencies run one way only —
`3d_pcg_reversal` depends on the package, never the reverse — so generic measurement algorithms move
into the package while object-specific baselines such as `evaluateQualityGate(objectId, …)` stay in
this repository.

## Considered options

Publishing the plugin from this repository was rejected outright: plugin installation is
repository-scoped, and this working tree is 95 MB of which 69 MB is `island-village.glb` and 19 MB is
evaluation reports — both categories that the code-only asset boundary and
[ADR-0013](../0013-retain-generators-and-gates-discard-analysis-artifacts.md) forbid from being
distributed. Splitting the package into its own repository immediately was also rejected, because
every kernel change must be validated against the regression corpus and the held-out corpus, which
live here.

## Consequences

Neutrality is enforced by three checks rather than by intent: `SKILL.md` may not name
harness-specific tools or mechanisms, every Decision Point must publish numeric evidence with
imagery strictly optional so a text-only agent can still answer, and CI must run the full pipeline
with a mock decider in an environment with no agent harness installed. The Decision Point protocol is
file-based suspend-and-resume because running a command and reading or writing a file are the only
capabilities common to every harness. `three` is a peer dependency and no dependency may require
native compilation. The main line phase-switches at the Phase C exit: development happens here
until then, after which `git filter-repo` extracts the subdirectory with its history and the
standalone repository becomes the main line.
