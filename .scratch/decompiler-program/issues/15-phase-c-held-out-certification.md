# 15 — Phase C certification on the held-out corpus

Type: task
Status: ready-for-agent
Blocked by: 14

**What to build:** the only evidence in the whole effort that speaks to generalisation, and the exit
that authorises the phase switch to a standalone repository.

The success-rate number here will look modest, because the Operator Library cold-starts: early units
trigger authoring almost every time and the library needs tens of objects to converge. That is expected
and must be reported as cold-start behaviour rather than as pipeline failure.

- [ ] The accepted-count threshold is frozen before the corpus is run
- [ ] Zero contract violations occur across the entire corpus
- [ ] The frozen accepted-count threshold is met
- [ ] Every non-accepted unit carries a classified diagnosis, and the diagnosis distribution is reported
- [ ] Operator Library growth during the run is recorded, each admission traced to its unlocking failure
- [ ] The report states the success rate as a descriptive statistic and confirms that no acceptance
      threshold was adjusted from it
- [ ] The report distinguishes cold-start library behaviour from steady-state expectations
- [ ] The report records that the main line may now phase-switch: the package subdirectory is extracted
      with its history and the standalone repository becomes the main line
