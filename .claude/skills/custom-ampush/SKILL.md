---
name: "custom-ampush"
description: "Pre-push readiness check for Agent Rename Manager: git state, tsc + vite build, smoke test, spec task completeness. Read-only; reports READY or NOT READY. Run manually before pushing."
user-invocable: true
disable-model-invocation: false
---

# Am I ready to push?

Read-only: never run `git add`, `commit`, `push`, `amend`, `reset`.

## Step 1 — Git state
Run `git status` and `git log --oneline @{u}..HEAD` (if no upstream, say: "No upstream. Use `git push -u origin <branch>`").
If the tree is clean and nothing is ahead → print "Working tree clean. Nothing to commit or push." and stop.

## Step 2 — Blockers (run all, collect all)
1. **Build**: from `agent-nameplate/`, run `npm run build` (tsc + vite + headless build). Any `error TS` / build failure → blocker, list errors.
2. **Smoke**: from `agent-nameplate/`, run `npm run smoke`. Failure → blocker.
2b. **Tests**: from `agent-nameplate/`, run `npm test` (fast suite, ≈40 s). Any failure → blocker, list the failing test names and the first assertion message. (The exhaustive `npm run test:full` and `npm run test:mutation` are required before a *release*, not before every push.)
3. **Specs**: for each `specs/*/tasks.md`, count `- [ ]` vs `- [x]`. If > 20% unchecked → blocker (list the spec and unchecked tasks). If none exist, note it and skip.
4. **Hygiene (warning only)**: staged/untracked files that look wrong — `node_modules/`, `agent-nameplate/dist/`, `.env*`, `*.zip`, `*.log`, secrets/tokens in the diff.
5. **Docs drift (warning only)**: if `agent-nameplate/src/**` changed but neither `agent-nameplate/README.md` nor `specs/**` did, mention it.

## Step 3 — Output
- Blockers → print `🔴 NOT READY TO PUSH` with a checklist; stop.
- Otherwise print `🟡 READY TO PUSH`: files grouped as Modified/Added/Deleted, commits ahead of origin, warnings.
  If there are uncommitted changes, tell the user to run `/custom-commit` first.
  Then show: `git push` (or `git push -u origin <branch>`).
