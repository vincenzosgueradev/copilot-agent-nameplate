# Changelog

All notable changes to **Copilot Agent Nameplate** are listed here, one section per
released version, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/).

Every release MUST have an entry here before it is published (Constitution, *Release
Changelog*). Sections used: **Added**, **Changed**, **Fixed**, **Removed**, **Security**, plus
**Upgrade notes** when a release asks something of the user.

## [1.1.0] - 2026-10-17

### Fixed
- **Renaming one agent left the others of the same solution behind.** The rename was scoped
  to a single agent, so a solution holding `agente1 [DEV]` and `agente2 [DEV]` could be
  promoted as `agente2 [UAT]` next to `agente1 [DEV]`: mixed names in the same environment,
  with no warning. The rename now covers the whole solution (see *Changed*).
- **False warning on an agent created with its suffix already in the name.** An agent created
  in Copilot Studio as `Name [DEV]` also carries `[DEV]` in the name of its GPT component. The
  tool reported that as "the name appears in places the tool does not know" and asked for
  a confirmation on every save. It is now recognised, left untouched on purpose, and the
  checks screen says so.
- **False "package format differs" warning for an agent never connected to Teams or
  Microsoft 365 Copilot.** Such an agent has no `channels` and no `isLightweightBot` in its
  configuration; the format check also read only the first agent's configuration, so the
  result depended on the order of the files. It now reads all the agents, and those two keys
  are optional.
- **Every screen now opens at the top.** Moving between steps, forward or back, kept the scroll
  position of the previous screen, so going back from the bottom of a page landed you at the
  bottom of the next one. Typing in the suffix field or clicking a toggle does not move the page.
- **Two agents with the same display name no longer trigger the "unknown place" warning.**
  Each one's name showed up in the other's definition and was reported as an unexpected
  occurrence.
- **The checks now confirm every value the tool writes.** After building the archive the tool
  re-reads it and used to confirm only the agent names. It now also confirms each agent's
  *publish on import* and the solution version, and a changed entry with extra bytes at the end
  is no longer counted as untouched.
- The confirmation banner said "a single entry changed" whatever the number; it now states
  the real count.
- The package inventory flagged the components of every agent after the first one as
  "beyond the agent", which forced an unnecessary confirmation on multi-agent solutions.

### Changed
- **The suffix applies to every agent of the solution.** It is a property of the target
  environment, not of one agent. The flow is now *solution → suffix → review → preview*; the
  agents are no longer picked one by one from the solution view.
- **Publish on import can be set per agent.** Each agent in the list has its own
  *Leave as is / Force yes / Force no* toggle, and a last row of the table, lined up under
  those toggles, sets the same value for every ticked agent. It stays lit when all ticked agents
  share one value and goes dark when they differ. Useful when one agent is already published and another
  has never been connected to Teams. The review shows the value each agent will get. The single
  switch that used to sit in *Options* is gone; suffix and version bump stay one for the whole
  solution.
- The suffix step lists the agents of the solution, all ticked by default, with the name each
  one will get, updated as you type. Untick an agent to leave it exactly as it is.
- The breadcrumb reads `Solutions › {Solution} › Suffix › Review › Preview`.
- **The agent table uses the full width** of the panel, and the global actions sit in its last
  row instead of in the column header.
- **The review stacks its two panels** (*Rename* and *Options*) one under the other, at full
  width, so the last column is no longer cut off.
- **"What gets changed" is grouped by agent.** Each touched agent has its own block with its
  name change and its publish on import change, followed by a block for the solution (version).
  Agents you left out are named below instead of appearing as empty rows.
- The file descriptions in the artifact list now use the whole line instead of stopping at a
  fixed width.
- While the package is built, *Read the packages* and *Patch and verify* stay on screen for a
  moment each instead of flashing by together.
- The review step shows one row per agent instead of a single agent.
- Opening an agent from the search results now opens its solution, with that agent highlighted.
- The finished state of the package build stays on screen for about two seconds before the
  preview appears, so the change of screen no longer feels abrupt.
- The preview's *Publish and channels* panel is now **per agent** and shows the value the
  package will carry **after** the patch (for example `yes` when *Force yes* is on). Before,
  it showed the value of the exported package, so it looked as if the option had been
  ignored, and with two agents it repeated the same labels without saying which agent each
  belonged to.

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
