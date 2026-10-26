---
name: "custom-changelog"
description: "Drafts the CHANGELOG.md entry for the next release of Copilot Agent Nameplate from the commits since the last documented version, checks it against package.json, and writes it after confirmation. Run before publishing; implements the constitution's Release Changelog rule."
user-invocable: true
disable-model-invocation: true
---

# Release changelog (writes CHANGELOG.md after confirmation)

Implements *Publishing & Community → Release Changelog* of `.specify/memory/constitution.md`.
Read that section first: it defines the format and the audience (the person who installs the
tool, not the developer).

## Procedure

1. **Find the last documented version.** Read `CHANGELOG.md`; the first `## [x.y.z]` heading is
   the last release. Read `version` in `package.json`.
   - If `CHANGELOG.md` does not exist, stop and say so.
2. **Decide the version this run is about.** Three cases:
   - `package.json` version **greater** than the last entry → that is the version being
     released and its entry is missing: write a new section.
   - **Equal** to the last entry → that version is already published, so write a new
     section. **You decide the number**, because `/custom-publish` publishes whatever the top
     entry says: PATCH for fixes only, MINOR for a new user-visible capability, MAJOR for
     anything that breaks saved data or the package contract. Give the reason in one line.
   - **Lower** than the last entry → the last entry describes a version **not yet published**
     (written ahead of the bump). Do not add a section: **update that entry** with what was
     done since it was written. Its commit range starts at the commit that introduced the
     *previous* release heading, and lines already in the entry must not be duplicated.
3. **Collect the commits since the last release.** Find the commit that introduced the last
   *published* heading (in the "lower" case, the one before the top entry) and list what came
   after it:
   ```
   git log -S"## [<last>]" --format=%h -- CHANGELOG.md        # take the oldest
   git log <that-hash>..HEAD --format='%h %s%n%b' --no-merges
   ```
   Commits touching only `.claude/`, `.specify/`, CI or tooling are not release content:
   skip them unless they change what the user installs. Also read `git diff --stat` of the
   range, and the spec change if a `FR-xxx` was rewritten.
4. **Group into the constitution's sections** — Added, Changed, Fixed, Removed, Security — and
   write each line for the user:
   - say what changed *for them* and why it matters; for a fix, the symptom they saw;
   - a fix that changes previous behavior goes under **Changed** too;
   - merge many small commits on one subject into one line (UI polish is one line, not ten);
   - add **Upgrade notes** only when something is asked of the user (re-export, saved data
     that reads differently, a renamed option).
   - Do not copy commit subjects verbatim, and do not invent changes that are not in the diff.
5. **Show the draft** and confirm with `AskUserQuestion` (draft as written — recommended;
   change the version number; edit the wording). Date is today's.
6. **Write it**: insert the new section directly under the intro, above the previous version
   (or, in the "lower" case, edit the unpublished top entry in place). Never edit entries of
   versions that are already published. Then re-read the top of the file to check the heading order.
7. **Report**: the version, the number of lines per section, and what is still to do before
   publishing: `/custom-commit` for the entry, `/custom-ampush`, then `/custom-publish`, which
   sets `package.json` to the version of this entry.

## Never

- Never commit, tag, bump `package.json` or publish: report them as next steps.
- Never rewrite or delete a released entry. A mistake in an old entry is a new line under the
  current version, or a correction the user asks for explicitly.
- Never leave the entry as "misc changes": if the range has nothing user-visible, say so and
  write nothing.
