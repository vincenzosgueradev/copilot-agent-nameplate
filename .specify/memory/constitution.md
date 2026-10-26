<!--
SYNC IMPACT REPORT (remove before commit)
==========================================
Version change: 1.2.0 → 1.3.0 (MINOR: new section Tool Standards → Testing Standard: test matrices,
independent oracle, negative tests, mutation check, gates before commit and release)
Earlier: 1.1.1 → 1.2.0 (MINOR: Publishing & Community → Release Changelog;
every release needs a CHANGELOG.md entry before it is published)
Earlier: 1.0.0 → 1.1.1 (1.1.0 added Principle VII; 1.1.1 clarified UI Layout Standards:
no emoji for status icons)
Added sections: Tool Standards → Testing Standard,
                Publishing & Community → Release Changelog,
                Core Principle VII (Enterprise UI & Navigation),
                Tool Standards → UI Layout Standards,
                Tool Standards → Navigation Standards,
                Tool Standards → Verified Metadata Values
Removed sections: none
TODOs deferred: none
==========================================
-->

# Power Platform Toolbox — Copilot Studio Tools Constitution

## Core Principles

### I. Gap-First — Build What Doesn't Exist

Every tool MUST solve a problem that is absent from the Power Platform Admin Center,
Copilot Studio UI, and the existing PPTB marketplace.

Before any tool is designed, a gap analysis MUST confirm that no official Microsoft surface
(PPAC, M365 Admin Center, Copilot Agent Kit, CoE Starter Kit) already covers the same
need. Tools that duplicate existing functionality are rejected regardless of implementation
quality.

**Rationale:** The project's purpose is to fill blind spots, not to recreate what Microsoft
ships. The differentiator is being first, deep, and community-visible in territory Microsoft
has not yet claimed.

### II. Copilot Studio First

All tools MUST target Copilot Studio agents as their primary subject. Power Platform
features outside Copilot Studio (Dataverse, Power Automate, Power Apps, etc.) are in scope
only when they directly serve agent visibility, governance, or ALM.

The primary data sources in priority order are:
1. Dataverse Web API — tables `bot` and `botcomponent` (via `window.dataverseAPI`)
2. Power Platform REST API — namespace `copilotstudio` (via `window.powerplatformAPI`)
3. Related Dataverse tables: `processes`, `connectionreference`, `conversationtranscript`

**Rationale:** Vincenzo's expertise and community positioning are in Copilot Studio. Every
tool published under this project MUST reinforce that identity.

### III. Deep Over Broad — Internal Agent Anatomy

Tools MUST prefer exposing the *internal structure* of agents (topic logic, variable scope,
node types, knowledge source configuration, trigger phrases, connection references) over
surface-level metadata (name, owner, publish date) that PPAC already shows.

Parsing the OBI YAML/JSON content of `botcomponent.data` is a first-class technique and
MUST be used wherever topic-level analysis is required.

**Rationale:** The admin center shows *that* agents exist. Our tools show *what they do
inside*. That depth is the unique value proposition.

### IV. Cross-Agent and Cross-Environment Vision

Where meaningful, tools MUST support analysis across multiple agents within an environment,
and across multiple environments using PPTB's multi-connection capability.

Single-agent, single-environment scope is acceptable only for tools that are inherently
scoped (e.g., a topic editor). Inventory, comparison, and conflict-detection tools MUST
support cross-agent or cross-environment views.

**Rationale:** The most impactful gaps — conflict detection, ALM diff, connector inventory —
only surface when you look across agents and environments simultaneously.

### V. Community Visibility by Design

Each tool MUST be built to demonstrate Vincenzo's expertise publicly. This means:
- Published on the PPTB marketplace with verified status as the target
- Documented with a clear description of *what gap it fills* and *why it matters*
- Named and described to be discoverable by the Copilot Studio community
- MCP-enabled (`invokeHeadless`) where the tool's output is consumable by AI agents

Tools are not internal utilities. Every tool is a public signal of expertise.

**Rationale:** The goal is community recognition. A tool that works but is invisible or
poorly described does not serve the project's mission.

### VI. Simplicity and Incremental Delivery

Each tool MUST ship as a working, useful artifact before scope is expanded. The minimum
viable version of a tool must be independently valuable.

- No tool may block another tool's release
- Parsing complexity (OBI YAML) is introduced only when required for that tool's core value
- UI complexity (graphs, diagrams) is introduced only after the data layer is validated

**Rationale:** Shipping one complete tool beats designing three perfect ones. Community
feedback on a live tool shapes the next iteration better than upfront planning.

### VII. Enterprise UI and Navigation

Every tool MUST look and behave like enterprise software, not like a demo. Concretely:

- **Full width, responsive.** The tool fills the width of its PPTB container. Fixed
  `max-width` wrappers that leave large dead space are prohibited. Layouts MUST adapt
  down to a narrow pane without horizontal page scrolling.
- **Data density.** Lists of records are presented as tables with meaningful columns,
  sticky headers, and sortable/filterable affordances where the dataset warrants it —
  not as decorative cards.
- **Navigable hierarchy.** Any flow deeper than one level MUST expose a breadcrumb so the
  user can step back one level at a time. A single "back to start" action is not sufficient.
- **No redundant chrome.** A column or badge whose value is identical on every row MUST be
  removed and stated once in the header instead.
- **Honest empty and error states.** An empty result MUST say why it is empty, naming the
  active filter or search term. Silent blank states are prohibited.

**Rationale:** These tools are a public signal of expertise (Principle V). A tool that is
functionally correct but visually amateurish undermines the credibility it exists to build.
Enterprise users also judge trustworthiness by interface quality before they judge features.

## Tool Standards

### UI Layout Standards
- The root layout fills 100% of the available width and height; no fixed-width page wrapper
- Scrolling belongs to the inner data panel, not the page shell, so sticky table headers
  anchor to the data region rather than sitting below the shell's padding
- Table headers are `position: sticky` with `border-collapse: separate` (with `collapse`,
  the header's borders scroll away)
- Status and action icons are drawn with CSS shapes or basic text glyphs (`✓`, `✕`, `›`), never
  emoji: emoji render as empty boxes in some fonts. Where a destructive action needs a visible
  marker, use colour and a label, not a pictograph
- No browser-default checkboxes anywhere in the UI. A yes/no choice is a styled control that
  follows the theme: a toggle switch (`.switch`) for options, a round two-colour check
  (`.check`: ring in the theme colour, filled centre when ticked) for row selection in tables.
  A "select all" check shows a dash when only some rows are on
- Long text truncates with ellipsis; the full value is available via `title`
- Theme colors are read from CSS custom properties — no hard-coded hex values in markup

### Navigation Standards
- Multi-step flows MUST render a breadcrumb reflecting the full path from root to the
  current step
- Every breadcrumb segment except the current one MUST be clickable and navigate to exactly
  that level, preserving the selections made above it
- Going back MUST NOT discard the parent context (returning from an agent to its solution
  keeps that solution selected)
- The breadcrumb is the primary back affordance; a bare "back to root" button is not enough

### Verified Metadata Values
- Numeric Dataverse metadata values (`componenttype`, state codes, option set values) MUST
  be verified against the official Microsoft Learn entity reference before use, and the
  source cited in `research.md`
- **A wrong `componenttype` in a `$filter` returns zero rows with no error.** This fails
  silently and looks like missing data. Never guess the value
- There is **no documented `componenttype` value for Bot/Agent**. To resolve which solution
  a bot belongs to, filter `solutioncomponent` by `objectid` against known bot ids, or read
  the documented `bot.solutionid` column — never filter by `componenttype`
- Known-correct values: `380` = Environment Variable Definition, `381` = Environment
  Variable Value, `300` = Canvas App, `371`/`372` = Connector

### Data Access
- All Dataverse reads use `window.dataverseAPI` with explicit `$select` to minimize payload
- All Power Platform API calls use `window.powerplatformAPI` with `api-version=2024-10-01`
  for the `copilotstudio` namespace
- The deprecated `powervirtualagents` namespace MUST NOT be used
- Classic chatbots (non-V2 agents) are out of scope unless explicitly stated

### Key Dataverse Queries (canonical patterns)
- List all agents: `GET /bots?$select=botid,name,published,authenticationmode,configuration`
- List topics V2: `GET /botcomponents?$filter=_parentbotid_value eq '{id}' and componenttype eq 9`
- List variables V2: `GET /botcomponents?$filter=... and componenttype eq 12`
- List knowledge sources: `GET /botcomponents?$filter=... and componenttype eq 16`
- List external triggers: `GET /botcomponents?$filter=... and componenttype eq 17`

### ComponentType reference (key values)
| Code | Type | Use |
|---|---|---|
| 9 | Topic (V2) | Topic logic — OBI YAML in `data` field |
| 11 | Bot entity (V2) | Entities and slot filling |
| 12 | Bot variable (V2) | Variables |
| 15 | Custom GPT | Agent description and instructions |
| 16 | Knowledge Source | Knowledge configuration |
| 17 | External Trigger | Autonomous agent indicator |
| 18 | Copilot Settings | Agent settings |

### Trusted Research Sources
- Microsoft Copilot Studio CAT Blog: https://microsoft.github.io/mcscatblog/archives/
- Microsoft Learn — botcomponent reference
- Microsoft Learn — Power Platform REST API copilotstudio namespace
- Microsoft Learn — Copilot Studio admin API docs (quarantine, delete, reassign, evaluations)

### Testing Standard

Every decision a tool makes MUST be covered by a **test matrix**, not by examples. Passing tests
prove nothing unless they would fail in front of a real defect.

1. **Matrix, not examples.** A function or behavior with more than one input dimension MUST be
   tested over every combination of its dimensions while the space stays up to about a million
   cases; beyond that, over every *pair* of values of any two dimensions plus seeded random
   samples. The exhaustive run MUST remain available (`npm run test:full`).
2. **Independent oracle.** The expected result is written from the spec, with no code shared with
   `src/`. A test that recomputes the answer with the code under test cannot fail.
3. **Real code path.** Pipeline and UI tests run the production code and replace only the outside
   world: Dataverse, the file system, the PPTB API. The UI is tested by loading the real page.
4. **Negative tests.** Anything that verifies or validates MUST be tested against the inputs it
   has to reject, not only against the ones it accepts.
5. **Mutation check.** The suite MUST catch deliberately broken variants of the code
   (`npm run test:mutation`). A surviving variant is a missing test and is fixed before the work
   is declared done.
6. **Test first for defects.** A defect found by hand is reproduced by a failing test before it is
   fixed, and the same test stays.
7. **No tenant data.** Fixtures are generated; real exports and artifact sets are never committed.
8. **Gates.** `npm test` and `tsc` pass before every commit that touches code; `npm run test:full`
   and `npm run test:mutation` pass before every release.
9. **Say what is not covered.** What tests cannot see (pixels, the real behavior of Dataverse)
   MUST be listed in the feature's quickstart as a manual check, with the result recorded.

**Rationale:** the first line of defense against a silent error is a test that was designed to
find it. Examples find the bugs we already thought of; matrices, oracles and mutations find the
others.

## Publishing & Community

### Tool Validation Gate
Before publishing to the PPTB marketplace, each tool MUST pass:
1. Local PPTB validation (`pptb validate`)
2. Marketplace policy review (no undocumented/undeclared external calls)
3. Self-review against Gap Principle (I): confirm the tool is not duplicating PPAC

### Target Metrics (per tool)
- Clear one-paragraph description that names the gap it fills
- Category tags: must include at least one of `Copilot Studio` related categories
- MCP-enabled where the output is structured data (agent lists, topic maps, conflict reports)

### Release Changelog

Every release of a tool MUST be documented in a `CHANGELOG.md` at the repository root
**before** it is published. The file follows *Keep a Changelog* and Semantic Versioning:

1. One section per version, newest first, headed `## [x.y.z] - YYYY-MM-DD`. The entry for a
   version MUST exist in the commit that precedes its `npm publish`, and its number MUST match
   the version that publish produces.
2. Changes are grouped under **Added**, **Changed**, **Fixed**, **Removed**, **Security**.
   A release that asks something of the user (migration, re-export, changed behavior of
   saved data) MUST also carry an **Upgrade notes** section.
3. Entries are written for the person who installs the tool, not for the developer: say what
   changed *for them* and why it matters, not which function moved. A bug fix states the
   symptom that was seen, not only the cause.
4. A behavior change that contradicts what a previous version did MUST be listed under
   **Changed** even when it is a fix, so the version bump can be understood from the file alone.
5. The version of the newest changelog entry MUST equal the `version` in `agent-nameplate/package.json`
   at the time of publishing. (The `version` fields inside `pptb.config.json` are schema
   versions of the invocation and agents contracts, not the tool's version.)

**Rationale:** the author and the users of a tool must be able to tell, from one file, what
each version brought and whether it is safe to upgrade. Commit messages record the work; the
changelog records the release.

### Roadmap Priority Order
1. **Agent Deep Inspector** — internal anatomy of a single agent (quick win, establishes
   data patterns for all other tools)
2. **Agent Conflict Analyzer** — cross-agent trigger phrase overlap detection (highest
   community impact, no equivalent exists anywhere)
3. **Variable Flow Map** — variable scope and data flow within an agent
4. **Agent Connector Inventory** — cross-agent connector usage matrix
5. **Agent Environment Diff** — ALM diff of the same agent across environments

## Governance

This constitution supersedes all other practices and conventions for this project.
Amendments require:
1. A documented rationale explaining why the change is needed
2. A version bump following semantic versioning:
   - MAJOR: removal or redefinition of an existing principle
   - MINOR: new principle or section added
   - PATCH: clarification or wording fix
3. Update of `LAST_AMENDED_DATE` to the date of the amendment

All tool designs and implementations MUST be reviewed against all seven Core Principles
before build begins. A tool that violates Principle I (gap-first) or Principle II
(Copilot Studio first) MUST NOT proceed to implementation.

The Roadmap Priority Order in the Publishing section is advisory, not binding — it may be
reordered based on community feedback or discovery of higher-impact gaps.

**Version**: 1.3.0 | **Ratified**: 2026-10-14 | **Last Amended**: 2026-10-18
