---
name: "commit"
description: "Analyze staged changes and generate a Conventional Commits message with proper prefix (feat, fix, docs, refactor, etc.), then commit."
argument-hint: "Optional: scope or extra context for the commit message"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). The user may provide a scope, a hint about the type of change, or extra context.

## Conventional Commits Standard

Generate commit messages following the **Conventional Commits 1.0.0** specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types (choose the most appropriate)

| Type       | When to use |
|------------|-------------|
| `feat`     | A new feature or capability |
| `fix`      | A bug fix |
| `docs`     | Documentation only (README, comments, JSDoc) |
| `style`    | Formatting, whitespace, semicolons — no logic change |
| `refactor` | Code restructuring without changing behavior |
| `perf`     | Performance improvement |
| `test`     | Adding or updating tests |
| `build`    | Build system, dependencies (npm, pip, nuget, etc.) |
| `ci`       | CI/CD configuration (GitHub Actions, Azure DevOps, etc.) |
| `chore`    | Maintenance tasks, tooling, config files |
| `revert`   | Reverting a previous commit |

### Rules

1. **Type is mandatory** — always pick one from the table above.
2. **Scope is optional** — use it when the change is clearly scoped to a module, component, or area (e.g., `feat(auth):`, `fix(api):`).
3. **Description**: imperative mood, lowercase first letter, no period at the end, max ~72 characters.
4. **Body** (optional): explain *what* and *why*, not *how*. Wrap at 72 characters. Add when the diff is non-trivial.
5. **Breaking changes**: add `!` after type/scope (`feat!:` or `feat(api)!:`) and add a `BREAKING CHANGE:` footer.
6. **Multi-file changes**: if the commit touches multiple areas, pick the type that best describes the primary intent.

### Examples

```
feat(parser): add support for arrays in config files
fix: prevent race condition in queue processing
docs: update API reference for v2 endpoints
refactor(auth): extract token validation into middleware
chore: update ESLint config to v9
feat!: drop support for Node 14

BREAKING CHANGE: minimum Node version is now 18
```

## Procedure

1. **Run `git status`** to see what's staged, modified, and untracked.

2. **If nothing is staged**: stage all modified and new files automatically (`git add -A`), then re-check status. If still nothing to commit, tell the user and stop.

3. **Run `git diff --staged`** to analyze exactly what will be committed.

4. **Analyze the diff** carefully:
   - What files are changed? What kind of files are they?
   - What is the nature of the change? (new feature, bug fix, refactor, etc.)
   - Is there a clear scope? (a module, component, or area)
   - Is it a breaking change?

5. **Generate the commit message** following the Conventional Commits rules above. Be concise but descriptive.

6. **Show the proposed message** to the user and ask for confirmation or edits using `AskUserQuestion`:
   - Option 1: the proposed message (recommended)
   - Option 2: commit with a modified scope/type
   - Option 3: let the user write their own

7. **Commit** with the final message. Use a HEREDOC to pass the message:
   ```
   git commit -m "$(cat <<'EOF'
   <message here>
   EOF
   )"
   ```

8. **After committing**, show the commit hash and a brief summary.

## Important Notes

- Do NOT push automatically — only commit. The user will push when ready.
- If the user provided context in $ARGUMENTS, use it to inform the type/scope/description.
- For monorepos or multi-project repos, try to identify the scope from the file paths.
- Always respect the project's existing commit message style if visible in `git log`.
