---

description: "Task list for Agent Rename Manager — packaging flow"
---

# Tasks: Agent Rename Manager

**Input**: Design documents from `/specs/001-agent-rename-manager/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Generato**: 2026-10-15, dalla spec rivista (processo di packaging, FR-067 → FR-102)

**Tests**: La spec non richiede test automatici (`plan.md` → *Testing: validazione manuale in PPTB*). Non sono generati task di test unitari; la validazione è quella di `quickstart.md`, con i controlli di integrità che sono **funzionalità del prodotto** (FR-077, FR-085) e non test.

**Organization**: Task raggruppati per user story. Ogni fase è un incremento indipendente e testabile.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Eseguibile in parallelo (file diversi, nessuna dipendenza da task incompleti)
- **[Story]**: User story di appartenenza (US1–US6)
- Percorsi relativi alla radice del repository

## Path Conventions

Il tool vive in `tools/` (vedi `tools/package.json`). Il codice sorgente attuale è `tools/src/app.ts` (flusso superato) e `tools/src/backups.ts`. La struttura di destinazione è quella di `plan.md`, calata su `tools/`:

```text
tools/
├── pptb.config.json
├── baseline/package-format.json
└── src/
    ├── app.ts            # routing, stato, wiring
    ├── types.ts
    ├── services/
    └── components/
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dipendenze, struttura e metadati del tool

- [x] T001 Aggiungere la libreria zip a `tools/package.json`: `fflate` in `dependencies`, versione esatta, e verificare che il bundle Vite la includa (vedi plan.md → *Primary Dependencies*; deviazione consapevole dal vincolo "nessuna libreria NPM esterna", motivata in plan.md → *Complexity Tracking*)
- [x] T002 Creare le cartelle `tools/src/services/`, `tools/src/components/` e `tools/baseline/`
- [x] T003 [P] Creare `tools/pptb.config.json` esattamente come da `contracts/pptb-config.md`: `version: "2.0.0"`, `permissions.dataverse.write: []` (volutamente vuoto, FR-067), `read: [bots, solutions, publishers, solutioncomponents, environmentvariabledefinitions]`, `actions: [ExportSolution, ImportSolution]`, `localFiles.readWrite: true`
- [x] T004 [P] Creare `tools/baseline/package-format.json` con i valori verificati in research.md §14: `solutionPackageVersion: "9.2"`; `botElements: [authenticationmode, authenticationtrigger, iconbase64, iscustomizable, language, name, runtimeprovider, template, timezoneruleversionnumber]`; `botComponentElements: [componenttype, iscustomizable, name, parentbotid, statecode, statuscode]`; `configurationKeys: [$kind, channels, settings, isAgentConnectable, publishOnImport, gPTSettings, isLightweightBot, aISettings, recognizer, deferredProvisioning]`; `topLevelPaths: [bots/, botcomponents/, environmentvariabledefinitions/, solution.xml, customizations.xml, [Content_Types].xml]`. Includere `verifiedOn: "2026-10-15"` e `verifiedAgainst: "testAgentTool 1.0.0.2"` (FR-098)
- [x] T005 [P] Aggiornare `tools/package.json` (`displayName`, `description`) per riflettere il nuovo scopo: produzione del package, non rename live

**Checkpoint**: il progetto compila e dichiara i permessi corretti

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Rimozione del flusso superato e strato dati condiviso

**⚠️ CRITICAL**: nessuna user story può iniziare prima che questa fase sia completa. In particolare T006: finché esiste codice che scrive su `bot`, il difetto che ha originato la revisione può ripresentarsi.

- [x] T006 Rimuovere da `tools/src/app.ts` tutto il flusso di scrittura su Dataverse: `runApply`, `upsertEnvVariable`, `performRollback`, `runRollbackStep`, `markRolledBack`, `rollbackWarnings`, `readAgentNames`, `buildBackupEntry`, `saveBackup` e i rami UI collegati (`renderApplyStep`, `renderApplyResult`). **Nessuna chiamata `dataverse.update/create/delete` deve sopravvivere** (FR-067, SC-010)
- [x] T007 Eliminare `tools/src/backups.ts` e ogni import residuo: l'entità `BackupRecord` è sostituita da `PackagingRecord` (data-model.md → *Entità rimosse rispetto alla v1*)
- [x] T008 Rimuovere da `tools/src/app.ts` il rilevamento "Locked" / managed property (`isManagedPropertyError`, `LOCKED_EXPLANATION`, `lockedBannerHtml`, `readLockedAgents`, campo `isLocked`): irrilevante, il tool non modifica più componenti managed (FR-063 superato)
- [x] T009 Creare `tools/src/types.ts` con le entità di data-model.md: `PackagingSession`, `PackagingOptions` (`publishOnImport: 'keep' | 'force-true' | 'force-false'`, default `'keep'`; `bumpVersion: boolean` default `false`; `keepSourceArtifacts: boolean` default `true`), `PackageContents`, `PackageEntry`, `PackagedAgent` (`publishOnImport: boolean | null`, dove **`null` = campo assente**), `PackagedVariable`, `PackageComponent`, `FormatFingerprint`, `FormatDrift` (`blocking` **sempre `false`**), `NameOccurrence`, `PatchChange` (`element: 'name' | 'Version' | 'publishOnImport'`), `VerificationResult`, `ArtifactSet`, `ArtifactFile` (`role: 'deploy' | 'source' | 'restore'`), `PackagingRecord`, `DeploymentRecord`, `LogEntry`
- [x] T010 [P] Creare `tools/src/services/dataverse.ts`: wrapper di sola lettura su `window.dataverseAPI` con `$select` esplicito e gestione `@odata.nextLink` (constitution → *Data Access*). **Non esporre alcun metodo di scrittura**
- [x] T011 [P] Creare `tools/src/services/log.ts`: `LogEntry` in memoria, livelli `info | success | warning | error`, export CSV/JSON (FR-016, FR-017)

**Checkpoint**: il tool non può più scrivere su nessun environment. Fondamenta pronte.

---

## Phase 3: User Story 1 — Selezione della solution e lettura del contesto (Priority: P1) 🎯 MVP

**Goal**: l'utente connesso a DEV trova la solution sorgente, ne vede gli agent e capisce se è utilizzabile per il packaging.

**Independent Test**: connesso a DEV, l'utente trova `testAgentTool`, ne apre il dettaglio e vede `agenteTool1` con stato e date; selezionando una solution managed riceve la spiegazione che non è esportabile.

- [x] T012 [US1] Creare `tools/src/services/solutions.ts`: lista solution visibili, non di sistema, con almeno un agent (FR-026); campi `solutionid, uniquename, friendlyname, version, ismanaged, isvisible, _publisherid_value`; publisher e `customizationprefix` da `publishers` (data-model.md → *Dataverse Source Entities*)
- [x] T013 [US1] In `tools/src/services/solutions.ts`, risolvere l'appartenenza degli agent **filtrando `solutioncomponent` per `objectid`** sugli id dei bot già noti, oppure leggendo `bot.solutionid`. **Mai** filtrare per un `componenttype` supposto (FR-024, FR-025; constitution → *Verified Metadata Values*)
- [x] T014 [US1] Marcare le solution **managed** come non esportabili nel modello (`exportable: false`) e mostrarlo nella UI con la spiegazione «You can't export managed solutions» e l'indicazione di operare nell'environment in cui la solution è unmanaged (FR-068, US1 scenario 2)
- [x] T015 [US1] Nel dettaglio solution, segnalare l'eventuale environment variable di tipo String come candidata al *Channel display name suffix* nativo, **in sola lettura**, precisando che riguarda solo Teams e M365 Copilot, in `tools/src/components/SolutionExplorer/` (FR-089, US1 scenario 3)
- [x] T016 [US1] In `tools/src/components/SolutionExplorer/`, verificare che l'assenza di environment variable **non blocchi** il packaging (US1 scenario 4)

**Checkpoint**: la scelta della sorgente è completa e onesta su cosa è utilizzabile.

---

## Phase 4: User Story 2 — Package: export, patch e zip (Priority: P1) 🎯 MVP

**Goal**: dalla solution scelta e da un suffisso, produrre lo zip managed con i nomi corretti.

**Independent Test**: da `testAgentTool` con suffisso `UAT` si ottiene un archivio in cui `bots/ava_agenteTool1/bot.xml` contiene `<name>agenteTool1 [UAT]</name>` e **ogni altra entry è byte-identica** all'export originale.

### Export

- [x] T017 [US2] Creare `tools/src/services/export.ts` con il percorso **sincrono**: `POST ExportSolution { SolutionName, Managed }` → `ExportSolutionFile` (base64) → `Uint8Array`. **Due chiamate per operazione**, `Managed: true` e `Managed: false` (FR-084). Tempi attesi misurati: ~13 s la coppia su `testAgentTool`, ~111 s su `FactoryHub` (research.md §13)
- [x] T018 [US2] In `tools/src/services/export.ts`, aggiungere il **fallback asincrono** automatico su timeout o errore di servizio: `ExportSolutionAsync` → polling `asyncoperations(<AsyncOperationId>)` fino a `statecode = 3` e `statuscode = 30` → `DownloadSolutionExportData { ExportJobId }`. Il polling DEVE usare **solo** `$select=statecode,statuscode`: una colonna inesistente restituisce **HTTP 400** (FR-093, FR-094, research.md §13)
- [x] T019 [US2] Registrare `exportMode: 'sync' | 'async'` e `exportSeconds` per ogni archivio; il passaggio al fallback DEVE essere dichiarato nella UI mentre avviene, senza chiedere nulla all'utente (FR-093)
- [x] T020 [US2] Se **entrambi** i percorsi falliscono, non produrre alcun file ed emettere l'errore `EXPORT_FAILED` (contracts/headless-api.md)

### Lettura del package

- [x] T021 [P] [US2] Creare `tools/src/services/package.ts`: apertura dell'archivio con `fflate`, lettura di `solution.xml` (`UniqueName`, `Version`, `Managed`, publisher, `CustomizationPrefix`), di ogni `bots/<schemaname>/bot.xml` (attributo `schemaname`, elemento `<name>`) e di `bots/<schemaname>/configuration.json` (`publishOnImport`, `channels[].channelId`) — struttura verificata in research.md §9
- [x] T022 [P] [US2] In `tools/src/services/package.ts`, leggere `environmentvariabledefinitions/<schema>/environmentvariabledefinition.xml` in **sola lettura** (schemaname, `<type>`, `<defaultvalue>`): serve solo al rilevamento del doppio suffisso (FR-089)
- [x] T023 [US2] Se il package non contiene nessuna cartella `bots/`, fermarsi con `NO_AGENTS_IN_PACKAGE` invece di produrre un file identico all'originale (spec → Edge Cases)
- [x] T024 [US2] Se `bot.xml` non contiene `<name>` nel formato atteso, **fermarsi su quell'agent indicando il percorso del file**, senza tentare sostituzioni approssimative (FR-069, errore `BOT_NAME_ELEMENT_MISSING`)

### Patch

- [x] T025 [US2] Creare `tools/src/services/patch.ts` con il calcolo del nome: leggere `<name>` **dal package** (mai da Dataverse); se termina con ` [X]` dove `X` è di **1–20 caratteri tra parentesi quadre**, rimuoverlo per ottenere il nome base; poi appendere ` [SUFFISSO]`. Suffisso vuoto ⇒ resta il nome base. L'operazione DEVE essere idempotente: `agenteTool1 [DEV]` + `UAT` → `agenteTool1 [UAT]`, **mai** `agenteTool1 [DEV] [UAT]` (FR-071, SC-002)
- [x] T026 [US2] In `tools/src/services/patch.ts`, riscrivere **esclusivamente** il contenuto dell'elemento `<name>` di `bots/<schemaname>/bot.xml`. NON modificare `schemaname`, nomi di cartella, nomi di file, GUID, `[Content_Types].xml`, `customizations.xml`, e **non eseguire sostituzioni testuali globali** (FR-069, FR-101). Lo schemaname compare in **31 entry su 34**: una sostituzione globale distruggerebbe la solution (research.md §14)
- [x] T027 [US2] Implementare l'opzione `bumpVersion`: incremento dell'ultimo segmento di `<Version>` in `solution.xml`, **disattivata di default**, con la spiegazione in UI della differenza fra *update* (stessa versione) e *upgrade* (versione superiore) (FR-073)
- [x] T028 [US2] Implementare `publishOnImport` a **tre stati** in `bots/<schemaname>/configuration.json`: `keep` (default, **non tocca il file**), `force-true`, `force-false`. Mostrare il valore trovato per ogni agent e dichiarare **"non specificato"** quando il campo è assente — 28 agent su 40 nell'environment di riferimento, e il comportamento di default all'import non è documentato da Microsoft (FR-090, research.md §12)
- [x] T029 [US2] In `tools/src/services/patch.ts`, supportare la selezione per agent: gli agent **non selezionati** restano byte-identici (FR-076)

### Rezip e verifica

- [x] T030 [US2] Creare `tools/src/services/rezip.ts`: ricostruzione dell'archivio **creando entry nuove** (filename, date_time, compress_type, external_attr), **mai clonando l'header dell'entry sorgente** — l'offset originale rende l'archivio illeggibile (`Overlapped entries … possible zip bomb`), errore riscontrato davvero (FR-077, research.md §9)
- [x] T031 [US2] In `tools/src/services/rezip.ts`, implementare la verifica post-scrittura: archivio riapribile, numero di entry uguale all'originale, valore di `<name>` riletto e confermato per ogni agent patchato, conteggio delle entry byte-identiche. La verifica DEVE confrontare le **entry una per una** e **mai la dimensione del file**: il rezip produce 31.469 byte contro 32.544 a parità di contenuto, perché il compressore è diverso (FR-070, FR-077, FR-095, research.md §13)
- [x] T032 [US2] In `tools/src/services/patch.ts` e `tools/src/services/rezip.ts`, applicare lo **stesso Patch Plan** a entrambi gli archivi (managed e unmanaged), con verifica indipendente su ciascuno. Se la verifica fallisce anche su **uno solo** dei due, l'intero artifact set è dichiarato non valido (FR-085)

### Anteprima

- [x] T033 [US2] Creare `tools/src/components/PatchPreview/`: per ogni agent `nome nel package → nome nuovo`, il percorso esatto del file toccato, lo stato (`no-change` / `suffix-added` / `suffix-changed` / `suffix-removed`), le opzioni attive e l'elenco esplicito di ciò che **non** viene toccato (FR-075)
- [x] T034 [US2] Nell'anteprima, mostrare l'avviso **non bloccante** oltre i 30 caratteri, spiegando che il limite riguarda il manifest Teams, il cui nome deriva da `bot.name` (FR-019, FR-079)
- [x] T035 [US2] Nell'anteprima, dichiarare come arriva il nome sui canali: copia di `bot.name` scattata **al publish**, in ciascun environment; e avvisare in modo prominente quando il risultato è che l'agent **non** verrà pubblicato (FR-079, FR-080)

**Checkpoint**: il cuore del tool funziona — si ottiene uno zip corretto e verificato.

---

## Phase 5: User Story 3 — Artifact set, ripristino e tracciabilità (Priority: P1) 🎯 MVP

**Goal**: ogni operazione lascia sul disco un insieme di artefatti completo, tracciabile e ripristinabile.

**Independent Test**: due packaging dalla stessa versione con suffissi diversi producono due cartelle con `manifest.json` che riportano lo stesso `source.version` ma hash SHA-256 diversi.

- [x] T036 [US3] Creare `tools/src/services/artifacts.ts`: cartella di operazione `{UniqueName}_{Version}_{SUFFISSO}_{yyyyMMdd-HHmmss}` contenente `manifest.json`, `{UniqueName}_{Version}_managed_{SUFFISSO}.zip` (`role: deploy`), `{UniqueName}_{Version}_unmanaged_{SUFFISSO}.zip` (`role: source`), `source_managed.zip` e `source_unmanaged.zip` (`role: restore`) (FR-083, FR-074)
- [x] T037 [US3] Calcolare lo **SHA-256** di ogni file e scriverlo nel `manifest.json` con nome, ruolo, `managed`, `patched`, dimensione, numero di entry ed esito della verifica. È ciò che distingue due artefatti della stessa `<Version>` senza ricorrere a un bump (FR-086, SC-011)
- [x] T038 [US3] Scrivere nel `manifest.json` anche: identificativo e data/ora dell'operazione, utente, environment sorgente, solution, versione, publisher, suffisso, agent patchati `prima → dopo`, opzioni attive, `export: { mode, seconds }`, impronta del formato, scostamenti rilevati e conferme date dall'utente (FR-086, FR-100)
- [x] T039 [US3] Inserire nel `manifest.json` la dichiarazione prevista da FR-102: il package è stato modificato dal tool su **un solo elemento**, Microsoft non supporta la modifica manuale dei file di una solution, e `source_managed.zip` non modificato è nella stessa cartella
- [x] T040 [US3] Etichettare l'artefatto `role: source` (unmanaged patchato) come **non destinato a UAT/PROD** nel manifest, nell'esito e nella History: importarlo a valle creerebbe una solution unmanaged (FR-087)
- [x] T041 [US3] Rendere disattivabile la conservazione degli originali (`keepSourceArtifacts`), mostrando lo spazio occupato dall'artifact set (FR-078, FR-088)
- [x] T042 [US3] Chiedere conferma prima di sovrascrivere una cartella di artifact set esistente (FR-074, errore `OUTPUT_FILE_EXISTS`)
- [x] T043 [US3] Creare `tools/src/services/history.ts`: `PackagingRecord` nello store `settings` locale di PPTB, retention 30 giorni e massimo 200 voci, scritture serializzate e rilette a ogni salvataggio (più copie del tool possono essere aperte insieme), cancellazione della voce che elimina anche la cartella (FR-088, FR-060)
- [x] T044 [US3] Creare `tools/src/components/HistoryPanel/`: tabella con data/ora, environment sorgente, solution, versione, suffisso, agent `prima → dopo`, percorso della cartella, esito della verifica **per archivio** e spazio occupato. **Nessuna azione di rollback**: non c'è nulla da annullare (FR-078)
- [x] T045 [US3] Creare `tools/src/components/PackageResult/`: esito con i percorsi dei file, il blocco di verifica per archivio e l'indicazione inequivocabile di **quale solo file** va importato in UAT/PROD

**Checkpoint**: MVP completo — si produce un artefatto tracciabile e si sa sempre cosa è stato prodotto.

---

## Phase 6: User Story 3b — Rete di sicurezza sul formato (Priority: P1)

**Goal**: il tool si accorge se il formato del package cambia, prima di produrre un artefatto sbagliato.

**Independent Test**: su `testAgentTool` il display name risulta in **1 sola entry su 34** e nessun blocco scatta; simulando un'occorrenza in un punto non noto, il packaging si ferma.

- [x] T046 [US3] Creare `tools/src/services/compat.ts` con la ricerca delle occorrenze del display name come **testo esatto di un elemento XML o valore esatto di una stringa JSON** — **mai come sottostringa** — su tutte le entry. Atteso: **una sola occorrenza**, in `bots/<schemaname>/bot.xml` → `<name>` (FR-096, research.md §14)
- [x] T047 [US3] In `compat.ts`, riconoscere l'occorrenza legittima `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` (contiene il **nome base senza suffisso**) e **non segnalarla** quando il suffisso è vuoto e i due valori coincidono (FR-096)
- [x] T048 [US3] Se il nome compare in un punto non noto, **bloccare** il packaging, mostrare i punti trovati con file e posizione, e consentire di procedere **solo** dietro conferma esplicita, registrata nel manifest (FR-096, errore `UNEXPECTED_NAME_OCCURRENCE`)
- [x] T049 [US3] In `compat.ts`, calcolare la `FormatFingerprint`: `SolutionPackageVersion`, timbri di versione della piattaforma da `<ImportExportXml>` (`version`, `OrganizationVersion`, `CRMServerServiceabilityVersion`), cartelle di primo livello, elementi di `bot.xml` e `botcomponent.xml`, chiavi di `configuration.json` (FR-097)
- [x] T050 [US3] Confrontare l'impronta **sia** con `tools/baseline/package-format.json` **sia** con quella dell'ultimo packaging della stessa solution; ogni scostamento produce un **avviso non bloccante** che dice cosa è cambiato. `FormatDrift.blocking` è **sempre `false`**: Dataverse si aggiorna di continuo e i timbri cambiano da soli (FR-097, FR-098)

**Checkpoint**: il tool è difeso contro un cambio di formato silenzioso.

---

## Phase 7: User Story 4 — Solution Explorer e navigazione (Priority: P2)

**Goal**: navigazione e ricerca di livello enterprise su solution e agent.

**Independent Test**: con due connessioni attive l'utente naviga le solution di entrambi gli environment, cerca un agent per nome e salta direttamente al suo packaging.

> Gran parte di questa fase **esiste già** in `tools/src/app.ts` e va conservata: i requisiti di navigazione non sono stati toccati dalla revisione. I task riguardano adattamento e completamento.

- [x] T051 [US4] Adattare `tools/src/components/SolutionExplorer/` al nuovo flusso: il click su un agent porta allo step **suffisso del packaging**, non al rename live (FR-023)
- [x] T052 [US4] Conservare e verificare il selettore di tipo **Unmanaged / Managed / All** con conteggi e default dedotto dai dati, non dal nome dell'environment (FR-061, FR-026)
- [x] T053 [US4] In `tools/src/components/SolutionExplorer/`, conservare e verificare la ricerca unica su nome solution, nome univoco, publisher **e nomi degli agent contenuti**, con evidenziazione e salto diretto all'agent (FR-028)
- [x] T054 [US4] Conservare il breadcrumb `Solutions › {Solution} › {Agent} › Preview › Result`, con ogni segmento navigabile e il ritorno di **un solo livello** (FR-033, FR-034, FR-044)
- [x] T055 [US4] Conservare l'ordinamento per colonna sul **valore sottostante** (date per timestamp, versioni segmento per segmento: `1.0.0.10 > 1.0.0.6`) con indicatore di direzione (FR-036, FR-037, FR-038)
- [x] T056 [US4] In `tools/src/components/SolutionExplorer/`, conservare la voce "Agents without a solution" così che nessun agent dell'environment risulti irraggiungibile (FR-029)
- [x] T057 [US4] In `tools/src/app.ts`, conservare il re-read all'ingresso nelle liste con indicatore "Updating…", senza toccare i form né perdere lo scroll, e il salto dei refresh ravvicinati (< 2 s) (FR-047, FR-048)
- [x] T058 [US4] In `tools/src/app.ts`, conservare l'escape HTML su ogni testo proveniente da Dataverse, inclusa l'evidenziazione dei risultati di ricerca (FR-030)
- [x] T059 [US4] In `tools/src/styles.css`, verificare il layout full width e responsive ai breakpoint previsti (1100px, 900px, 720px) e la tabella con intestazione sticky (FR-027, FR-031, FR-032; constitution → Principio VII)

**Checkpoint**: la navigazione è completa e coerente con il nuovo flusso.

---

## Phase 8: User Story 2b — Inventario del package (Priority: P2)

**Goal**: nessuno scopre a valle che l'import ha portato con sé altri componenti.

**Independent Test**: su `testAgentTool` (16 componenti, solo agent) nessuna conferma extra; su `SigmaMonitoringAgent` il tool elenca 2 cloud flow, 1 connection reference e 1 security role e chiede conferma.

- [x] T060 [US2] In `tools/src/services/package.ts`, costruire l'`inventory` del package: raggruppare le entry per cartella di primo livello e classificarle con `kind` leggibile e `count`, con i nomi dove leggibili (FR-091)
- [x] T061 [US2] Classificare i componenti usando i `componenttype` **misurati** di `solutioncomponent` (10212 = Agent, 10213 = Agent component). **Attenzione**: è un enum **diverso** da `botcomponent.componenttype` (dove 15 = Custom GPT) — usare un valore dell'uno sull'altro restituisce zero righe senza errore. Usarli solo per **classificare**, mai per **cercare** gli agent (FR-092, FR-024, research.md §12)
- [x] T062 [US2] Mostrare i `componenttype` non riconosciuti come "Sconosciuto" con il numero, **mai ometterli** (FR-092)
- [x] T063 [US2] Mostrare **sempre** l'inventario nell'anteprima e richiedere **conferma esplicita** quando il package contiene componenti diversi dall'agent selezionato e dai suoi agent component, elencando cosa partirà (FR-091, errore `EXTRA_COMPONENTS_NOT_CONFIRMED`)

**Checkpoint**: l'artefatto non riserva sorprese.

---

## Phase 9: User Story 6 — Log operazioni (Priority: P2)

**Goal**: ogni operazione è tracciata e il log è esportabile.

**Independent Test**: dopo un packaging, il log mostra export, patch, verifica e scrittura dei file con esito, ed è scaricabile.

- [x] T064 [US6] In `tools/src/services/log.ts`, registrare ogni fase: export (con modalità e durata), lettura del package, controlli di compatibilità, patch per agent, rezip, verifica, scrittura dei file (FR-016)
- [x] T065 [US6] [P] In `tools/src/services/log.ts`, implementare l'export del log in CSV o JSON tramite il dialog di salvataggio di PPTB (FR-017)
- [x] T066 [US6] In `tools/src/services/dataverse.ts`, gestire gli errori di permessi con messaggi che indicano il ruolo necessario (System Customizer come minimo per l'export) (FR-018)

---

## Phase 10: User Story 5 — Deploy opzionale (Priority: P3 — fase 2)

**Goal**: importare l'artefatto nell'ambiente di destinazione dal tool.

**Independent Test**: con due connessioni, dopo il packaging si sceglie UAT, si avvia l'import e si verifica in Solution Layers che l'agent abbia **solo** il layer managed.

> Fase separata e opzionale: la fase 1 si chiude con lo zip sul disco (FR-081).

- [x] T067 [US5] Creare `tools/src/services/deploy.ts`: `dataverseAPI.deploySolution(bytes, options)` + polling `getImportJobStatus(importJobId)` con avanzamento visibile fino all'esito (FR-081)
- [x] T068 [US5] Consentire il deploy del **solo** file con `role: deploy`; l'artefatto unmanaged NON DEVE essere proponibile per UAT/PROD (FR-087)
- [x] T069 [US5] In `tools/src/services/deploy.ts`, rilevare prima del deploy se l'agent nell'ambiente di destinazione ha un **unmanaged layer** attivo e avvisare che, finché esiste, il nome del package non comparirà: va rimosso con **Remove active customizations** (FR-082)
- [x] T070 [US5] In `tools/src/components/DeployPanel/`, avvisare quando si importa la **stessa versione** già installata, spiegando che è un *update* e non un *upgrade*, e offrire il bump (FR-073)
- [x] T071 [US5] Dopo il deploy, rileggere `bot.name` dall'ambiente di destinazione e confrontarlo con il valore patchato. Se non coincide, **non** dichiarare il deploy riuscito: l'assunzione sul formato è caduta (FR-099)
- [x] T072 [US5] Registrare il `DeploymentRecord` (timestamp, environment di destinazione, `importJobId`, esito, messaggio) nella voce di History dell'artifact set
- [x] T073 [US5] In `tools/src/components/DeployPanel/`, in caso di import fallito mostrare il messaggio di Dataverse e lasciare lo zip sul disco, pronto per un nuovo tentativo o per l'import manuale

**Checkpoint**: il ciclo completo è automatizzabile dal tool.

---

## Phase 11: Headless / MCP (Priority: P3)

**Goal**: esporre il tool come strumento MCP secondo `contracts/headless-api.md`.

- [x] T074 [P] Implementare `listSolutions` con `exportable: false` sulle managed
- [x] T075 [P] Implementare `inspectPackage`: package, agent, `publishOnImport`, canali, `suffixVariable`, `inventory` e blocco `compatibility` (fingerprint, drift, nameOccurrences), **senza scrivere file**
- [x] T076 [P] Implementare `previewPatch`: `changes` e conteggio delle entry intatte
- [x] T077 Implementare `package`: artifact set completo con `folderPath`, `manifestPath`, `totalBytes`, `export`, e l'elenco dei file con `role`, `sha256` e `verification`. Rispettare `confirmExtraComponents` e `confirmUnexpectedOccurrences`
- [x] T078 Escludere dall'headless `deploy` e `removeUnmanagedLayer`: modificano un environment e restano dietro conferma umana
- [x] T079 Implementare i codici di errore del contratto: `SOLUTION_NOT_FOUND`, `SOLUTION_IS_MANAGED`, `NO_AGENTS_IN_PACKAGE`, `BOT_NAME_ELEMENT_MISSING`, `EXPORT_FAILED`, `UNEXPECTED_NAME_OCCURRENCE`, `PACKAGE_VERIFICATION_FAILED`, `OUTPUT_FILE_EXISTS`, `EXTRA_COMPONENTS_NOT_CONFIRMED`, `PERMISSION_DENIED`, `CONNECTION_ERROR`

---

## Phase 12: Polish & Cross-Cutting Concerns

- [x] T080 In `tools/src/components/PatchPreview/` e `tools/src/services/export.ts`, implementare l'avanzamento reale dell'export: quale archivio è in corso, tempo trascorso, stato del job in modalità asincrona. Un'operazione che dura **da 13 secondi a 5 minuti** non può essere rappresentata da uno spinner muto (FR-094)
- [x] T081 [P] Aggiornare `tools/README.md` con il nuovo flusso e con la dichiarazione di FR-102 sulla modifica non supportata dei file di solution
- [x] T082 [P] Proporre all'utente l'aggiornamento di `.specify/memory/constitution.md` → *Verified Metadata Values*: la frase «There is no documented `componenttype` value for Bot/Agent» va integrata con i valori **misurati** di `solutioncomponent` (10212 = Agent, 10213 = Agent component), distinguendoli dall'enum di `botcomponent`. **Modifica di governance: non applicarla senza approvazione esplicita**
- [x] T083 In `tools/src/app.ts` e `tools/src/styles.css`, rivedere gli stati vuoti e di errore perché dicano **perché** sono vuoti, citando il termine cercato o il filtro attivo (constitution → Principio VII, *Honest empty and error states*)
- [ ] T084 **(richiede PPTB in esecuzione — non eseguibile da qui)** Eseguire la validazione completa di `quickstart.md` (scenari V1 → V17) e annotare nel documento gli esiti, in particolare: **V8** (nessun unmanaged layer dopo l'import), **V9** (nome su Teams/M365), **V12** (zero scritture su Dataverse)
- [ ] T085 **(richiede una solution piu' grande di FactoryHub — rimandato esplicitamente in progettazione)** Misurare il carico su una solution più grande di `FactoryHub` (976 KB) e aggiornare research.md §13 con i tempi e il consumo di memoria osservati — il test di carico rimandato esplicitamente in fase di progettazione
- [x] T086 `npm run build` e `npm run validate` in `tools/`, verificando che il bundle resti self-contained

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: nessuna dipendenza
- **Phase 2 (Foundational)**: dipende da Phase 1 — **blocca tutte le user story**. T006 in particolare: finché esiste codice che scrive su `bot`, il difetto originale può ripresentarsi
- **Phase 3 (US1)**: dipende da Phase 2
- **Phase 4 (US2)**: dipende da Phase 3 (serve la solution selezionata)
- **Phase 5 (US3)**: dipende da Phase 4 (serve il package patchato da scrivere)
- **Phase 6 (US3b)**: dipende da Phase 4 (i controlli girano sul package letto). Da completare **prima** del primo uso reale
- **Phase 7 (US4)**: dipende da Phase 3; indipendente da Phase 4–6
- **Phase 8 (US2b)**: dipende da Phase 4
- **Phase 9 (US6)**: dipende da Phase 2; si integra man mano
- **Phase 10 (US5)**: dipende da Phase 5 (serve l'artefatto)
- **Phase 11 (Headless)**: dipende da Phase 4–6
- **Phase 12 (Polish)**: dipende dalle fasi desiderate

### Within Each User Story

- Servizi prima dei componenti UI
- `package.ts` prima di `patch.ts`, `patch.ts` prima di `rezip.ts`
- `compat.ts` prima della conferma dell'anteprima
- Nessuna scrittura su disco prima della verifica (FR-077)

### Parallel Opportunities

- Phase 1: T003, T004, T005 in parallelo
- Phase 2: T010, T011 in parallelo dopo T009
- Phase 4: T021 e T022 in parallelo
- Phase 11: T074, T075, T076 in parallelo
- Phase 12: T081, T082 in parallelo

---

## Parallel Example: Phase 4 (US2)

```bash
# Dopo T017–T020 (export disponibile), in parallelo:
Task: "Lettura di solution.xml, bot.xml e configuration.json in tools/src/services/package.ts"
Task: "Lettura in sola lettura di environmentvariabledefinition.xml in tools/src/services/package.ts"

# Poi sequenziale, per dipendenza di dati:
T025 → T026 → T027 → T028 → T029 → T030 → T031 → T032
```

---

## Implementation Strategy

### MVP (Phase 1 → 6)

1. Setup e Foundational — **il tool smette di poter scrivere su Dataverse**
2. US1: scelta della solution sorgente
3. US2: export, patch, rezip verificato
4. US3: artifact set e manifest
5. US3b: rete di sicurezza sul formato
6. **STOP e VALIDARE**: eseguire quickstart V1–V8 e V12 su `testAgentTool`, poi l'import in UAT

A questo punto il problema originale è risolto: nome corretto nel managed layer, nessun unmanaged layer.

### Incremental Delivery

1. MVP → import manuale dello zip (il flusso che l'utente già usa)
2. + US4 (navigazione) e US2b (inventario) → uso quotidiano confortevole
3. + US6 (log) → tracciabilità completa
4. + US5 (deploy) → ciclo completo dal tool
5. + Headless → automazione e MCP

### Ordine consigliato per singolo sviluppatore

Phase 1 → 2 → 3 → 4 → 6 → 5 → 8 → 7 → 9 → 12 → 10 → 11

La Phase 6 (rete di sicurezza) **prima** della Phase 5: produrre artefatti su disco senza i controlli di compatibilità significa poter generare un package patchato a metà.

---

## Notes

- `[P]` = file diversi, nessuna dipendenza
- Ogni user story è completabile e testabile in modo indipendente
- Commit dopo ogni task o gruppo logico
- **Vincolo trasversale non negoziabile**: nessuna scrittura su `bot`, `botcomponent` o environment variable in nessun environment (FR-067, SC-010). Qualunque task che sembri richiederla è un errore di interpretazione
- I riferimenti `research.md §N` indicano misure reali eseguite il 2026-10-15, non ipotesi: vanno rilette prima di implementare il task che le cita
