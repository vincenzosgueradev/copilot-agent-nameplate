---
name: "custom-cleanup"
description: "Find and remove references to deleted or missing files (imports, config paths, markdown links, spec references) in Agent Rename Manager, then verify the build. Use after deleting or renaming files, e.g. after removing src/backups.ts."
user-invocable: true
disable-model-invocation: true
---

# Orphan reference cleanup

Scan dynamically; never hardcode lists. Ignore `node_modules/`, `dist/`, `.git/`.

1. **Find missing files**: inventory files on disk, then scan `src/**`, `*.json`, `*.ts`, `scripts/**`, `README.md`, `specs/**/*.md`, `.specify/**`, `.github/**`, `.claude/**` for paths, filenames or imports that don't resolve. Use `git status` (`D` entries) as a hint for deleted files, but rely on the filesystem. Report as `[MF-001] <path>`.
   If none: `PASS — no missing files referenced` and stop.
2. **Find references**: for each missing file list every referencing file:line (imports, `pptb.config.json`, vite configs, markdown links, spec/task mentions). Report `[OR-001] file:line → MF-001, action: remove|update|flag`.
3. **Clean**: minimal edits only. Remove the import line / link / sentence; drop a section header if it ends up empty. Read each file before editing. Never delete files automatically — flag empty ones.
4. **Verify**: from ``, run `npm run build`; re-scan for the same names. Fix only errors caused by the cleanup.
5. **Report**: missing files, references cleaned, files modified, build ✅/❌, items needing manual review.

Finish with: "Cleanup complete. Run `/custom-ampush` to verify readiness to push."
