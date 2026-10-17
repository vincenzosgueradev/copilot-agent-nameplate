# Implementation Plan: Perfezionamenti di flusso e layout

**Branch**: `005-flow-and-layout-refinements` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

## Summary

Modifiche quasi tutte a `app.ts` e `styles.css`, più una pausa tra le fasi in `packaging.ts`. Nessun cambiamento di dominio: il package è lo stesso.

## Technical Context

TypeScript strict · DOM puro · CSS con variabili · Vitest + jsdom. Nessuna dipendenza nuova.

## Constitution Check

| Principio | Esito |
|---|---|
| VII Enterprise UI | ✅ stesso tipo di toggle ovunque; pannelli impilati; nessuna emoji |
| UI senza ridondanze (preferenza del progetto) | ✅ FR-010 |
| VI Simplicity | ✅ il piede è una riga della stessa tabella: allineamento per costruzione, non per padding |

## Project Structure

```text
tools/src/
├── app.ts            # agentRowsHtml (colgroup, tfoot), bulkToggleHtml, publishToggleHtml,
│                     #   renderReviewStep (.stack), changeGroupsHtml, scrollToTop + navigateTo,
│                     #   phasesFor/phaseFromMessage, DONE_HOLD_MS
├── styles.css        # .data-table--fill, .toggle-group--sm (flex:1), .cell-nowrap, .change-group,
│                     #   .panel-foot, .art-desc/.art-body, .version-field
└── services/packaging.ts   # PHASE_PAUSE_MS e pause(listener)
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | `table-layout: fixed` + `<colgroup>` | Le colonne si dividono lo spazio invece di ammucchiarsi |
| D2 | Piede in `<tfoot>` della stessa tabella | I toggle "per tutti" e di riga condividono la colonna: l'allineamento non può divergere |
| D3 | `.stack` al posto di `.two-col` nella revisione | Stesso layout degli altri passi |
| D4 | `changeGroupsHtml` raggruppa per agent; la versione è una nota | La versione non è un cambio del package |
| D5 | `scrollToTop` su `SCROLLERS` dentro `navigateTo`, una volta per cambio di schermata | I ridisegni sul posto non passano di lì |
| D6 | `pause(listener)` solo se qualcuno ascolta l'avanzamento | Test e headless restano veloci |
| D7 | `.cell-nowrap` con `max-width: none` dopo le regole `.cell-strong` | Stessa specificità: vince l'ordine |

## Complexity Tracking

Nessuna deroga.

## Limite noto

I test non misurano i pixel (jsdom non fa layout). Il criterio SC-004 è una verifica a vista dell'utente; ogni segnalazione ha portato a una regola strutturale testata, così lo stesso difetto non può ripresentarsi senza che un test cada.
