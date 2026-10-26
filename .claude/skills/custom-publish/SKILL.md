---
name: "custom-publish"
description: "Publishes the tool to npm with the project's rules: the version comes from the top CHANGELOG.md entry, never from an automatic bump. Runs the pre-publish checks (clean git, changelog matches, build, validate, smoke, version not on npm yet), sets the version, and publishes only after an explicit confirmation. Manual only."
user-invocable: true
disable-model-invocation: true
---

# Publish to npm (irreversible: confirms before publishing)

A version published on npm **cannot be reused or really undone**. Every check below runs
before anything leaves the machine, and the final publish needs an explicit yes.

The version is decided by the changelog (constitution, *Release Changelog*): the first
`## [x.y.z]` heading of `CHANGELOG.md` is the version to publish. Do **not** use
`npm run publish-package`: it always bumps a patch and would ignore the changelog.

All commands run from `agent-nameplate/` unless said otherwise.

## Procedure

1. **Read the facts.** Top entry of `CHANGELOG.md` (call it `V`), `name` and `version` of
   `agent-nameplate/package.json`, `npm view <name> version` (what npm already has; "not found" means
   a first publish), and `git status`.
2. **Stop and explain if any of these fails** (do not try to fix them silently):
   - `CHANGELOG.md` missing, or its top entry has no date or no content → run
     `/custom-changelog` first.
   - Working tree not clean (uncommitted changes) → the published build would not match a
     commit. Ask the user to commit first (`/custom-commit`).
   - `V` is not greater than the version on npm → that number is taken. Say which one is
     the highest and ask which version the changelog should describe.
   - `V` is more than one step ahead of the npm version (for example 1.0.0 → 1.2.0) → ask
     whether it is intended.
   - Not on `main`, or `main` has commits not on the remote → say so and ask.
3. **Checks** — all must pass, report each in one line:
   - `npx tsc --noEmit`
   - `npm test`, then `npm run test:full`, then `npm run test:mutation` (Constitution — Testing
     Standard). Any failure, or any mutation that survives, is a stop: report which one and
     do not publish.
   - `npm run validate` (pptb-validate; if the binary is missing, say that the validation
     gate of the constitution could not be run, and treat it as a stop)
   - `npm run smoke -- <path to a managed zip from a previous artifact set>` and
     `npm run smoke:multi -- <same zip>`; if no zip is available, say they were skipped
     and why.
4. **Set the version** to `V` without touching git:
   `npm version <V> --no-git-tag-version`. If `package.json` already says `V`, skip it.
   Then `npm run build`.
5. **Show the summary and ask** with `AskUserQuestion`: package name, `V`, the version on npm,
   the changelog entry headline, the check results, and what the package will contain
   (`npm pack --dry-run` file list: only `dist` and the shrinkwrap are expected; flag
   anything else, above all sources, `.env*`, `*.zip`, artifact sets). Options: publish now
   (recommended) / stop here / change version.
6. **Publish**: `npm publish --access public`.
   - If npm answers `EOTP` or asks for authentication, do not look for a way around it:
     tell the user the exact command to run in their own terminal.
   - Report the outcome as it is. If it fails, say so with the npm output.
7. **After a successful publish**, report the next steps and do none of them: commit the
   version bump (`build(config): bump version to <V>` through `/custom-commit`), then push
   to both remotes when the user decides.

## Never

- Never publish without the confirmation of step 5, and never confirm on the user's behalf.
- Never use `npm run publish-package`, `--force`, `--tag` tricks or `npm unpublish`.
- Never edit `CHANGELOG.md` here: a wrong entry goes back to `/custom-changelog`.
- Never commit, tag or push: those are reported as next steps.
