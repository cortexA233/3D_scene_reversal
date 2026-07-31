# 08 — Beam search, termination, classified failure

Type: task
Status: ready-for-agent
Blocked by: 07

**What to build:** the search that turns a library of operators into a reconstruction, and the
guarantee that it always stops with something useful.

Structural diversity is preferred to re-iteration on one structure, because agent scaffolding is known
to raise executable rate without raising conditioned shape quality — running the same wrong structure
more times does not help. Termination is not an afterthought: a run that cannot reach threshold must
end with a classified diagnosis, which is also the growth signal for the Operator Library.

- [ ] Each round proposes K mutually dissimilar structure candidates; a similarity guard rejects a
      round whose candidates are trivial variations of each other
- [ ] Candidates are fitted in parallel and only the best advances to the next round
- [ ] K, the round count, the per-candidate iteration cap, and the L2 pass cap are calibrated on the
      regression corpus and frozen
- [ ] Hard round and wall-clock budgets terminate the run
- [ ] Early stop triggers when the best score improves by less than a declared epsilon for a declared
      number of consecutive rounds
- [ ] Failure output is classified into missing operator, insufficient budget, appearance statistics
      matched no operator, or decomposition failure
- [ ] A run that exhausts its budget still emits its best candidate at the appropriate tier rather
      than emitting nothing
- [ ] No search path can exceed the L2 pass cap, and the cap is observable in the evidence document
