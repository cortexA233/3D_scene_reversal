# 06 — End-to-end geometry reconstruction on a single-operator path

Type: task
Status: ready-for-agent
Blocked by: 05

**What to build:** the first real tracer bullet. Point the command at a generated single-component
lathe-able fixture and get back working, asset-free Three.js code with a Reconstruction Tier earned
from real geometry evidence.

Everything before this ticket produced infrastructure and frozen reports. This is the first ticket
whose output a person can open and look at. It deliberately uses one operator, one component, and
geometry only, so that the complete path is exercised without the search breadth, decomposition, or
appearance machinery that later tickets add.

- [ ] One profile-lathe Contract Operator exists with a declared parameter signature and scalar count,
      pure and deterministic
- [ ] Running on the fixture emits a recipe and a generator that build the replacement without loading
      any asset
- [ ] Fitting runs L0 coarse search then L1 refinement, scored with the copied metric functions
      against the automatically frozen baseline from ticket 05
- [ ] The emitted code executes and produces identical geometry across two runs
- [ ] The contract audit runs and covers asset-freedom, determinism, executability, the global ceiling,
      and the complete-source scalar count
- [ ] A Reconstruction Tier is assigned from geometry evidence, with appearance explicitly recorded as
      not yet evaluated rather than silently passing
- [ ] The inline output mode emits a self-contained single file whose geometry matches the
      library-importing output
- [ ] A mock decider variant that returns a contract-violating operator causes emission to be withheld
      with a classified diagnosis, and this path is covered by a test
- [ ] Tests assert only externally observable output, never the chosen operator or fitted parameter
      values
