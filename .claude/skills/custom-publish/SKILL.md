---
name: "custom-publish"
description: "Publishes the tool to npm with the project's rules: the version comes from the top CHANGELOG.md entry, never from an automatic bump. Runs the pre-publish checks (clean git, changelog matches, build, tests, validate, version not on npm yet), sets the version, and publishes only after an explicit confirmation. Manual only."
user-invocable: true
disable-model-invocation: true
---

# Publish to npm (irreversible: confirms before publishing)

A version published on npm **cannot be reused or really undone**. Every check below runs
before anything leaves the machine, and the final publish needs an explicit yes.

The version is decided by the changelog: the first `## [x.y.z]` heading of `CHANGELOG.md` is
the version to publish. Do **not** use an automatic bump script; it would ignore the changelog.

Also read `../../PPTB-PUBLISHING-RULES.md` before the first publish of a tool.

## Procedure

1. **Read the facts.** Top entry of `CHANGELOG.md` (call it `V`), `name` and `version` of
   `package.json`, `npm view <name> version` ("not found" means a first publish), and `git status`.
2. **Stop and explain if any of these fails** (do not fix silently):
   - `CHANGELOG.md` missing, or its top entry has no date or no content: run `/custom-changelog` first.
   - Working tree not clean: the published build would not match a commit. Ask the user to commit first (`/custom-commit`).
   - `V` is not greater than the version on npm: that number is taken. Say which is the highest and ask.
   - `V` is more than one step ahead of the npm version: ask whether it is intended.
   - The newest `### x.y.z` heading under **Updates** in `README.md` is not `V`: the npm page shows the README packed in the version and it cannot be changed afterwards. Write the entry (from the changelog) and commit it first.
   - The README body was not reviewed for `V`: the line `Page text reviewed for version V.` is missing or older, or an Added/Changed bullet of the changelog entry has no counterpart in Features, Usage or the limits section. Compare each bullet with the body, list the gaps, and stop until the README is updated and committed.
   - Not on `main`, or `main` has commits not on the remote: say so and ask.
3. **Checks** - all must pass, report each in one line:
   - `npx tsc --noEmit`
   - `npm test`, then `npm run test:full`, then `npm run test:mutation` if `package.json` has that script (Principle VIII). Any failure, or a surviving mutation, is a stop; do not publish.
   - **Before every release run ALL the checks in full, whatever changed** (decided by the author, 2026-11-07): `npm test`, `test:full` and the whole `test:mutation`, never a partial or `--changed-since` run. Never skip one because the code looks identical to the last release.
   - Every check the tool's `CLAUDE.md` lists under `## Extra checks` for a release (for example smoke scripts). If one needs an input that is not available, say it was skipped and why.
   - `npm run validate` (pptb-validate). If the binary is missing, say the validation gate could not be run and treat it as a stop.
4. **Set the version** to `V` without touching git: `npm version <V> --no-git-tag-version`
   (skip if `package.json` already says `V`). Then `npm run build`.
5. **Show the summary and ask** with `AskUserQuestion`: package name, `V`, the version on npm,
   the changelog headline, the check results, and what the package will contain
   (`npm pack --dry-run` file list: only `dist` is expected; flag anything else, above all
   sources, `.env*`, `*.zip`). Options: publish now (recommended) / stop here / change version.
6. **Publish**: `npm publish --access public`.
   - If npm answers `EOTP` or asks for authentication, do not look for a way around it:
     tell the user the exact command to run in their own terminal.
   - Report the outcome as it is. If it fails, say so with the npm output.
7. **After a successful publish**, report the next steps and do none of them: commit the
   version bump (`build(config): bump version to <V>` through `/custom-commit`), then the
   user pushes `main` and the tag to GitHub.

## Never

- Never publish without the confirmation of step 5, and never confirm on the user's behalf.
- Never use `--force`, `--tag` tricks or `npm unpublish`.
- Never edit `CHANGELOG.md` here: a wrong entry goes back to `/custom-changelog`.
- Never commit, tag or push: those are reported as next steps.
