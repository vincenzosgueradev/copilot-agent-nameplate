---

description: "Task list — perfezionamenti di flusso e layout (retroattivo: completato)"
---

# Tasks: Perfezionamenti di flusso e layout

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1 — Tabelle e toggle (US1, US6)

- [x] T001 [US1] Piede del pannello con padding e bordo (`.panel-foot`) — `b438e74`
- [x] T002 [US1] Nome risultante senza a capo (`.cell-nowrap`) — `bb6858e`
- [x] T003 [US1] Azioni globali sotto le colonne: da barra separata a riga della stessa tabella — `8f8995c`
- [x] T004 [US1] Tabella a layout fisso e toggle che riempie la colonna (`.data-table--fill`, `.toggle-group--sm`) — `b9cff42`
- [x] T005 [US6] Descrizioni degli artefatti a tutta riga (`.art-desc`, `.art-body`) — `722bfe9`

## Phase 2 — Revisione e anteprima (US2, US3)

- [x] T006 [US2] Revisione: `.stack` al posto di `.two-col` — `722bfe9`
- [x] T007 [US3] `changeGroupsHtml`: un blocco per agent; versione come nota; esclusi nominati — `722bfe9`
- [x] T008 [US3] Ordine dei blocchi per nome finale; titolo con nome e schema — `722bfe9`

## Phase 3 — Flusso (US4, US5)

- [x] T009 [US4] Pausa di 700 ms tra le fasi solo con ascoltatore (`pause(listener)`) — `722bfe9`
- [x] T010 [US4] "completed" per 1,8 s (`DONE_HOLD_MS`) — `aa700bc`
- [x] T011 [US5] `scrollToTop` su `SCROLLERS` dentro `navigateTo` — `be7eb8c`
- [x] T012 [US1] Fase aggiuntiva "Raise the version in DEV" nell'avanzamento (spec 004)

## Phase 4 — Verifica

- [x] T013 Test strutturali e scenari per ogni regola (spec 006) — `76e611d`, `8f8995c`, `be7eb8c`, `b9cff42`
- [x] T014 Mutazioni per ciascuna regola, tutte scoperte — `76e611d`, `be7eb8c`, `b9cff42`
- [x] T015 FR-075 / FR-075a nella 001 — `722bfe9`
- [x] T016 Voce 1.1.0 del changelog — `722bfe9`, `8f8995c`, `be7eb8c`, `b9cff42`

## Tracciabilità: requisito → codice → test

| Requisito | Codice | Test |
|---|---|---|
| FR-001 tabella e toggle | `styles.css` `.data-table--fill`; `app.ts` colgroup | `ui.scenarios` "il toggle riempie…" · "le colonne… si dividono la larghezza" |
| FR-002 piede nella tabella | `app.ts` `<tfoot>` | `ui.matrix` "le azioni globali stanno nel piede…" · "STESSA colonna…" |
| FR-003 nome senza a capo | `.cell-nowrap` | `ui.matrix` "il nome risultante non va a capo" |
| FR-004 pannelli impilati | `renderReviewStep` | `ui.scenarios` "i pannelli della revisione stanno uno sotto l'altro" |
| FR-005 blocchi per agent | `changeGroupsHtml` | `ui.scenarios` "What gets changed…" · `ui.matrix` (blocchi attesi a ogni percorso) |
| FR-006 fasi visibili | `packaging.ts` `pause`, `DONE_HOLD_MS` | `ui.scenarios` "le fasi si vedono passare" |
| FR-007 scorrimento | `navigateTo`, `scrollToTop` | `ui.scenarios` "posizione di scorrimento" (3 test) |
| FR-008 descrizioni | `styles.css` | `ui.scenarios` "le descrizioni… non hanno una larghezza massima" |
| FR-009 margini del piede | `.panel-foot` | *(regola CSS; verifica a vista)* |
| FR-010 niente ripetizioni | anteprima: solo il valore finale (spec 003) | `ui.matrix` |

## Follow-up

- La verifica a vista (quickstart L1–L6) resta a carico dell'utente.
