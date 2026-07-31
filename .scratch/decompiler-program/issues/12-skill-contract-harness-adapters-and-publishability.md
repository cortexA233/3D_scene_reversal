# 12 — Skill contract, decision schemas, harness adapters, publishability

Type: task
Status: ready-for-agent
Blocked by: 08, 09, 10, 11

**What to build:** the agent-facing contract and the proof that it is not tied to one agent harness.

By this point all four Decision Points exist, so their schemas can be published against real evidence
shapes rather than guessed. The load-bearing property is that capability lives in the command and
contract lives in documentation — so deleting every harness adapter must leave a fully working tool.

- [ ] One authoritative skill document describes the workflow and the four Decision Points, naming no
      harness-specific tool, mechanism, or command syntax
- [ ] Published JSON schemas exist for all four Decision Points, with numeric evidence required and
      imagery fields optional, so a text-only decider can answer every one
- [ ] A text-only decider completes a full run in a test, proving the imagery-optional claim
- [ ] Claude Code and Codex manifests exist as thin adapters over the same single skill directory
- [ ] Deleting every adapter leaves the package fully usable, proven by the no-harness CI job
- [ ] A package-content audit rejects any binary asset, image, or report from the published tarball
- [ ] The operator manual and worked examples drawn from the eight regression units ship with the skill
- [ ] Manifest version tracks package version, and CI fails if they diverge
