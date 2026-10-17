---

description: "Task list — publish on import per agent (retroattivo: completato)"
---

# Tasks: Publish on import per agent

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

## Phase 1 — Modello e motore (US1)

- [x] T001 [US1] `PublishMode`, `publishByAgent` in `tools/src/types.ts` — `b8aff7a`
- [x] T002 [US1] `publishModeFor()` e righe `publishOnImport` per agent in `buildPatchPlan` — `b8aff7a`
- [x] T003 [US1] `optionsFrom` headless accetta `publishByAgent` — `b8aff7a`
- [x] T004 [US1] Un agent escluso non riceve nulla — `b8aff7a`

## Phase 2 — Interfaccia (US1, US2, US3)

- [x] T005 [US1] Dal menu a tendina al toggle per riga — `cd79758`
- [x] T006 [US2] Toggle "per tutti" nell'intestazione → ultima riga della stessa tabella (`<tfoot>`) — `8f8995c`
- [x] T007 [US2] Stato acceso = valore comune degli agent spuntati (`bulkToggleHtml`) — `8f8995c`
- [x] T008 [US3] Anteprima: pannello per agent col valore dopo la patch — `f3fd119`; solo valore finale — `a4c509c`
- [x] T009 [US3] Revisione: colonna col valore effettivo — `b8aff7a`

## Phase 3 — Verifica (US4)

- [x] T010 [US4] `verifyZip` con `ExpectedValues.publish`; `packaging.ts` lo costruisce dal piano — `490291d`
- [x] T011 [US4] Confronto byte-per-byte: una entry con byte in coda non è identica — `490291d`
- [x] T012 [US4] `smoke:multi`: scrive valori diversi per agent e li rilegge dallo zip — `dfd7774`

## Phase 4 — Spec e documentazione

- [x] T013 FR-090a, FR-023c nella 001 — `b8aff7a`, `cd79758`
- [x] T014 Voce 1.1.0 del changelog — `b8aff7a`, `cd79758`, `f3fd119`

## Tracciabilità: requisito → codice → test

| Requisito | Codice | Test |
|---|---|---|
| FR-001 toggle per agent | `app.ts` `publishToggleHtml`, `setPublishMode` | `ui.matrix` (azioni `publish`) · `ui.scenarios` |
| FR-002 "per tutti" | `app.ts` `bulkToggleHtml`, `agentRowsHtml` (`tfoot`) | `ui.matrix` ("toggle per tutti") · `ui.scenarios` "si accende quando i valori sono tutti uguali" |
| FR-003 nessuna modifica per keep/esclusi/uguali | `patch.ts` | `engine.plan` · `engine.pipeline` (entry byte-identiche) |
| FR-004 righe del piano | `patch.ts` | `engine.plan` (matrice esaustiva a 1 e 2 agent) |
| FR-005 revisione/anteprima | `app.ts` | `ui.matrix` (revisione, "Publish and channels") |
| FR-006 rilettura | `rezip.ts`, `packaging.ts` | `verify` (zip respinti) · `engine.pipeline` |
| FR-007 manifest/storico | `artifacts.ts` | `ui.matrix` (`publishByAgent` nel manifest) |
| FR-008 headless | `headless.ts` | `smoke:multi` |
| FR-009 grammatica visiva | `styles.css` | `ui.scenarios` "il toggle riempie la sua colonna" |

## Follow-up

- Provare in UAT un import con valori diversi (quickstart P5).
