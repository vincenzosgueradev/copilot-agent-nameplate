# Implementation Plan: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-agent-rename-manager/spec.md`

---

## Summary

Agent Rename Manager è un tool PPTB (web package HTML/JS) che consente di rinominare in modo idempotente tutti gli agent Copilot Studio di una solution, utilizzando una environment variable per solution (`{prefix}_AgentDisplaySuffix`) come suffisso ambiente. Il tool aggiorna `bot.name`, il manifest Teams (`applicationmanifestinformation`) e la description (`botcomponent` tipo 15), con backup automatico, log persistente locale e step di Publish opzionale per attivare le modifiche sui canali Teams/M365.

---

## Technical Context

**Language/Version**: JavaScript (ES2020+, browser context dentro PPTB Electron)

**Primary Dependencies**:
- `window.dataverseAPI` — Dataverse Web API v9.2 (bot, botcomponent, solution, environmentvariabledefinition, solutioncomponent)
- `window.powerplatformAPI` — Power Platform REST API namespace `copilotstudio` (PvaPublish)
- `window.toolboxAPI` — PPTB utility API (notifiche, file system locale per log/backup)
- Nessuna libreria NPM esterna — bundle self-contained

**Storage**:
- In-memory: stato sessione corrente (AgentRenameSession)
- File locale (via PPTB toolboxAPI): log JSON e backup JSON, cartella configurabile, retention 30 giorni default

**Testing**: Validazione manuale in PPTB sandbox; quickstart.md definisce gli scenari di validazione end-to-end

**Target Platform**: PPTB desktop app (Electron, Windows/Mac)

**Project Type**: PPTB web package tool (HTML/JS bundle + `pptb.config.json`)

**Performance Goals**: Rename completo di 50+ agent in < 5 minuti (SC-001); caricamento progressivo lista agent

**Constraints**:
- Dataverse OData: max 5000 record per page (gestione `@odata.nextLink`)
- Teams manifest `name.short` ≤ 30 caratteri (FR-019)
- Solution managed: PATCH su bot in managed solution richiede verifica (vedere research.md §3)
- Single tenant: nessuna gestione cross-tenant

**Scale/Scope**: 50+ agent per solution, 3-4+ environment, stesso tenant

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Status | Note |
|---|---|---|
| I. Gap-First | ✅ PASS | Nessun tool equivalente in PPAC, Copilot Studio UI o PPTB marketplace. Microsoft suffix feature ancora non disponibile nei tenant (ottobre 2026). |
| II. Copilot Studio First | ✅ PASS | Fonte primaria: tabelle `bot` e `botcomponent` via `window.dataverseAPI`. Tabelle ausiliarie (solution, environmentvariabledefinition) in scope diretto per ALM agent. |
| III. Deep Over Broad | ✅ PASS | Il tool tocca `applicationmanifestinformation` (manifest Teams interno) e `botcomponent` tipo 15 (description) — anatomia interna dell'agent, non solo metadata superficiale. |
| IV. Cross-Agent/Cross-Env | ✅ PASS | Opera su tutti gli agent di una solution; supporta multi-connection PPTB per view cross-environment. |
| V. Community Visibility | ✅ PASS | Progettato per pubblicazione PPTB marketplace; `invokeHeadless` da implementare per MCP. |
| VI. Simplicity & Incremental | ✅ PASS | MVP: rename + publish. Nessun parser OBI YAML richiesto. UI incrementale (Solution Explorer → Preview → Apply → Publish). |

**Risultato**: Tutti i gate PASS. Nessuna violazione da giustificare.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-rename-manager/
├── plan.md              # Questo file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── pptb-config.md   # pptb.config.json contract
│   └── headless-api.md  # invokeHeadless MCP contract
└── tasks.md             # Phase 2 output (/speckit-tasks — non creato qui)
```

### Source Code (repository root)

```text
tools/agent-rename-manager/
├── pptb.config.json          # Metadata tool PPTB
├── index.html                # Entry point
├── src/
│   ├── main.js               # App init, routing, state globale
│   ├── services/
│   │   ├── dataverse.js      # Wrapper window.dataverseAPI con paging
│   │   ├── solutions.js      # Lista solutions, publisher prefix
│   │   ├── agents.js         # Lista agent per solution, dettagli bot
│   │   ├── envvariables.js   # CRUD environmentvariabledefinition/value
│   │   ├── rename.js         # Logica strip/apply suffisso, calcolo nome base
│   │   ├── manifest.js       # Parse/update applicationmanifestinformation JSON
│   │   ├── publish.js        # PvaPublish + polling status
│   │   ├── backup.js         # Snapshot pre-operazione, restore
│   │   └── log.js            # Log append, export CSV/JSON, retention
│   ├── components/
│   │   ├── SolutionExplorer/ # Step 1: lista environment/solution/agent
│   │   ├── SuffixSelector/   # Step 2: selettore suffisso predefiniti + testo libero
│   │   ├── RenamePreview/    # Step 3: tabella before/after con stato per agent
│   │   ├── ApplyProgress/    # Step 4: progress in tempo reale per agent
│   │   ├── PublishPanel/     # Step 5: publish per agent con Teams
│   │   └── LogPanel/         # Sidebar: log operazioni, export, backup viewer
│   └── utils/
│       ├── storage.js        # File locale via toolboxAPI (log, backup)
│       └── validation.js     # Validazioni (nome ≤30 char, permessi, ecc.)
└── tests/                    # Scenari validazione manuale (vedere quickstart.md)
```

**Structure Decision**: Single web package PPTB. Nessun backend separato — tutto client-side via PPTB APIs già autenticate.

---

## Complexity Tracking

Nessuna violazione Constitution Check — sezione non applicabile.
