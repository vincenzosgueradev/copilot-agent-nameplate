---
name: "custom-dedup"
description: "Analysis-only scan for duplicate and redundant code in src (duplicate helpers, dead code, unused exports, leftover console.log, duplicated constants). Reports findings; does not modify code."
user-invocable: true
disable-model-invocation: false
---

# Duplicate / redundant code analysis (read-only)

Read `.specify/memory/constitution.md` and `../../docs/architecture.md` first. Then scan `src/**` (`model/`, `services/`, `state/`, `views/`, `host.ts`, `types.ts`) and `test/**`.

Find:
1. **Duplicate functions** - identical or near-identical logic across files.
2. **Redundant code** - unused exports/functions/variables, commented-out blocks, stray `console.log` (the project has `services/log.ts`).
3. **Duplicate data** - constants, regexes, GUIDs, path strings defined in several places.
4. **Consolidation opportunities** - similar functions to merge; domain logic living in `views/` that belongs in `model/` or `services/`.

For each finding: `[DD-001] type (DUPLICATE|REDUNDANT|CONSOLIDATION) - severity (HIGH|MEDIUM|LOW) - files:lines - recommended fix - effort (small|medium|large)`.

If the tool's `CLAUDE.md` has an `## Extra checks` section naming extra folders or entry points to scan (for example a
second build entry), include them.

Do not fix anything. Print the report in the terminal and offer to apply the fixes afterwards (then run `npm run build` and `npm test`).
