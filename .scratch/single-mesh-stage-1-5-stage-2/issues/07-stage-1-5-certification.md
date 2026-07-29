# 07 — Stage 1.5 certification

Type: task
Status: wontfix
Blocked by: 06

Package every Stage 1.5 result into one reproducible certification operation and authorize Stage 2 only when all kill gates are green.

Acceptance:

- [ ] Historical Stage 1 remains `2/4 FAIL`.
- [ ] Corrected scalar evidence passes for every retained Stage 1 object.
- [ ] Stone passes full v1 in Chrome, Firefox, and Safari.
- [ ] Umbrella passes geometry plus patterned v2 in all three browsers.
- [ ] Stone Path and Vase have native Firefox/Safari evidence.
- [ ] Bamboo and Mushroom baselines/budgets are frozen before fitting.
- [ ] No prohibited dependency or representation is present.
- [ ] Stage 2 remains blocked on any failure.

## Comments

The reproducible negative certification is retained as
`gt_designer/single-mesh-evaluation/reports/stage-1-5-certification-v1.json`.
It preserves historical Stage 1, records the passing scalar and native-browser
qualifier gates, records Stone v2's frozen failures, denies Stage 2
authorization, and marks all later work not run.
