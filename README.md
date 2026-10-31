# Agent Nameplate

**Rename Copilot Studio agents per environment — without an unmanaged layer.** A Power Platform ToolBox tool
for ALM owners who promote a solution from DEV to UAT and PROD: it produces a solution package where the agent
display names are already set for the target, so the agent arrives **already wearing the right nameplate**.

Renaming an agent in the target environment creates an unmanaged layer that wins over every later solution
upgrade. This tool moves the rename into the package, where it belongs to the managed layer.

![Solutions step: the solutions of the source environment with their agents](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/01-solutions.png)

## Features

**Pick it**
- **Choose the solution.** Lists the solutions of the connected DEV environment with the agents each one holds,
  their icon and type (standard or GitHub Copilot harness); pin the ones you use most.

**Name it**
- **Set one suffix for the whole solution**, such as `[UAT]`, with preset buttons, and see the name each agent
  will get as you type. The tool warns when the names already carry a different suffix, or none.
- **Leave agents out.** Untick an agent and it stays exactly as it is.
- **Set publish on import per agent**: leave as is, force yes or force no, or the same value for all.
- **Raise the solution version in DEV** before the export so DEV, package and target stay aligned; a dialog
  names the environment, the solution and both numbers and waits for your confirmation.

**Check it**
- **Preview first.** See exactly what changes in the package, per agent, before anything is exported.
- **Verify entry by entry.** The solution is exported twice (managed and unmanaged), one element is patched, and
  the result is checked against the original: every other entry must be byte-identical.

**Keep it**
- **Save an artifact set** with the patched pair, the original exports and a `manifest.json` with a SHA-256
  hash, and keep a history of what you packaged.
- **Works in the light and the dark theme** of Power Platform ToolBox.

## What this tool changes

**In the package** (the files it produces, never the environment):

- the content of `<name>` inside `bots/<schemaname>/bot.xml`, one per selected agent;
- optionally `publishOnImport` in `configuration.json`, per agent;
- nothing else: every other entry stays byte-identical, verified entry by entry.

**In the source environment (DEV)**, only if "Raise the version" is on (it is by default):

- the **version of the unmanaged solution** you selected, for example `1.0.0.2` → `1.0.0.3`,
  written **before the export** so DEV, the package and the target stay aligned.

Before writing, the tool shows a dialog naming the environment, the solution and both version
numbers, and waits for your confirmation. **The tool cannot undo the change**: to go back, set the
previous version in the solution properties in the portal, or export the solution before
continuing as a backup. Turn the option off and the environment is not written to at all.

Nothing else is written to any environment. Importing the package into a target environment is a
separate step that you do yourself, outside the tool (maker portal or `pac solution import`).

## What it does not cover

- It does **not import** the package: importing into the target environment is a step you do yourself, in the
  maker portal or with `pac solution import`.
- It renames the display name of the agent in the package. Names inside topics, prompts or other components are
  not rewritten; the tool reports the places where the name appears and leaves them alone.
- It is not compatible with native **Power Platform Pipelines**, which distribute the same managed artifact to
  every stage.
- Microsoft does not support manual edits of files extracted from a solution; see *Supportability* below.

## Installation

Install **Agent Nameplate** from the Power Platform ToolBox marketplace. It needs **one connection**: the source
(DEV) environment, with a role that can export the solution (at least System Customizer).

## Usage

1. **Solutions.** Open the tool with an active connection to your source (DEV) environment and pick the
   unmanaged solution that contains the agents. You see its agents with their icon and type, then press **Set the suffix**.

   ![Solutions step with the agents of each solution](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/01-solutions.png)

   ![The agents of the chosen solution with their icon and type (standard or GitHub Copilot harness)](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/02-agents.png)
2. **Suffix.** Type the suffix for the target environment, for example `[UAT]`, or use a preset. Leave it empty
   to remove a suffix. Choose which agents to rename and how each one is published on import.

   ![Suffix step: the suffix field with the preset buttons DEV, TEST, UAT, STAGING, PREPROD and PROD](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/03-suffix.png)

   ![Agents table: the name each agent will get and the publish on import toggle of each, with a row to set them all](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/04-publish.png)
3. **Review.** Check the new names and options, and decide whether to raise the solution version in DEV before
   the export.

   ![Review step: the new names, the options and the version to write in DEV](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/05-review.png)

   ![Options of the review: the version written to DEV before the export and what happens next](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/06-options.png)

   ![Confirmation dialog: the environment, the solution and the old and new version, before anything is written to DEV](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/07-version-dialog.png)
4. **Preview.** See what changes in the package, per agent, while the solution is exported and patched.

   ![Preview step: the five phases of the export and patch, all completed](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/08-preview.png)
5. **Checks.** The tool verifies the patched package entry by entry against the original.

   ![Checks step: what travels in the package, the folders and how many agents](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/09-checks.png)

   ![Checks step: managed and unmanaged packages verified, 94 of 94 entries byte-identical where unchanged, 7 entries changed](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/10-verified.png)
6. **Result.** Save the artifact set to a folder. Import the managed zip into the target environment yourself.

   ![Result step: the warning not to import the unmanaged archive, the version note and where the artifact set was saved](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/11-result.png)

   ![The saved folder: the managed zip to import and manifest.json](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/12-files.png)

## The Flow

```text
DEV → solution → ExportSolution ×2 (managed + unmanaged)
    → patch <name> in bots/<schema>/bot.xml
    → rezip + entry-by-entry verification
    → artifact set: patched pair + originals + manifest.json
```

## What Gets Modified in the Package

**One element only**: the content of `<name>` inside `bots/<schemaname>/bot.xml`, one per agent.

`schemaname`, folder names, file names, GUIDs, `[Content_Types].xml`, and
`customizations.xml` are never touched. No global find-and-replace — the schema name appears in
**31 out of 34 entries**, and a blanket substitution would destroy the solution.

Optionally `publishOnImport` in `configuration.json` can also be set, per agent. Every other
entry stays **byte-identical**, and the tool verifies this entry by entry before delivering the file.

**The version is not patched in the package.** Following Microsoft's guidance, the tool raises the
version of the unmanaged solution **in DEV, before the export** (the default, editable like in the
portal's export pane, and confirmed in a dialog), so DEV, the package and the target stay aligned
and the next export continues from the new number. It is the only thing the tool ever writes to
Dataverse. To import the same
version into a second environment, turn the option off: DEV is already at that number.

## Teams and M365 Copilot

The name shown on channels is a **snapshot of `bot.name` taken at publish time**, in each
environment: the package patch covers it, provided the agent is published in the target —
`publishOnImport: true` does this at import. The Teams manifest does not travel inside the
package and contains no display name.

The native Copilot Studio *Channel display name suffix* is an **alternative**, not a complement:
used alongside a suffix already in the name, it produces `agentTool1 [UAT] (UAT)`. The tool
leaves it untouched and warns if it finds one configured.

## Supportability — Know This Before You Use It

Microsoft **does not support manual modification of files extracted from a solution**
([Source control with solution files](https://learn.microsoft.com/power-platform/alm/use-source-control-solution-files)).
The tool does it anyway, on a single element. The decision was made deliberately, grounded in
three verified facts:

1. **No dependency can break**: dependency records contain only GUIDs and `componenttype` — no
   field holds a display name. The name is not a key.
2. **Exactly one element is touched**, and the entry-by-entry verification proves it on every
   run.
3. **The original export is preserved in the artifact set**: any issue is fully reproducible
   without the patch.

A formally sound alternative exists — rename inside a *build environment* where the solution is
unmanaged and export from there — documented in `research.md §15`, evaluated, and ruled out on
operational cost grounds.

**Native Power Platform Pipelines are not compatible** with this flow: the pipelines host
prohibits artifact modification and distributes the same managed artifact to every stage.

## Artifact Set

Every operation leaves a folder:

```text
testAgentTool_1.0.0.2_UAT_20261015-143022/
├── manifest.json                              source, suffix, operator, fingerprint, hash
├── testAgentTool_1_0_0_2_managed_UAT.zip      role: deploy   ← the only file to import in UAT/PROD
├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    role: source   ← source control only, never deploy downstream
├── source_managed.zip                         role: restore
└── source_unmanaged.zip                       role: restore
```

Two artifacts at the same `<Version>` (one for UAT, one for PROD, built from the same DEV
version) are told apart by the suffix in the file name and by the **SHA-256 hash** in the manifest.

## Privacy and network use

The tool talks only to the Dataverse environment of the active connection, through Power Platform ToolBox: it
reads solutions and agents, exports the solution you choose and, only if you confirm, writes the version of that
solution. It sends nothing anywhere else, has no telemetry and no network call of its own. The package is patched
on your computer and saved where you choose.

## Support and bugs

Report a bug or ask for a change in the [GitHub Issues](https://github.com/vincenzosgueradev/copilot-agent-nameplate/issues).
Give the tool version (shown in the tool), what you did, what you expected and what happened, and attach only a
**generated or anonymised** sample, never a real package or tenant data. A vulnerability goes to the private
reporting described in [SECURITY.md](SECURITY.md), not to a public issue.

## Development

```bash
npm install
npm run build
npm run validate       # pptb-validate
```

### Smoke Check

Verifies the invariant that underpins everything — one element modified, everything else
byte-identical — against a real export:

```bash
npm run smoke -- <path-to-zip> [suffix] [--publish=false]
```

Requires `@xmldom/xmldom` (devDependency): the production code runs in the browser and uses
`DOMParser`.

### Structure

```text
src/
├── app.ts                  routing, state, rendering
├── types.ts                domain entities
├── globals.d.ts            PPTB API on globalThis
├── baseline/
│   └── package-format.json reference fingerprint of the solution format, verified 2026-10-15
└── services/
    ├── dataverse.ts        reads only
    ├── solutions.ts        solutions and agents
    ├── export.ts           synchronous ExportSolution + async fallback
    ├── package.ts          package reading
    ├── compat.ts           format fingerprint, name occurrences, deviations
    ├── patch.ts            Patch Plan and targeted rewrite
    ├── rezip.ts            reconstruction and verification
    ├── packaging.ts        orchestrator
    ├── artifacts.ts        artifact set and manifest
    ├── history.ts          packaging history
    ├── files.ts            disk writes
    ├── log.ts              log with CSV/JSON export
    └── ui.ts               indicators and confirmation dialogs
```

## AI Assistance

A substantial part of this tool's code, tests, specifications and documentation was written with
an AI assistant (Claude, by Anthropic). The author directs the work, reviews the output, and is
responsible for the result. Behavior is covered by an automated test suite and by mutation checks,
and every change is verified with a type check, a build and the tests before it is released.

## Updates

Newest first. The full history is in [CHANGELOG.md](CHANGELOG.md). Rules: [docs/marketplace-page-standard.md](docs/marketplace-page-standard.md).

### 1.1.3 - 2026-10-31

- Changed the tool icon to an agent over a brass nameplate.
- Changed the README into the marketplace page, with screenshots, what the tool changes and does not cover, privacy and support.
- Fixed the review saying "Nothing is written to Dataverse" while the solution version is written to DEV.
- Fixed the marketplace page showing no README.

### 1.1.2 - 2026-10-27

- Changed the tool icon to an original coloured drawing that reads well on the dark and the light theme.
- Changed the agent type tooltips to "Standard harness" and "GitHub Copilot harness".
- Changed the tool to use only the active connection.
- Changed every error message to English.
- Removed the headless/MCP mode from the published tool and its documentation.
- Fixed permission and empty-package errors being reported as connection errors.

### 1.1.1 - 2026-10-26

- Added a confirmation dialog before the solution version is written to DEV.
- Added the light theme, which follows Power Platform ToolBox live.
- Added the README section "What this tool changes".
- Changed the tool name to **Agent Nameplate** and the author to Vincenzo Sguera.
- Fixed the version in the header, which still said `v0.1.0`.
- Fixed the "Package format" notice appearing for harmless new keys or folders.

### 1.1.0 - 2026-10-17

- Added the rename of the whole solution with one suffix, and publish on import per agent.
- Changed the version to be raised in DEV before the export, like the portal does, so DEV, package and target stay aligned.
- Fixed mixed names in one environment when only one agent of a solution was renamed.
- Fixed false warnings for agents created with the suffix, never connected to Teams, or sharing a display name.
- Fixed every screen so it opens at the top.

### 1.0.0 - 2026-10-16

- Added the first release: rename Copilot Studio agents inside a solution package, with the export, the entry-by-entry verification and the artifact set.

## License

MIT, see [LICENSE](LICENSE).

Specs live in [specs/](specs/); the project rules are in [.specify/memory/constitution.md](.specify/memory/constitution.md).
