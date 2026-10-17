# Changelog

All notable changes to **Copilot Agent Nameplate** are listed here, one section per
released version, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/).

Every release MUST have an entry here before it is published (Constitution, *Release
Changelog*). Sections used: **Added**, **Changed**, **Fixed**, **Removed**, **Security**, plus
**Upgrade notes** when a release asks something of the user.

## [1.0.1] - 2026-10-17

### Fixed
- **Renaming one agent left the others of the same solution behind.** The rename was scoped
  to a single agent, so a solution holding `agente1 [DEV]` and `agente2 [DEV]` could be
  promoted as `agente2 [UAT]` next to `agente1 [DEV]`: mixed names in the same environment,
  with no warning. The rename now covers the whole solution (see *Changed*).
- The package inventory flagged the components of every agent after the first one as
  "beyond the agent", which forced an unnecessary confirmation on multi-agent solutions.

### Changed
- **The suffix applies to every agent of the solution.** It is a property of the target
  environment, not of one agent. The flow is now *solution → suffix → review → preview*; the
  agents are no longer picked one by one from the solution view.
- The suffix step lists the agents of the solution, all ticked by default, with the name each
  one will get, updated as you type. Untick an agent to leave it exactly as it is.
- The breadcrumb reads `Solutions › {Solution} › Suffix › Review › Preview`.
- The review step shows one row per agent instead of a single agent.
- Opening an agent from the search results now opens its solution, with that agent highlighted.
- The finished state of the package build stays on screen for about two seconds before the
  preview appears, so the change of screen no longer feels abrupt.
- The preview's *Publish and channels* panel is now **per agent** and shows the value in the
  exported package next to the one it will have after the patch (for example
  `not specified → yes` when *Force yes* is on). Before, it showed only the exported value,
  so it looked as if the option had been ignored, and with two agents it repeated the same
  labels without saying which agent each belonged to.

### Added
- **Mixed-suffix warning.** If, after the rename, the agents of a solution would carry
  different suffixes (for example one left out and still `[DEV]`), the review shows a warning
  and saving asks for an explicit confirmation, which is recorded in the manifest.
- The manifest and the history list **every** agent of the package, with `excluded: true` for
  the ones left as they were, so an agent kept on purpose can be told from one forgotten.
- `npm run smoke:multi`: checks the two-agent case (uniform suffix, exclusion respected,
  excluded agent byte-identical).

### Upgrade notes
- History records written by 1.0.0 only list the agents that were renamed; they have no
  `excluded` flag and are shown as before.

## [1.0.0] - 2026-10-16

First release.

### Added
- **Rename agents for a target environment without touching Dataverse.** Pick a solution in
  DEV, choose a suffix (`UAT`, `PROD`, free text up to 20 characters), and the tool exports
  the solution, patches the agent display name to `Name [SUFFIX]` and writes the package to
  disk. Nothing is written to the source environment.
- **Managed and unmanaged exports, both patched** and checked against each other. Only the
  `<name>` element of `bots/<schemaname>/bot.xml` is rewritten; `schemaname`, folder names,
  GUIDs and every other entry stay byte-identical, so the import is an upgrade of the same
  agent and not a new one.
- **Verification before delivery:** archive readable, entry count, patched values confirmed,
  byte-identical count for the untouched entries.
- **Idempotent suffix:** an existing suffix is stripped before the new one is applied
  (`Name [DEV]` + `UAT` → `Name [UAT]`, never `Name [DEV] [UAT]`). An empty suffix removes it.
- **Review and preview before the export.** The review shows what will change; the preview
  shows the exact file, element, before and after, and the full package inventory, with an
  explicit confirmation when the package holds more than the agents (cloud flows, tables,
  connection references…).
- **Options:** bump the solution version, and set *publish on import* (leave / force yes /
  force no) so the new name reaches Teams and Microsoft 365 Copilot.
- **Artifact sets** with a manifest (hashes, verification results, confirmations), written
  without save dialogs, with a confirmation before overwriting. Default is the single managed
  archive to import; extra copies are optional.
- **History** of the operations, searchable, with the path of each artifact set.
- **Package format drift detection** against a verified baseline, with a blocking check when
  the display name appears in a place the tool does not know.
- Export that tries the synchronous path first and falls back to the asynchronous one.
- Headless entry point, for running the same packaging without the interface.
- Warning when a resulting name exceeds the 30 characters of the Teams manifest.
- Managed solutions are recognised and explained: they cannot be exported, so the tool must be
  used where the solution is unmanaged.
- Interface in English, dark theme, collapsible log panel.
