# 15 - Record cross-browser native GPU evidence

**What to build:** Run the native GPU scene gates on every browser available on the host and record the rest as explicit blockers with reproducible commands.

**Blocked by:** 14 - Meet the Production Runtime budgets.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that records, per browser, either two stable full-protocol runs or an explicit unavailable status.
- [ ] Record browser, OS, GPU and WebGL renderer, acceleration state, colour configuration, and Three.js revision for every run.
- [ ] Reject software rendering for a native GPU gate.
- [ ] Do not mark an unexecuted gate as passed under any circumstances.
- [ ] Save the exact command and expected evidence for each gate that cannot run here.
- [ ] Keep the report schema compatible with results added later on other hardware.
