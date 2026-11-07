---
name: "custom-changelog"
description: "Drafts the CHANGELOG.md entry for the next release from the commits since the last documented version, checks it against package.json, and writes it after confirmation. Run before publishing."
user-invocable: true
disable-model-invocation: true
---

# Release changelog (writes CHANGELOG.md after confirmation)

The audience is the person who installs the tool, not the developer. Read the root constitution
(Principle IX, release discipline) and this tool's constitution first.

## Procedure

1. **Find the last documented version.** Read `CHANGELOG.md`; the first `## [x.y.z]` heading is
   the last release. Read `version` in `package.json`. If `CHANGELOG.md` does not exist, stop and say so.
2. **Decide the version this run is about.** Three cases:
   - `package.json` version **greater** than the last entry: that is the version being
     released and its entry is missing; write a new section.
   - **Equal** to the last entry: that version is already published, so write a new section.
     **You decide the number**, because `/custom-publish` publishes whatever the top entry says:
     PATCH for fixes only, MINOR for a new user-visible capability, MAJOR for anything that
     breaks saved data or a contract. Give the reason in one line.
   - **Lower** than the last entry: the last entry describes a version **not yet published**.
     Do not add a section: **update that entry** with what was done since. Its commit range
     starts at the commit that introduced the *previous* release heading; do not duplicate lines.
3. **Collect the commits since the last release.**
   ```
   git log -S"## [<last>]" --format=%h -- CHANGELOG.md        # take the oldest
   git log <that-hash>..HEAD --format='%h %s%n%b' --no-merges
   ```
   Commits touching only `.claude/`, `.specify/`, CI or tooling are not release content, unless
   they change what the user installs. Also read `git diff --stat` of the range.
4. **Group** into Added, Changed, Fixed, Removed, Security, and write each line for the user:
   say what changed *for them* and why it matters; for a fix, the symptom they saw; merge many
   small commits on one subject into one line; add **Upgrade notes** only when something is
   asked of the user. Do not copy commit subjects verbatim, do not invent changes.
5. **Show the draft** and confirm with `AskUserQuestion` (draft as written - recommended;
   change the version number; edit the wording). Date is today's.
6. **Write it**: insert the new section under the intro, above the previous version (or edit
   the unpublished top entry in place). Never edit entries of versions already published.
   Re-read the top of the file to check the heading order.
7. **Report**: the version, the number of lines per section, and what is left before
   publishing: `/custom-commit` for the entry, `/custom-ampush`, then `/custom-publish`.

## Never

- Never commit, tag, bump `package.json` or publish: report them as next steps.
- Never rewrite or delete a released entry.
- Never leave the entry as "misc changes": if the range has nothing user-visible, say so and write nothing.
