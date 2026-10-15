# Tasks: Agent Rename Manager

**Input**: Design documents from `/specs/001-agent-rename-manager/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Tests**: Non richiesti nella spec — nessun task di test generato.

**Organization**: Task raggruppati per user story. Ogni fase è un incremento indipendente e testabile.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Eseguibile in parallelo (file diversi, nessuna dipendenza da task incompleti)
- **[Story]**: User story di appartenenza (US1–US6)
- Percorsi relativi a `tools/agent-rename-manager/`

---

## Phase 1: Setup (Struttura progetto)

**Purpose**: Creare la struttura del tool PPTB e il punto di ingresso.

- [ ] T001 Creare la struttura directory del tool in `tools/agent-rename-manager/` come da `plan.md` (src/services/, src/components/, src/utils/)
- [ ] T002 [P] Creare `tools/agent-rename-manager/pptb.config.json` con struttura placeholder (id, name, version, entryPoint, permissions vuote) — verrà completato in fase polish (T042)
- [ ] T003 [P] Creare `tools/agent-rename-manager/index.html` con layout shell a 3 zone: sidebar sinistra (SolutionExplorer), area centrale (step corrente), sidebar destra (LogPanel)
- [ ] T004 [P] Creare `tools/agent-rename-manager/src/main.js` con: init app, stato sessione globale (AgentRenameSession), router step (solution-explorer → suffix-selector → preview → apply → publish)

**Checkpoint**: Struttura directory presente, `index.html` apribile in PPTB senza errori

---

## Phase 2: Foundational (Servizi base — bloccante per tutte le US)

**Purpose**: Servizi condivisi che TUTTE le user story usano. Nessuna US può iniziare senza questi.

**⚠️ CRITICO**: Completare questa fase prima di qualsiasi US

- [ ] T005 Implementare `tools/agent-rename-manager/src/services/dataverse.js`: wrapper `window.dataverseAPI` con paging automatico (`@odata.nextLink`), `retrieveAll(entitySet, query)`, `update(entitySet, id, data)`, `create(entitySet, data)`, `executeAction(actionPath, body)`, gestione errori con status code
- [ ] T006 [P] Implementare `tools/agent-rename-manager/src/utils/validation.js`: `validateManifestNameLength(name, suffix)` — ritorna `{ valid, truncated, proposedShort, charCount }` con limite 30 char (FR-019); `formatPermissionError(statusCode, operation)` — messaggi specifici per 403/401
- [ ] T007 [P] Implementare `tools/agent-rename-manager/src/utils/storage.js`: `writeFile(relativePath, content)` e `readFile(relativePath)` via `window.toolboxAPI`, `listFiles(dir)`, `deleteOldFiles(dir, retentionDays=30)` per cleanup retention log/backup
- [ ] T008 Implementare `tools/agent-rename-manager/src/services/manifest.js`: `parseManifest(rawJson)` → oggetto TeamsManifest; `updateManifestName(manifest, newName)` — aggiorna `name.short` (max 30 char, troncatura automatica con flag), `name.full`, incrementa `version` patch (es. "1.0.2" → "1.0.3"); `serializeManifest(manifest)` → JSON string
- [ ] T009 [P] Implementare `tools/agent-rename-manager/src/services/rename.js` — logica core strip/apply: `calculateBaseName(currentName, currentSuffix)` rimuove suffisso corrente in coda (con e senza spazio) se presente; `calculateFinalName(currentName, currentSuffix, newSuffix)` → nome finale; `detectRenameState(currentName, currentSuffix, newSuffix)` → enum `no-change | suffix-added | suffix-changed | suffix-removed`

**Checkpoint**: Tutte le funzioni dei servizi base chiamabili dal browser console senza errori

---

## Phase 3: User Story 1 — Setup solution e configurazione suffisso (P1) 🎯 MVP

**Goal**: L'utente apre il tool su una solution, il tool rileva se la env variable esiste, guida la creazione se mancante, e permette di configurare il valore del suffisso.

**Independent Test**: Quickstart scenario V1 — aprire solution senza env variable, creare variabile guidata, impostare `(DEV)`, verificare nessun warning residuo.

- [ ] T010 [P] [US1] Implementare `tools/agent-rename-manager/src/services/solutions.js`: `listSolutions()` — `GET /solutions?$select=solutionid,uniquename,friendlyname,_publisherid_value`; `getPublisherPrefix(publisherId)` — `GET /publishers({id})?$select=customizationprefix`; `addComponentToSolution(solutionUniqueName, componentId, componentType)` — `POST /AddSolutionComponent`
- [ ] T011 [P] [US1] Implementare `tools/agent-rename-manager/src/services/envvariables.js`: `checkEnvVariable(schemaName)` — `GET /environmentvariabledefinitions?$filter=schemaname eq '{name}'`; `getCurrentValue(defId)` — `GET /environmentvariablevalues?$filter=_environmentvariabledefinitionid_value eq '{defId}'`; `createDefinition(schemaName, displayName, solutionUniqueName)` — `POST /environmentvariabledefinitions` type=100000000 (String) + AddSolutionComponent; `upsertValue(defId, valueId, newValue)` — PATCH se esiste, POST se nuovo
- [ ] T012 [US1] Costruire componente `tools/agent-rename-manager/src/components/SuffixSelector/index.js`: selettore con valori predefiniti `(DEV)`, `[DEV]`, `(UAT)`, `[UAT]`, `(TEST)`, `[TEST]`, `(STAGING)`, `[STAGING]`, `(PREPROD)`, `[PREPROD]`, vuoto; campo testo libero; al salvataggio chiama `envvariables.upsertValue` e aggiorna stato sessione `currentSuffixValue`
- [ ] T013 [US1] Costruire warning env variable e wizard creazione in `tools/agent-rename-manager/src/components/SolutionExplorer/EnvVarWarning.js`: banner visibile con spiegazione, pulsante "Crea variabile ambiente"; wizard 2-step (mostra publisher prefix rilevato → conferma → chiama `envvariables.createDefinition`); nascondi banner se env variable esiste
- [ ] T014 [US1] Collegare il flusso US1 end-to-end in `tools/agent-rename-manager/src/main.js`: al click su solution → chiama `solutions.getPublisherPrefix` → chiama `envvariables.checkEnvVariable('{prefix}_AgentDisplaySuffix')` → se mancante mostra `EnvVarWarning`, altrimenti mostra `SuffixSelector` con valore corrente pre-caricato

**Checkpoint** (Quickstart V1): Warning presente → wizard crea env variable → SuffixSelector mostra `(DEV)` → nessun warning residuo ✓

---

## Phase 4: User Story 2 — Rename preview e apply (P1) 🎯 MVP+

**Goal**: Dopo aver configurato il suffisso, l'utente vede l'anteprima di tutti i rename e applica le modifiche con conferma.

**Independent Test**: Quickstart scenari V2 e V3 — preview corretta con stato per agent, apply produce nomi corretti in Copilot Studio UI, idempotenza verificata.

- [ ] T015 Implementare `tools/agent-rename-manager/src/services/agents.js`: `getAgentsInSolution(solutionId)` — `GET /solutioncomponents?$filter=_solutionid_value eq '{id}' and componenttype eq 380&$select=objectid` poi `GET /bots?$filter=botid in ({ids})&$select=botid,name,applicationmanifestinformation,published,synchronizationstatus,ismanaged`; `getDescription(botId)` — `GET /botcomponents?$filter=_parentbotid_value eq '{id}' and componenttype eq 15&$select=botcomponentid,description`; `detectTeamsChannel(synchronizationstatus)` — parse JSON, ritorna `!!(syncStatus.applicationId)`
- [ ] T016 [P] [US2] Costruire componente `tools/agent-rename-manager/src/components/RenamePreview/index.js`: tabella con colonne "Nome attuale | Nome base | Nome finale | Stato | Teams | Avvisi"; badge stato colorati per `renameState` (no-change=grigio, suffix-added=verde, suffix-changed=arancione, suffix-removed=rosso); warning inline se `manifestNameTruncated=true` con conteggio caratteri (FR-019); pulsante "Applica" abilitato solo se almeno un agent non è `no-change`
- [ ] T017 [US2] Implementare logica apply in `tools/agent-rename-manager/src/services/rename.js`: `applyRename(session, agents)` — per ogni agent in sequenza: `PATCH /bots({id})` con `name: proposedName`; `PATCH /bots({id})` con `applicationmanifestinformation: updatedManifest` (se manifest presente); `PATCH /botcomponents({descId})` con `description: proposedDescription` (se description presente); aggiorna `applyStatus` per agent in tempo reale; chiama `log.js` per ogni campo modificato
- [ ] T018 [P] [US2] Costruire componente `tools/agent-rename-manager/src/components/ApplyProgress/index.js`: per ogni agent mostra progress in tempo reale — riga per agent con indicatori per `bot.name` / `applicationmanifestinformation` / `description` (⏳ in corso, ✅ successo, ❌ errore); contatore globale "X/Y aggiornati"
- [ ] T019 [US2] Costruire dialog di conferma in `tools/agent-rename-manager/src/components/RenamePreview/ConfirmDialog.js`: mostra riepilogo operazioni (N agent, lista campi che verranno modificati, N agent richiedono Publish); pulsanti "Conferma" e "Annulla"; richiede click esplicito — non si chiude con Esc o click fuori (FR-010)
- [ ] T020 [US2] Collegare flusso US2 end-to-end: SuffixSelector completato → carica agents con `agents.getAgentsInSolution` (progressivo FR-002) → calcola preview con `rename.calculateFinalName` per ogni agent → mostra `RenamePreview` → click Applica → `ConfirmDialog` → `applyRename` con `ApplyProgress` → result state

**Checkpoint** (Quickstart V2 + V3): Preview corretta con stato inconsistente visibile ✓; apply aggiorna nomi in Copilot Studio UI ✓; secondo apply idempotente ✓

---

## Phase 5: User Story 3 — Backup e gestione errori (P1)

**Goal**: Prima di ogni apply, il tool crea un backup automatico. In caso di errore parziale, l'utente può scegliere rollback completo o mantenere lo stato raggiunto.

**Independent Test**: Quickstart scenario V4 — backup creato prima dell'apply, errore simulato al terzo agent, rollback ripristina tutti i nomi originali.

- [ ] T021 [P] [US3] Implementare `tools/agent-rename-manager/src/services/backup.js`: `createBackup(sessionId, agents)` — snapshot `{ botId, botName, applicationManifestInformation, description }` per ogni agent, salva in `{backupDir}/{sessionId}/backup-{timestamp}.json` via `storage.writeFile`; `restoreBackup(sessionId)` — legge il backup e chiama `PATCH /bots({id})` con i valori originali per ogni agent; `listBackups()` — lista file backup disponibili con età
- [ ] T022 [US3] Integrare backup nel flusso apply in `tools/agent-rename-manager/src/services/rename.js`: chiamare `backup.createBackup` come primo step di `applyRename`, prima di qualsiasi PATCH; annotare backup nel log con `log.append(operation: 'backup_created')`
- [ ] T023 [US3] Costruire UI stato parziale post-errore in `tools/agent-rename-manager/src/components/ApplyProgress/ErrorRecovery.js`: sezione visibile in caso di errore — tabella "Agent rinominati: X" / "Agent non rinominati: Y" con nome e messaggio errore per ognuno; due pulsanti: "Rollback tutto (ripristina backup)" e "Mantieni stato attuale"
- [ ] T024 [US3] Implementare flusso rollback in `tools/agent-rename-manager/src/services/rename.js`: `rollbackRename(sessionId, appliedAgents)` — chiama `backup.restoreBackup` per gli agent già modificati, aggiorna `applyStatus → pending` per ognuno, aggiorna log con `operation: 'rollback'`
- [ ] T025 [US3] Collegare flusso US3: errore in `applyRename` → mostra `ErrorRecovery` → click "Rollback" → `rollbackRename` con progress per ogni agent → conferma visiva "Tutti i nomi ripristinati" ✓

**Checkpoint** (Quickstart V4): Backup file creato in `{backupDir}/{sessionId}/` ✓; errore simulato → ErrorRecovery visibile ✓; rollback → nomi originali ripristinati ✓

---

## Phase 6: User Story 4 — Solution Explorer e navigazione multi-environment (P2)

**Goal**: L'utente può navigare le solution di più environment connessi, vedere lo stato di ogni solution (env var configurata?, agent count, managed?) e selezionare quella su cui operare.

**Independent Test**: Quickstart scenario implicito — con due connessioni PPTB attive, entrambe le solution appaiono con stato env var corretto.

- [ ] T026 [US4] Costruire componente `tools/agent-rename-manager/src/components/SolutionExplorer/index.js`: lista environment connessi da `window.toolboxAPI.getConnections()`; per ogni environment lista solution da `solutions.listSolutions()`; per ogni solution mostra: display name, isManaged badge, agent count, stato env var (✅ configurata / ⚠️ mancante con valore se presente); click su solution → setta come solution attiva nella sessione
- [ ] T027 [P] [US4] Aggiungere supporto multi-connection in `tools/agent-rename-manager/src/services/solutions.js`: `listSolutionsForEnvironment(environmentId)` — switcha la connessione attiva PPTB, chiama `listSolutions`, ripristina connessione precedente; gestisce connessioni multiple in parallelo con `Promise.all`
- [ ] T028 [US4] Aggiungere progressive loading per 50+ agent in `tools/agent-rename-manager/src/services/agents.js`: `getAgentsInSolutionProgressive(solutionId, onProgress)` — carica in batch da solutioncomponents con paging `@odata.nextLink`, chiama callback `onProgress(loaded, total)` ad ogni batch; integra callback nel `SolutionExplorer` come indicatore di progresso (FR-002)
- [ ] T029 [P] [US4] Aggiungere dettagli agent nell'espansione solution in `SolutionExplorer/index.js`: espandi solution → mostra lista agent con: nome attuale, stato pubblicazione (data `bot.published` o "Mai"), canali attivi (Teams badge se `hasTeamsChannel`), renameState rispetto al suffisso corrente della env var

**Checkpoint**: Due connessioni attive → entrambe le solution visibili con stato env var corretto ✓; 50+ agent → caricamento progressivo senza blocco UI ✓

---

## Phase 7: User Story 5 — Publish post-rename (P2)

**Goal**: Dopo il rename, il tool mostra quali agent richiedono Publish per aggiornare il nome nei canali Teams/M365, e permette di fare il publish per singolo agent o in bulk.

**Independent Test**: Quickstart scenario V5 — agent con Teams mostra banner ⚠️, publish in tempo reale, nome aggiornato in Teams.

- [ ] T030 Implementare `tools/agent-rename-manager/src/services/publish.js`: `publishAgent(botId)` — `POST /bots({id})/Microsoft.Dynamics.CRM.PvaPublish`; `pollPublishStatus(botId, timeoutMs=120000)` — polling ogni 3s su `GET /bots({id})/Microsoft.Dynamics.CRM.PvaPublishStatus` fino a `Published` o `Failed` o timeout; aggiorna `publishStatus` dell'agent in stato sessione
- [ ] T031 [P] [US5] Costruire componente `tools/agent-rename-manager/src/components/PublishPanel/index.js`: per ogni agent con `publishRequired=true` mostra banner `⚠️ Publish required — il nome in Teams non si aggiornerà finché non pubblichi`; pulsante "Publish ora" per singolo agent; per agent con `publishRequired=false` mostra `✅ Nessun Publish necessario — modifiche già attive`; indicatore stato in tempo reale: ⏳ in corso → ✅ completato / ❌ fallito
- [ ] T032 [US5] Aggiungere "Pubblica tutti" bulk publish in `PublishPanel/index.js`: pulsante visibile se almeno un agent ha `publishRequired=true`; esegue `publishAgent` in sequenza con intervallo tra chiamate (rate limit Dataverse); stato visibile per ogni agent durante esecuzione
- [ ] T033 [US5] Integrare rilevamento publish nel risultato apply in `tools/agent-rename-manager/src/components/ApplyProgress/index.js`: dopo completamento apply, per ogni agent con `hasTeamsChannel=true` imposta `publishRequired=true` e mostra link "→ Vai a Publish" che porta al PublishPanel

**Checkpoint** (Quickstart V5): Banner ⚠️ per agent Teams ✓; publish in tempo reale ✓; `✅ Nessun Publish necessario` per agent senza Teams ✓

---

## Phase 8: User Story 6 — Log operazioni (P2)

**Goal**: Ogni operazione viene registrata nel log con tutti i dettagli. Il log è visibile, filtrabile ed esportabile.

**Independent Test**: Quickstart scenario V6 — dopo rename di 3 agent, log contiene entry per ogni campo modificato, export CSV con struttura corretta.

- [ ] T034 Implementare `tools/agent-rename-manager/src/services/log.js`: `append(entry: LogEntry)` — aggiunge a `{logDir}/log-{YYYY-MM}.json` (rotazione mensile) via `storage.writeFile`; `getAll(filters)` — legge log mensili e filtra per `{ environmentId, solutionId, botId, dateFrom, dateTo }`; `exportCsv(entries)` → stringa CSV con header; `exportJson(entries)` → JSON array; `runRetentionCleanup()` — elimina file log più vecchi di 30 giorni via `storage.deleteOldFiles`
- [ ] T035 [P] [US6] Costruire componente `tools/agent-rename-manager/src/components/LogPanel/index.js`: tabella con colonne timestamp | utente | environment | solution | agent | campo | valore prima | valore dopo | esito; filtri per data, environment, solution, agent; paginazione per sessioni con molte entry; badge colorati per esito (✅ success, ❌ error, ⏭️ skipped)
- [ ] T036 [US6] Aggiungere pulsanti export nel `LogPanel/index.js`: "Esporta CSV" → chiama `log.exportCsv` → download file `agent-rename-log-{date}.csv`; "Esporta JSON" → chiama `log.exportJson` → download `agent-rename-log-{date}.json` (FR-017)
- [ ] T037 [US6] Aggiungere chiamate `log.append` in tutti i servizi: `rename.js` (rename_bot_name, rename_manifest, rename_description, update_env_variable), `backup.js` (backup_created), `publish.js` (publish), `rename.js rollback` (rollback), `envvariables.js` (create_env_variable) — ogni operazione DEVE generare almeno una entry (FR-016)
- [ ] T038 [US6] Aggiungere backup viewer in `LogPanel/index.js`: tab "Backup" con lista backup disponibili da `backup.listBackups()` con data, sessionId, numero agent; pulsante "Scarica" per ogni backup → download JSON; pulsante "Elimina" per cleanup manuale

**Checkpoint** (Quickstart V6): Log completo dopo rename ✓; ogni campo modificato ha entry separata ✓; export CSV con tutti i campi ✓; backup scaricabile dal LogPanel ✓

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Headless API per MCP, permessi completi in config, hardening UX, validazione quickstart completa.

- [ ] T039 Implementare `invokeHeadless` in `tools/agent-rename-manager/src/main.js`: operazioni `preview`, `status`, `listSolutions` come da contratto `contracts/headless-api.md`; read-only per policy (nessuna operazione di scrittura); output JSON strutturato
- [ ] T040 [P] Aggiungere gestione permessi completa in `tools/agent-rename-manager/src/utils/validation.js` e in ogni servizio: intercetta 403/401 da `dataverse.js`, chiama `formatPermissionError` con operazione specifica; mostra messaggio con ruolo necessario (FR-018)
- [ ] T041 [P] Aggiungere warning manifesto in `RenamePreview/index.js`: per ogni agent dove `manifestNameTruncated=true` mostra `⚠️ "{nomeProposto}" ({N} char) supera il limite di 30 caratteri per il manifest Teams — verrà troncato a "{nomeTroncato}"` (FR-019)
- [ ] T042 [P] Completare `tools/agent-rename-manager/pptb.config.json` con permissions complete (read/write tabelle, actions PvaPublish), `features.multiConnection: true`, `features.invokeHeadless: true`, tags marketplace come da `contracts/pptb-config.md`
- [ ] T043 Eseguire tutti i 9 scenari di validazione in `quickstart.md` (V1–V9) e verificare ogni expected outcome ✓
- [ ] T044 [P] Cleanup: rimuovere console.log di debug, aggiungere commenti solo per logica non-ovvia (strip-suffisso idempotency in rename.js, version bump in manifest.js, polling timeout in publish.js)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Nessuna dipendenza — inizia subito
- **Phase 2 (Foundational)**: Dipende da Phase 1 — BLOCCA tutte le US
- **Phase 3 (US1)**: Dipende da Phase 2 — avvia dopo Foundational
- **Phase 4 (US2)**: Dipende da Phase 2 + Phase 3 completata (usa solutions.js e envvariables.js)
- **Phase 5 (US3)**: Dipende da Phase 4 (il backup si integra nel flusso apply)
- **Phase 6 (US4)**: Dipende da Phase 2 + Phase 3 — indipendente da US2/US3
- **Phase 7 (US5)**: Dipende da Phase 4 (usa apply result per `publishRequired`)
- **Phase 8 (US6)**: Dipende da Phase 2 (log.js usa storage.js) — può iniziare dopo T007
- **Phase 9 (Polish)**: Dipende da tutte le US completate

### User Story Dependencies

| US | Dipende da | Indipendente da |
|---|---|---|
| US1 (P1) | Phase 2 | - |
| US2 (P1) | Phase 2 + US1 (solutions/envvariables) | US3, US4 |
| US3 (P1) | US2 (flusso apply) | US4, US5, US6 |
| US4 (P2) | Phase 2 + US1 | US2, US3, US5 |
| US5 (P2) | US2 (apply result) | US3, US4, US6 |
| US6 (P2) | Phase 2 (storage.js) | US1, US2, US3, US4, US5 |

### Within Each Phase

- Servizi prima dei componenti UI
- Logica core prima dell'integrazione end-to-end
- Wire end-to-end come ultimo task di ogni fase

### Parallel Opportunities per fase

**Phase 2**: T006, T007, T009 possono partire in parallelo con T005; T008 dipende da T005

**Phase 3**: T010 e T011 in parallelo; T012 in parallelo; T013 e T014 dipendono da T010/T011

**Phase 4**: T016 e T018 in parallelo dopo T015; T019 in parallelo; T020 dipende da tutti

**Phase 6**: T027 e T029 in parallelo con T026; T028 dipende da T015

---

## Parallel Example: Phase 4 (US2)

```text
# Dopo completamento T015 (agents.js):

Parallelo A: T016 — Costruire RenamePreview component
Parallelo B: T018 — Costruire ApplyProgress component
Parallelo C: T019 — Costruire ConfirmDialog

# Poi sequenziale:
T017 — Implementare logica apply (dipende da agents.js T015)
T020 — Wire flusso end-to-end (dipende da T016, T017, T018, T019)
```

---

## Implementation Strategy

### MVP (US1 + US2 + US3 — tutto P1)

1. Completa Phase 1 (Setup)
2. Completa Phase 2 (Foundational — CRITICO)
3. Completa Phase 3 (US1 — env variable setup)
4. Completa Phase 4 (US2 — rename preview + apply)
5. Completa Phase 5 (US3 — backup + rollback)
6. **STOP E VALIDA** con Quickstart V1–V4: MVP funzionante e sicuro
7. Pubblica versione MVP sul PPTB marketplace (versione 0.9.0)

### Incremental Delivery

1. MVP pubblicato → feedback dalla community
2. Aggiungi Phase 6 (US4 — multi-environment explorer) → v1.0.0
3. Aggiungi Phase 7 (US5 — publish integrato) → v1.1.0
4. Aggiungi Phase 8 (US6 — log completo) → v1.2.0
5. Phase 9 (polish + headless MCP) → v1.3.0

---

## Notes

- **[P]** = file diversi, nessuna dipendenza su task incompleti nello stesso file
- **[Story]** = traccia ogni task alla US di appartenenza
- Ogni US è autonoma e testabile con gli scenari `quickstart.md` corrispondenti
- Commit after each task o gruppo logico
- Verifica Quickstart V1–V9 prima di Phase 9
- Il rename è idempotente per design (research.md §7) — non aggiungere logica "salta se già uguale"
