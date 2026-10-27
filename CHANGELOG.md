# Changelog

All notable changes to **Agent Nameplate** are listed here, one section per
released version, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/).

Every release MUST have an entry here before it is published (Constitution, *Release
Changelog*). Sections used: **Added**, **Changed**, **Fixed**, **Removed**, **Security**, plus
**Upgrade notes** when a release asks something of the user.

## [1.1.2] - 2026-10-27

Fixes after the second marketplace review.

### Changed
- The tool icon is now an original nameplate drawing that follows the theme colour. It replaces
  the Copilot Studio product logo, which a tool icon must not use.
- The README now matches what the tool does: importing the package into a target environment
  happens outside the tool (maker portal or `pac solution import`), and a usage section and an
  AI Assistance disclosure were added.
- The tool uses only the active connection, so `features.connections` is now `1`, with
  `minAPI` set to `1.2.7`.
- Error messages that were in Italian or half Italian are now fully in English.

### Removed
- The headless/MCP mode is no longer built, published or documented: its configuration file was
  never part of the published package, so users could not reach it. The source and its tests stay
  in the repository.

### Fixed
- The headless error mapping looked for Italian phrases that the services no longer produce, so
  permission and empty-package errors were reported as connection errors.

## [1.1.1] - 2026-10-26

Fixes after the marketplace review of 1.1.0 (spec 014).

### Changed
- The tool is now called **Agent Nameplate**: the "Copilot" product-line branding is gone from
  the display name, the window title, the header, the README and the notifications. The npm
  package name does not change.
- The author is now **Vincenzo Sguera**, no longer "Power Platform ToolBox".
- The version in the header is read from `package.json` at build time. It used to be written by
  hand and still said `v0.1.0`.
- The "Package format" notice now appears only when `<name>` is missing from `bot.xml`, which is
  what the tool changes. New keys, elements or folders no longer show a warning (for example
  `categories` in a standard agent): they stay in the log and in `manifest.json`.

### Added
- **Confirmation before writing to DEV.** When "Raise the version" is on, a dialog names the
  environment, the solution and both version numbers, says the tool cannot undo the change and how
  to go back, and waits for your answer. Going back writes and exports nothing. Headless/MCP asks
  for `confirmVersionWrite: true`, otherwise it answers `VERSION_WRITE_NOT_CONFIRMED`.
- The confirmation dialog also names the environment URL and the scope (one property of one solution).
- **Light theme.** The tool follows the PPTB theme, light or dark (it used to be dark only), and
  follows it live when the setting changes.
- README section **What this tool changes**: what goes into the package and what is written to DEV.

### Fixed
- The README no longer says that the tool writes nothing to any environment: raising the solution
  version in DEV is a write, and it is now documented as one.

### Upgrade notes
- Headless/MCP callers that pass `options.newVersion` must also pass `confirmVersionWrite: true`.

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
- **"The package holds more than the agent" no longer appears for components that only look
  foreign.** Copilot Studio creates some components (for example the feedback settings,
  `Default_FeedbackCollectionBotSettings_*`) that depend on an agent but do not carry its name.
  The tool judged ownership by name only, so a single such component made the whole list of
  agent components count as "beyond the agent" and asked for a confirmation on every save.
  Ownership now follows the agent the component is attached to; a component of a bot that is not
  in the package is still reported.

### Changed
- **The suffix applies to every agent of the solution.** It is a property of the target
  environment, not of one agent. The flow is now *solution → suffix → review → preview*; the
  agents are no longer picked one by one from the solution view.
- **Publish on import can be set per agent.** Each agent in the list has its own
  *Leave as is / Force yes / Force no* toggle, and a last row of the table, lined up under
  those toggles, sets the same value for every ticked agent. It stays lit when all ticked agents
  share one value and goes dark when they differ. Useful when one agent is already published and another
  has never been connected to Teams. The review shows the value each agent will get. The single
  switch that used to sit in *Options* is gone; suffix and version stay one for the whole
  solution.
- The suffix step lists the agents of the solution, all ticked by default, with the name each
  one will get, updated as you type. Untick an agent to leave it exactly as it is.
- The breadcrumb reads `Solutions › {Solution} › Suffix › Review › Preview`.
- **The version is now raised in DEV, like the portal does, not inside the zip.** Until now
  *Bump the version* changed `<Version>` only in the package: DEV stayed at `1.0.0.2` while UAT
  got `1.0.0.3`, so the next export produced `1.0.0.3` again and the import failed with *"The
  import solution must have a higher version than the existing solution it is upgrading"*, or left
  two different contents under one number. Now, for every export, the tool proposes the next
  number (editable, on by default), **writes it to the unmanaged solution in DEV before
  exporting**, reads it back, and the package carries it. DEV, package and target stay aligned and
  the next export continues from there. It is the only thing the tool writes to Dataverse, and the
  review says so. A version that is not four numbers, or not higher than DEV's, is refused with the
  reason; if the write fails or someone raised DEV in the meantime, nothing is exported.
- **The version text says what it means for deleted agents.** Without raising the version the
  target can only take the package as an *Update*, which never removes components, so agents
  deleted in the source stay there. With it, import as an *Upgrade* (the default) to remove them;
  *Update* and *Stage for upgrade* keep them. Same wording under the option and in the review.
- The file names in the artifact list use the version the package will carry.
- The progress shows a first phase, *Raise the version in DEV*, when the version is raised.
- **The agent table uses the full width** of the panel: the columns share it, and each
  *Leave as is / Force yes / Force no* toggle fills its column with three equal buttons instead of
  huddling on the left. The global actions sit in its last row instead of in the column header.
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
- **Consistent headers.** The three tile headers (solution list, open solution, package preview) are built the same way, with English labels (Version, Publisher, Agents, Created, Entries, Export time) and no repeated information: the managed count is no longer in two places, the solution subtitle says the type instead of repeating the agent count and the name, and the preview no longer repeats the solution. The breadcrumb now says Checks and Result like the steps.
- Every excluded agent now says which suffix it keeps, and the mixed-suffix warning names them.
- Row selection in the agent table uses a round check (ring, filled when ticked, a dash when
  only some rows are on) instead of a small switch.
- The open solution header no longer repeats data already visible in the list row.

### Added
- **Pin solutions to the top of the list.** A pin on each row keeps up to three solutions per
  environment above the rest, whatever the sort, filter or search. Pins are remembered per
  environment on this machine and never written to the package, the manifest or Dataverse.
- **Warning before continuing without a suffix.** An empty suffix removes the existing one from
  every ticked agent. The review now opens a dialog listing each affected agent (before → after)
  with a way back.
- **Select all / Deselect all** above the agent table, with an "N of M selected" counter. With
  nothing ticked, the screen explains why and points to the native export or the ALM pipeline.
- **Mixed-suffix warning.** If, after the rename, the agents of a solution would carry
  different suffixes (for example one left out and still `[DEV]`), the review shows a warning
  and saving asks for an explicit confirmation, which is recorded in the manifest.
- The manifest and the history list **every** agent of the package, with `excluded: true` for
  the ones left as they were, so an agent kept on purpose can be told from one forgotten.
- `npm run smoke:multi`: checks the two-agent case (uniform suffix, exclusion respected,
  excluded agent byte-identical).
- **GitHub Copilot harness agents.** A solution can now mix classic Copilot Studio agents and GitHub Copilot harness agents. The rename works the same (the name lives in the same place, verified on a real import) and the package-format check compares each agent with the baseline of **its own architecture**, so a legitimate package no longer shows the "agentSettings appeared" warning. A key that is really out of place, or an architecture the tool has never seen, is still reported, once, naming the architecture.
- **Agent type column.** The solution view and the suffix step have a new **Agent type** column right after the agent name: the app's Copilot logo for standard agents, the GitHub Copilot mark for GitHub Copilot harness agents, and a dash for a type the tool does not recognise (never assumed to be standard). The type comes from the agent's `template` in Dataverse, read together with the icon, so there is no extra query. The icon has a text label and a tooltip.
- **Agent icon in the lists.** The solution view and the suffix step show each agent's icon
  (Copilot Studio's own) next to the name, the review shows the small icon and the search
  results carry it in the chip. It is read, read-only, only for the solution you open, after
  the list is drawn, and cached for the session. An icon is shown only if it is a valid PNG;
  if the read fails the lists keep the default icon and a warning goes to the log. Nothing is
  added to the package, the manifest or the history.

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
