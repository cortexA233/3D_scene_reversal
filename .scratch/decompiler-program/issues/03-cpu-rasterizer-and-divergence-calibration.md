# 03 — CPU rasterizer, divergence tolerance, wall-clock budget

Type: task
Status: ready-for-agent
Blocked by: 02

**What to build:** a project-owned pure-JavaScript triangle rasterizer that produces the buffers the
copied metric functions already accept, plus the calibration evidence that proves it is a usable
stand-in for the browser.

This ticket closes the single largest risk in the whole effort. If the CPU rasterizer and the browser
disagree by more than the fitting loop's discrimination margin, then the inner loop is optimising an
unproven ruler and every downstream result is suspect. The choice of a CPU backend also rests on a
performance estimate, so measured wall-clock is a deliverable, not a nice-to-have.

- [ ] The rasterizer emits silhouette, depth, and normal buffers in the exact shape the copied metric
      functions accept, so no metric is reimplemented
- [ ] Progressive resolution is supported: fewer views at low resolution for coarse search, the full
      twelve-view capture protocol for final scoring
- [ ] Reference-side buffers are computed once and cached across fitting iterations
- [ ] Beam candidates rasterize in parallel using Node's built-in worker threads, with no added
      dependency
- [ ] Output is byte-stable across two runs on the same platform and across platforms
- [ ] An acceptance script rasterizes the eight accepted replacements and their references and
      compares every geometry metric against the existing browser-captured values
- [ ] The report freezes a per-metric divergence tolerance and states the discrimination margin that
      tolerance must stay below
- [ ] The report publishes measured wall-clock per fitting iteration and per unit against a declared
      budget
- [ ] The script follows the existing calibration pattern: a `--check` mode and a frozen JSON report
- [ ] Exceeding the declared wall-clock budget is reported as evidence for revisiting the backend, and
      does not weaken any gate
