# 04 — Reevaluate the frozen Stone candidate

Type: task
Status: ready-for-agent
Blocked by: 03

Evaluate the commit- and hash-frozen 24-direction candidate against the frozen
Stone Geometry Baseline v2 without refitting or changing any nonvisual budget.

Acceptance:

- [ ] Candidate content hashes match Ticket 01 before and after evaluation.
- [ ] Chrome passes the complete frozen v2 geometry and appearance protocol.
- [ ] Native hardware Firefox and Safari each pass two stable twelve-view,
      seven-pass capture runs with the required GPU and color metadata.
- [ ] Complete-source scalar, recipe, gzip, triangle, draw, memory, generation,
      determinism, and Reference Independence gates pass unchanged.
- [ ] A passing report reopens Stage 1.5 at Patterned Appearance Baseline v2.
- [ ] Any failure records a new negative boundary result and does not relax v2.

## Comments

This ticket evaluates an already exposed candidate under an independently
derived baseline; it is not permission to fit the candidate again.
