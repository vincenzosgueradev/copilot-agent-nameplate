---
name: "custom-ampush"
description: "Pre-push readiness check: git state, tsc + vite build, tests, spec task completeness. Read-only; reports READY or NOT READY. Run manually before pushing."
user-invocable: true
disable-model-invocation: false
---

# Am I ready to push?

Read-only: never run `git add`, `commit`, `push`, `amend`, `reset`.

## Step 1 - Git state
Run `git status` and `git log --oneline @{u}..HEAD` (if no upstream, say: "No upstream. Use `git push -u origin <branch>`").
If the tree is clean and nothing is ahead, print "Working tree clean. Nothing to commit or push." and stop.

## Step 2 - Blockers (run all, collect all)
1. **Build**: run `npm run build` (tsc + vite). Any `error TS` or build failure is a blocker; list the errors.
2. **Extra checks**: run every check the tool's `CLAUDE.md` lists under `## Extra checks` for a push (for example a smoke script). A missing script named there is a blocker; a failing one is a blocker. If the section is absent, skip.
3. **Tests**: run `npm test` (fast suite). Any failure is a blocker; list the failing test names and the first assertion message. (`npm run test:full` is required before a *release*, not before every push.)
4. **Specs**: for each `specs/*/tasks.md`, count `- [ ]` vs `- [x]`. If more than 20% are unchecked, it is a blocker (list the spec and the unchecked tasks). If none exist, note it and skip.
5. **Hygiene (warning only)**: staged or untracked files that look wrong: `node_modules/`, `dist/`, `.env*`, `*.zip`, `*.log`, secrets or tokens in the diff.
6. **Docs drift (warning only)**: if `src/**` changed but neither `README.md` nor `specs/**` did, mention it.

## Step 3 - Output
- Blockers: print `NOT READY TO PUSH` with a checklist; stop.
- Otherwise print `READY TO PUSH`: files grouped as Modified/Added/Deleted, commits ahead of origin, warnings.
  If there are uncommitted changes, tell the user to run `/custom-commit` first.
  Then show: `git push` (or `git push -u origin <branch>`). The user runs it, never you.
