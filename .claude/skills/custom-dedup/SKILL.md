---
name: "custom-dedup"
description: "Analysis-only scan for duplicate and redundant code in agent-nameplate/src (duplicate helpers, dead code, unused exports, leftover console.log, duplicated constants). Reports findings; does not modify code."
user-invocable: true
disable-model-invocation: false
---

# Duplicate / redundant code analysis (read-only)

Read `.specify/memory/constitution.md` first (non-negotiable principles). Then scan `agent-nameplate/src/**` (`app.ts`, `components/`, `services/`, `headless.ts`, `types.ts`) and `agent-nameplate/scripts/**`.

Find:
1. **Duplicate functions** — identical or near-identical logic across files (e.g. zip/XML/path helpers repeated between `package.ts`, `packaging.ts`, `rezip.ts`, `patch.ts`; code shared between the UI `app.ts` and `headless.ts`).
2. **Redundant code** — unused exports/functions/variables, commented-out blocks, stray `console.log` (the project has `services/log.ts`).
3. **Duplicate data** — constants, regexes, GUIDs, path strings defined in several places; copies of `baseline/package-format.json` content in code.
4. **Consolidation opportunities** — similar functions to merge, UI-agnostic logic living in `app.ts` that belongs in `services/`.

For each finding: `[DD-001] type (DUPLICATE|REDUNDANT|CONSOLIDATION) · severity (HIGH|MEDIUM|LOW) · files:lines · recommended fix · effort (small|medium|large)`.

Do not fix anything. Print the report in the terminal and offer to apply the fixes afterwards (then run `npm run build` and `npm run smoke` from `agent-nameplate/`).
