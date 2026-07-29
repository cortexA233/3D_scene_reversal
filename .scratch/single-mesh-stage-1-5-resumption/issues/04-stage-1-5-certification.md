# 04 — Certify the resumed Stage 1.5 boundary

Type: task
Status: wontfix
Blocked by: 03

Package the complete versioned evidence into one reproducible certification and
authorize Stage 2 only when every kill gate is green.

Acceptance:

- [ ] Historical Stage 1 remains `2/4 FAIL` under v1.
- [ ] Stone Path, Stone, and Vase retain their qualified scalar, visual,
      nonvisual, and native-GPU evidence.
- [ ] Umbrella passes unchanged geometry plus patterned appearance v2 in
      Chrome, Firefox, and Safari and every unchanged nonvisual boundary.
- [ ] Bamboo Shoot and Mushroom baselines and ADR-0020 budgets are frozen
      before candidate fitting.
- [ ] No prohibited dependency or production representation is present.
- [ ] A single command reproduces the decision and fails on any red check.
- [ ] A PASS authorizes a new narrow Stage 2 effort; a FAIL stops without
      changing any frozen baseline.

## Comments

The result is a Stage 1.5 authorization decision, never a retroactive Stage 1
four-of-four claim.

Ticket 02 failed before Ticket 03 could start, so the sequential Stage 1.5
effort stopped without packaging a false complete certification. The blocking
decision is recorded by ADR-0029 and the Umbrella v3 acceptance report; Stage 2
is not authorized.
