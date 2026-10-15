<!--
SYNC IMPACT REPORT (remove before commit)
==========================================
Version change: 1.0.0 → 1.1.1 (1.1.0 added Principle VII; 1.1.1 clarified UI Layout Standards:
no emoji for status icons)
Added sections: Core Principle VII (Enterprise UI & Navigation),
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

**Version**: 1.1.1 | **Ratified**: 2026-10-14 | **Last Amended**: 2026-10-15
