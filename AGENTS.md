## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with domain context at `CONTEXT.md` and ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## Git workflow

- For change or build tasks, once the requested work is complete and the relevant tests, linters, and other proportionate checks pass, create a cohesive git commit without waiting for a separate request from the user.
- Before committing, review `git status` and the staged diff. Stage and commit only files that belong to the current task; preserve unrelated, pre-existing, or user-owned changes in the worktree.
- Follow the repository's established commit-message convention when one exists. Otherwise use a concise imperative subject that describes the completed change.
- Do not commit incomplete work, known failing checks, secrets, transient artifacts, or changes outside the task's authorized scope. If a clean scoped commit cannot be made safely, report the blocker instead.
- An explicit user instruction not to commit overrides this default. Never push, rewrite history, or create a pull request unless the user explicitly requests it.
