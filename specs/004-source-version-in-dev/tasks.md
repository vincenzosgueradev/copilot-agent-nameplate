---

description: "Task list — la versione si alza in DEV (retroattivo: completato)"
---

# Tasks: La versione si alza in DEV

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/version-contract.md)

**Nota**: i task T001–T003 e T016 sono stati committati prima della scoperta del difetto (testo sulla versione); da T004 in poi sono nel commit della funzione. Dove non c'è un hash, il lavoro è nel commit di rilascio di questa feature (da riportare qui dopo il commit).

## Phase 0 — Prima iterazione: il testo (sostituita)

- [x] T001 Il testo sotto "Bump the version" dice cosa succede agli agent cancellati — `328b3bd`
- [x] T002 Il testo identico nella revisione — `328b3bd`
- [x] T003 FR-073a nella 001 — `328b3bd`

> Questa iterazione descriveva correttamente l'effetto del bump nello zip, ma il bump stesso era il difetto (research 001 §16). Il testo è stato riscritto in T012.

## Phase 1 — Servizio e motore (US1, US3)

- [x] T004 [US1] `tools/src/services/solutionVersion.ts`: `isValidVersion`, `compareVersions`, `nextVersion`, `versionProblem`
- [x] T005 [US1] `raiseSolutionVersion` con rilettura e tutti gli errori (managed, non trovata, DEV più alto, nessun effetto)
- [x] T006 [US1] `runPackaging`: scrivere prima dell'export; `PackagingResult.versionChange`; `expected.version`
- [x] T007 [US1] Togliere `bumpVersion` e la riga `Version` da `patch.ts` e `types.ts`; `newVersion` nelle opzioni
- [x] T008 [US3] Se la scrittura fallisce o non ha effetto non si esporta
- [x] T009 [US1] Manifest e storico: `versionChange`; headless: `newVersion`
- [x] T010 [US1] `dataverse.ts`: il commento di sola lettura rimanda a `solutionVersion.ts` (FR-067a)

## Phase 2 — Interfaccia (US1, US2, US4, US5, US6)

- [x] T011 [US1] Riga "Raise the version in DEV": interruttore acceso di default, campo con la proposta, messaggio
- [x] T012 [US5] `versionHintHtml` per i due stati e `versionHintNow` per la versione non valida; stesso testo nella revisione
- [x] T013 [US2] Next spento con versione non valida o senza agent
- [x] T014 [US4] `versionFrom` fisso; ripartenza dopo il salvataggio e cambiando solution; `resetVersionPlan`
- [x] T015 [US1] Fase "Raise the version in DEV" nell'avanzamento; nota nell'anteprima; il blocco "solution" sparisce dai cambi
- [x] T016 [US6] Nota nella schermata del risultato; nomi degli archivi con la versione nuova (difetto trovato dalla suite)

## Phase 3 — Specifiche e documentazione

- [x] T017 Research 001 §16; FR-073/073b/073c e FR-067a nella 001; contratto headless, data-model, quickstart V7, README
- [x] T018 Voce 1.1.0 del changelog (sezione *Changed*, con la spiegazione del difetto)

## Tracciabilità: requisito → codice → test

| Requisito | Codice | Test |
|---|---|---|
| FR-001 alzare in DEV | `solutionVersion.ts`, `packaging.ts`, `app.ts` | `engine.pipeline` (ordine, una scrittura, zip) · `ui.scenarios` "per default propone…" |
| FR-002 formato e "più alta" | `solutionVersion.ts` `versionProblem`, `app.ts` `versionIssue` | `version` (matrice versione corrente × candidata) · `ui.scenarios` "una versione non valida… blocca Next" · `ui.matrix` |
| FR-003 idempotenza | `solutionVersion.ts`, `app.ts` `versionFrom` | `version` ("scrive una sola volta") · `engine.pipeline` (seconda esecuzione) · `ui.scenarios` "tornare indietro e ricostruire…" |
| FR-004 eccezione | `solutionVersion.ts` | `version` (managed, non trovata, permessi) |
| FR-005 niente export | `packaging.ts` | `engine.pipeline` "quando la versione non si riesce ad alzare" · `ui.scenarios` (tre casi) |
| FR-006 verifica dello zip | `rezip.ts`, `packaging.ts` | `verify` (versione diversa, assente, non attesa) · `engine.pipeline` "l'export che NON porta la versione…" |
| FR-007 testo | `app.ts` `versionHintHtml` | `ui.scenarios` (due stati + revisione) · mutazioni |
| FR-008 manifest/storico | `artifacts.ts`, `app.ts` | `ui.scenarios` · `ui.matrix` |
| FR-009 nomi e nota | `app.ts` | `ui.scenarios` "l'elenco degli artefatti…" · "lo stesso package per un altro ambiente" |
| FR-010 dopo il salvataggio | `app.ts` | `ui.scenarios` "dopo il salvataggio la prossima operazione…" |
| FR-011 headless | `headless.ts` | `smoke:multi` |

## Follow-up

- Provare un utente senza privilegio sulla solution (research §6).
- Eventuale **pubblicazione delle personalizzazioni** prima dell'export (`PublishAllXml`): discussa, non implementata (research §3).
