---

description: "Task list — rename a livello di solution (retroattivo: tutto completato)"
---

# Tasks: Rename a livello di solution

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

**Nota**: specifica scritta a lavoro concluso. Ogni task riporta il commit che l'ha realizzato; i test sono descritti nella spec 006.

## Phase 1 — Stato e flusso (US1, US2, US5)

- [x] T001 [US1] Sostituire `state.activeAgent` con l'insieme degli esclusi e i helper `solutionAgents()` / `selectedAgents()` in `tools/src/app.ts` — `60ee56d`
- [x] T002 [US1] `startRename()`: il rename parte dalla solution, non da un agent; `selectAgent()` rimosso — `60ee56d`
- [x] T003 [US1] Passo del suffisso con l'elenco degli agent, spunta e nome risultante aggiornato mentre si digita (`agentRowsHtml`) — `60ee56d`
- [x] T004 [US1] `runPackaging(..., schemaNames[])` riceve tutti gli agent selezionati; chiave di cache sul loro insieme — `60ee56d`
- [x] T005 [US2] Prossimo disabilitato senza agent selezionati, con avviso — `60ee56d`
- [x] T006 [US5] La ricerca apre la solution e evidenzia la riga (`highlightAgentId`) — `60ee56d` *(FR-023b nella 001, qui FR-008)*
- [x] T007 [US5] Cambio di solution azzera lo stato; tornare alla stessa lo conserva (`selectSolution`) — `60ee56d`

## Phase 2 — Rete di sicurezza e falsi allarmi (US3)

- [x] T008 [US3] `suffixesAfter()` + avviso in revisione + conferma bloccante al salvataggio (`confirmThenSave`) — `60ee56d`, `e35c756`
- [x] T009 [US3] GPT `<name>` come posto noto in entrambe le forme — `e35c756`
- [x] T010 [US3] Impronta del formato: unione delle chiavi di **tutti** gli agent; `channels` e `isLightweightBot` opzionali in `baseline/package-format.json` — `e35c756`
- [x] T011 [US3] `<name>` del `bot.xml` di un altro agent come posto noto (due agent con lo stesso nome) — `337536c`

## Phase 3 — Esiti, inventario e revisione (US4, US6)

- [x] T012 [US6] `buildInventory(files, agentSchemas[])` — `60ee56d`
- [x] T013 [US6] `agentOutcomes()` unica fonte per manifest e storico; `excluded` registrato — `60ee56d`, `490291d`
- [x] T014 [US4] Revisione: una riga per agent; esclusi nominati; avviso `No name changes` — `60ee56d`
- [x] T015 [US4] Nome risultante non va a capo (`cell-nowrap`) — `bb6858e`
- [x] T018 [US3] Riga dell'escluso con il suffisso che mantiene + avviso che nomina gli agent (`clashingAgents`, `.cell-warn`) — `7ede0c2`

## Phase 4 — Specifiche e documentazione

- [x] T016 FR-023, FR-023a/b/c, FR-076, FR-096, FR-096a riscritti/aggiunti nella 001 — `60ee56d`, `e35c756`
- [x] T017 Voce 1.1.0 del `CHANGELOG.md` — `ee5c271`

## Tracciabilità: requisito → codice → test

| Requisito | Codice | Test (spec 006) |
|---|---|---|
| FR-001 scope solution | `app.ts` `startRename`, `selectedAgents` | `ui.flow` · `ui.matrix` (percorsi) · `engine.plan` (matrice) |
| FR-002 esclusione | `app.ts` `agentRowsHtml`, `patch.ts` `buildPatchPlan` | `engine.plan` · `engine.pipeline` (esclusi byte-identici) · `ui.scenarios` "riattivare un agent…" |
| FR-003 nomi misti | `app.ts` `suffixesAfter`, `clashingAgents`, `confirmThenSave` | `ui.matrix` (conferma attesa solo se misti) · `ui.scenarios` "annullare la conferma…" · `ui.matrix` (`offText`: riga dell'escluso) · `ui.cards` "nomi, spunte e publish" |
| FR-004 nome finale | `patch.ts` `buildName`, `package.ts` `splitSuffix` | `engine.plan` · `package.format` "suffisso e versione: casi limite" |
| FR-005 falsi allarmi | `compat.ts` | `package.format` "nessun falso allarme" · "rete di sicurezza" |
| FR-006 inventario | `package.ts` | `package.format` "inventario del package" |
| FR-007 revisione | `app.ts` `renderReviewStep` | `ui.matrix` (tabella di revisione) |
| FR-008 ricerca | `app.ts` `selectSolution(…, highlight)` | `ui.scenarios` "ricerca" · "solution non rinominabili" |
| FR-009 stato | `app.ts` `selectSolution` | `ui.scenarios` "stato tra solution" |
| FR-010 esiti | `patch.ts` `agentOutcomes`, `artifacts.ts` | `outcomes` · `ui.matrix` (manifest e storico) |
| FR-011 HTML | `app.ts` `escapeHtml` | `ui.scenarios` "contenuto non fidato" |

## Follow-up

- Verificare dopo un import reale che Teams e M365 Copilot mostrino il nome nuovo per un agent creato col suffisso (research §2).
