# 05 — Generic perturbation manifest and automatic Calibration Bracket

Type: task
Status: ready-for-agent
Blocked by: 04

**What to build:** automatic generation of a unit's acceptance baseline from the reference alone,
frozen before any candidate is fitted.

The existing perturbation helpers are half generic and half object-specific, and the manifests
themselves were written by hand per object. This ticket makes both generic, and makes metric
eligibility a computed verdict rather than a human call: a metric that cannot separate mild
perturbations from destructive controls becomes diagnostic instead of being loosened. That rule is
already written policy; here it becomes executable.

- [ ] The perturbation manifest is generated from the mesh alone: scale, pivot, and rotation ladders
      as mild controls; component deletion, family reduction, structural collapse, resolution
      quantization, appearance flattening, and palette corruption as destructive controls
- [ ] The bracket runs reference-only, with no candidate present
- [ ] Per-metric eligibility is computed: mild-pass plus destructive-fail makes a metric hard;
      inability to separate makes it diagnostic
- [ ] The frozen baseline combines computed eligibility with the Budget Proxy reachability bound from
      ticket 04
- [ ] The baseline is written before any fitting call can execute, enforced structurally rather than
      by convention
- [ ] No code path can loosen a threshold after fitting has begun
- [ ] A report compares the automatic verdicts against the eight units' existing frozen baseline
      verdicts and explains every divergence rather than tuning it away
- [ ] Frozen JSON report with a `--check` mode
