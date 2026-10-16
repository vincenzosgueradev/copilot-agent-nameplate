# Copilot Agent Nameplate

**Rename Copilot Studio agents per environment — without an unmanaged layer.**

Produces a solution package where Copilot Studio agent display names are already set for the
target environment: the agent arrives in UAT or PROD **already wearing the right nameplate**,
instead of being renamed once it gets there. The difference between a clean package and an
unmanaged layer you carry forever.

## The Problem

When a solution containing a Copilot Studio agent lands in UAT or PROD, the agent carries its
DEV display name. Renaming it in the target environment **creates an unmanaged layer** on top of
the managed component: from that point on, that layer wins over every subsequent solution
upgrade, and the environment quietly drifts away from the package. The risk is not that `UPDATE`
might fail — it is that it might **succeed**, because the damage is silent.

## The Flow

```text
DEV → solution → ExportSolution ×2 (managed + unmanaged)
    → patch <name> in bots/<schema>/bot.xml
    → rezip + entry-by-entry verification
    → artifact set: patched pair + originals + manifest.json
                         └→ (optional) import into the target environment
```

The name lands in the **managed layer**, like any other property of the solution. The tool
**writes nothing to any environment**: it never touches `bot`, `botcomponent`, or environment
variables, and therefore cannot create layers. `pptb.config.json` declares `"write": []`, and
the empty list is intentional.

## What Gets Modified in the Package

**One element only**: the content of `<name>` inside `bots/<schemaname>/bot.xml`, one per agent.

`schemaname`, folder names, file names, GUIDs, `[Content_Types].xml`, and
`customizations.xml` are never touched. No global find-and-replace — the schema name appears in
**31 out of 34 entries**, and a blanket substitution would destroy the solution.

Optionally, `<Version>` in `solution.xml` (bump) and `publishOnImport` in
`configuration.json` can also be updated. Every other entry stays **byte-identical**, and the
tool verifies this entry by entry before delivering the file.

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

Two artifacts at the same `<Version>` are told apart by the **SHA-256 hash** in the manifest,
not by the version number: this is why forcing a version bump is unnecessary — it would only
create version drift across environments.

## Development

```bash
npm install
npm run build          # UI + headless entry point
npm run build-headless # headless entry point only
npm run validate       # pptb-validate
```

### Smoke Check

Verifies the invariant that underpins everything — one element modified, everything else
byte-identical — against a real export:

```bash
npm run smoke -- <path-to-zip> [suffix] [--bump] [--publish=false]
```

Requires `@xmldom/xmldom` (devDependency): the production code runs in the browser and uses
`DOMParser`.

### Structure

```text
src/
├── app.ts                  routing, state, rendering
├── types.ts                domain entities
├── globals.d.ts            PPTB API on globalThis (required by headless)
├── headless.ts             MCP interface
├── baseline/
│   └── package-format.json reference fingerprint of the solution format, verified 2026-10-15
└── services/
    ├── dataverse.ts        reads only (no writes, by design)
    ├── solutions.ts        solutions and agents
    ├── export.ts           synchronous ExportSolution + async fallback
    ├── package.ts          package reading
    ├── compat.ts           format fingerprint, name occurrences, deviations
    ├── patch.ts            Patch Plan and targeted rewrite
    ├── rezip.ts            reconstruction and verification
    ├── packaging.ts        orchestrator
    ├── artifacts.ts        artifact set and manifest
    ├── history.ts          packaging history
    ├── deploy.ts           optional import into target environment
    ├── files.ts            disk writes
    ├── log.ts              log with CSV/JSON export
    └── ui.ts               indicators and confirmation dialogs
```

## Documentation

Specs, decisions, and measurements: `specs/001-agent-rename-manager/`. In particular
`research.md`, which collects fifteen sections of verifications run against real data —
including every mistake made along the way and the reasoning behind each choice.

## License

MIT
