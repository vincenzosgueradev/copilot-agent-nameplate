---
name: "custom-commit"
description: "Use whenever the user wants to commit changes (\"commit\", \"fai il commit\", \"committa\", \"salva le modifiche\"). Analyzes changes, proposes a Conventional Commits message with this project's scopes, asks for confirmation, then commits. Never pushes."
argument-hint: "Optional: scope or extra context for the commit message"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

Consider the user input if not empty (scope, type hint, extra context).

# Conventional Commits — Agent Rename Manager (PPTB tool)

## Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

## Types

| Type | When |
|---|---|
| `feat` | New user-visible capability |
| `fix` | Bug fix |
| `docs` | Docs only (README, specs/, comments) |
| `style` | CSS / formatting, no logic change |
| `refactor` | Restructure without behavior change |
| `perf` | Performance improvement |
| `test` | Tests / smoke script only |
| `build` | Vite, tsconfig, dependencies, package.json/lock |
| `ci` | Pipeline config (.github, Azure DevOps) |
| `chore` | Tooling, repo config, `.claude`, `.specify` |
| `revert` | Revert a previous commit |

## Scopes (use the most specific; omit if > 3 areas)

| Scope | Area |
|---|---|
| `ui` | `tools/src/app.ts`, `index.html`, `styles.css`, `components/`, `services/ui.ts` |
| `package` | Solution package handling: `package.ts`, `packaging.ts`, `rezip.ts`, `export.ts`, `files.ts` |
| `patch` | Agent display-name patching: `patch.ts`, `compat.ts`, `baseline/` |
| `dataverse` | `dataverse.ts`, `solutions.ts` |
| `deploy` | `deploy.ts` |
| `history` | `history.ts`, `artifacts.ts`, `log.ts` |
| `headless` | `headless.ts`, `vite.headless.config.ts`, headless API |
| `config` | `pptb.config.json`, pptb fields in `package.json` |
| `smoke` | `tools/scripts/smoke-package.mts` |
| `specs` | `specs/**` (spec-kit artifacts) |
| `constitution` | `.specify/memory/constitution.md` |
| `claude` | `.claude/**` |

## Rules

1. Description: **English**, imperative, lowercase, no final period, max 72 chars on the first line.
2. Body (when the diff is non-trivial): explain *why*, wrap at 72.
3. One commit = one concern. If changes mix unrelated concerns, propose splitting into several commits (stage by path).
4. Breaking change: `!` after type/scope + `BREAKING CHANGE:` footer.
5. Respect the style visible in `git log`.

## Procedure

1. `git status` and `git diff` (staged; if nothing staged, look at unstaged + untracked changes).
2. If nothing is staged, propose which files to stage (never `node_modules`, `tools/dist`, `.env*`, secrets, `*.zip` solution packages). Prefer staging by explicit path over `git add -A`.
3. If the changes clearly belong to several concerns, propose a split and commit them one at a time.
4. Generate the message and show it with `AskUserQuestion` (options: proposed message — recommended; change type/scope; write my own).
5. Commit using a HEREDOC. Append the attribution line required by the session's system reminder, if any.
6. Show hash + short summary (`git log -1 --stat`).

## Never

- Never `git push`, amend, force, or reset. Pushing is the user's call; suggest `/custom-ampush` before pushing.
- Never use `--no-verify`.
