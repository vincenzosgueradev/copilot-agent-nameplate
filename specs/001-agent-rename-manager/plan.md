# Implementation Plan: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14 | **Revisione**: 2026-10-15 (packaging) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-agent-rename-manager/spec.md`

---

## Summary

Agent Rename Manager è un tool PPTB (web package HTML/TS) che produce il **package di una solution
con i display name degli agent già corretti per l'ambiente di destinazione**.

```text
DEV → solution → ExportSolution ×2 (managed + unmanaged)
     → patch <name> in bots/<schema>/bot.xml su entrambi gli archivi
     → rezip + verifica per archivio
     → artifact set: coppia patchata + originali + manifest.json
                              └→ (fase 2) deploySolution + polling import job
```

Il tool **prende il posto della pipeline** per le solution che contengono agent: il *pipelines
host* nativo proibisce la modifica dell'artefatto e distribuisce lo stesso artefatto managed a
tutti gli stage, quindi un package patchato non può entrarvi. Il principio resta identico — export,
artefatto immutabile, deploy del medesimo artefatto — e come il pipelines host il tool conserva la
coppia **managed + unmanaged** per ogni operazione (FR-083, research §10).

Il nome entra così nel **managed layer** dell'ambiente di destinazione. Il tool **non esegue
nessuna scrittura su Dataverse** in fase 1: non tocca `bot`, `botcomponent` né le environment
variable, e quindi non può creare unmanaged layer.

> **Revisione 2026-10-15 — cambio di architettura.** Il disegno originale rinominava gli agent
> con un `UPDATE` su `bot` nell'environment di destinazione. Su una solution managed questo crea un
> *unmanaged layer* che da quel momento vince su ogni upgrade della solution. Il rename live è
> stato **rimosso del tutto**, non reso opzionale. Vedi spec §Clarifications 2026-10-15,
> research §9 (anatomia del package verificata su export reale) e FR-067.

---

## Technical Context

**Language/Version**: TypeScript / ES2020+ (browser context dentro PPTB Electron)

**Primary Dependencies**:
- `window.dataverseAPI` — Dataverse Web API v9.2:
  - `ExportSolution` (azione unbound, `{SolutionName, Managed}`) → `ExportSolutionFile` in base64.
    **Due chiamate per operazione**, `Managed: true` e `Managed: false` (FR-084). Percorso primario
  - `ExportSolutionAsync` + polling `asyncoperations(<id>)` + `DownloadSolutionExportData` —
    **fallback automatico** quando il sincrono va in timeout (FR-093)
  - `deploySolution(content, options)` + `getImportJobStatus(importJobId)` — **solo fase 2**
  - letture: `solutions`, `bots`, `publishers`, `solutioncomponents`
- `window.toolboxAPI` — `fileSystem.saveFile` / `fileSystem.readBinary` (zip su disco),
  `settings` (storico packaging), notifiche
- **Una libreria zip bundlata** (`fflate`, preferita per dimensione, o `JSZip`) — deviazione
  consapevole dal vincolo originale "nessuna libreria NPM esterna": leggere e riscrivere un
  archivio zip a mano non è lavoro da riscrivere in casa
- ~~`window.powerplatformAPI` / PvaPublish~~ — non più necessario: `publishOnImport: true` nel
  package ripubblica l'agent all'import (FR-080)

**Storage**:
- **Artifact set** su disco, una cartella per operazione: coppia managed+unmanaged patchata, i due
  export originali e `manifest.json` con hash SHA-256 di ogni file (FR-083, FR-086)
- Store `settings` locale di PPTB: storico dei packaging (Packaging Record), retention 30 giorni,
  allineata alla cancellazione delle cartelle (FR-088)
- In-memory: i **due** package decompressi durante la sessione di packaging

**Testing**: validazione manuale in PPTB; `quickstart.md` definisce gli scenari end-to-end. Il
confronto entry-per-entry con l'export originale (SC-008) è la verifica automatica più importante

**Target Platform**: PPTB desktop app (Electron, Windows/Mac)

**Project Type**: PPTB web package tool (HTML/TS bundle + `pptb.config.json`)

**Performance Goals**: packaging completo (2 export + patch + rezip + verifica su entrambi) in
**< 2 minuti**, obiettivo confermato dalle misure: 13,4 s sulla solution più piccola e 111 s sulla
più pesante dell'environment di riferimento. In fallback asincrono il tempo sale a ~5 minuti e
l'interfaccia DEVE dirlo (FR-094). Test di carico su solution più grandi: da fare

**Constraints**:
- Costo dell'export **misurato** (research §13): coppia managed+unmanaged in 13,4 s
  (`testAgentTool`), 17,6 s (`SigmaMonitoringAgent`), 111 s (`FactoryHub`, 976 KB). Il fallback
  asincrono costa **154 s a prescindere dalla dimensione** (152 s di coda), quindi è un piano B,
  non il percorso normale (FR-093)
- Due archivi decompressi in memoria nel renderer: va misurato il consumo su una solution reale
  prima di dichiarare il limite
- Il package va ricostruito creando entry nuove: clonando l'header dell'entry sorgente l'archivio
  risulta illeggibile (research §9, FR-077)
- `<name>` è l'unico punto da patchare; `schemaname`, cartelle, file e GUID sono intoccabili
  (FR-069)
- Una solution **managed non è esportabile**: la sorgente deve essere l'environment in cui la
  solution è unmanaged (FR-068)
- Il manifest Teams non è nel package: il nome sui canali dipende dal publish e dal *Channel
  display name suffix* nativo (FR-079)
- Single tenant: nessuna gestione cross-tenant

**Scale/Scope**: più agent per package, 3-4+ environment, stesso tenant

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
│   ├── app.ts                # App init, routing, stato globale
│   ├── services/
│   │   ├── dataverse.ts      # Wrapper window.dataverseAPI (letture + paging)
│   │   ├── solutions.ts      # Lista solution, publisher prefix, agent contenuti
│   │   ├── export.ts         # ExportSolution sincrono + fallback asincrono (FR-093)
│   │   ├── package.ts        # Lettura zip: bot.xml, configuration.json, solution.xml,
│   │   │                     # environmentvariabledefinition.xml
│   │   ├── compat.ts         # Impronta del formato, baseline, drift, occorrenze del nome
│   │   │                     # (FR-096 → FR-098)
│   │   ├── patch.ts          # Patch Plan + riscrittura di <name> (e <Version> se richiesto)
│   │   ├── rezip.ts          # Ricostruzione archivio + verifica post-scrittura (FR-077)
│   │   ├── artifacts.ts      # Artifact set: cartella operazione, manifest.json, SHA-256
│   │   ├── deploy.ts         # FASE 2: deploySolution + polling import job
│   │   └── history.ts        # Packaging Record: salvataggio, retention, export
│   ├── components/
│   │   ├── SolutionExplorer/ # Step 1: solution e agent dell'environment sorgente
│   │   ├── SuffixSelector/   # Step 2: suffisso + opzioni (bump versione)
│   │   ├── PatchPreview/     # Step 3: cosa viene toccato e cosa no (FR-075)
│   │   ├── PackageResult/    # Step 4: esito, verifica per archivio, artifact set prodotto
│   │   ├── DeployPanel/      # FASE 2: scelta environment, import, avanzamento
│   │   └── HistoryPanel/     # Storico packaging
│   └── utils/
│       └── validation.ts     # Formato suffisso, avviso 30 caratteri (informativo)
│   └── baseline/
│       └── package-format.json  # Impronta di riferimento, verificata 2026-10-15 (FR-098).
│                                # Sta sotto src/ perche' Vite ha root: ./src e un import
│                                # fuori da quella radice non e'' garantito dal bundler.
└── tests/                    # Scenari di validazione manuale (vedere quickstart.md)
```

**Structure Decision**: Single web package PPTB. Nessun backend separato — tutto client-side via PPTB APIs già autenticate. La manipolazione del package avviene **in memoria nel renderer**: il file tocca il disco solo quando l'utente conferma il salvataggio.

---

## Complexity Tracking

| Deviazione | Motivo | Alternativa scartata |
|---|---|---|
| Libreria zip esterna bundlata (`fflate`/`JSZip`) | Il vincolo originale "nessuna libreria NPM esterna" non regge davanti a lettura/scrittura di archivi zip | Implementazione propria di deflate: superficie di bug sproporzionata rispetto al valore |
| Il tool produce un file invece di modificare l'environment | È esattamente il punto della revisione 2026-10-15: modificare l'environment di destinazione crea un unmanaged layer (FR-067) | Rename live mantenuto per il solo DEV: scartato, un flusso solo è un flusso che non si può usare male |
