# Tasks 019
- [x] T001 Stepper: cerchi grandi, corrente evidente, linea che si riempie (`app.ts`, `styles.css`)
- [x] T002 Test e mutazioni dello stepper (`ui.stepper.test.ts`, 9 mutazioni `stepper:`; una equivalente tolta)
- [x] T003 Sezioni ripiegabili con info: `decoratePanels`, `data-panel`, `data-info`, stato in sessione (`app.ts`, `styles.css`)
- [x] T004 Test e mutazioni delle sezioni (`ui.panels.test.ts`, 23 mutazioni `panels:`; due equivalenti tolte)
- [x] T005 `services/diff.ts`: `diffLines`, prefisso/suffisso, LCS, contesto, pezzo evidenziato, limiti
- [x] T006 Test del servizio di diff: matrice, proprieta' con seme fisso, casi negativi (`diff.service.test.ts`, `diff.view.test.ts`, 28 mutazioni `diff:`)
- [x] T007 Diff nell'anteprima: schede Diff / Table, Split / Unified, file veri da `applyPatch` (`app.ts`, `styles.css`)
- [x] T008 Test e mutazioni del diff nella schermata (`ui.diff.test.ts`, 27 test, 21 mutazioni `diffui:`)
- [x] T009 Rifinitura dell'aspetto e tema chiaro (contrasto di 4,5 verificato per i colori del diff nei due temi, `ui.diff.test.ts`)
- [x] T011 Elenchi ripiegabili con piu' di due agent: Suffix, anteprima, storico (`app.ts`, `styles.css`; FR-015)
- [x] T012 Stepper non tagliato in alto (`styles.css`; FR-016)
- [x] T013 Storico piu' curato e «Clear all» (`app.ts`, `services/history.ts`, `styles.css`; FR-017)
- [x] T014 Test e mutazioni di FR-015…FR-017 (`ui.fold.test.ts`, 21 test, 17 mutazioni `fold:`)
- [x] T010 Prova a mano del `quickstart.md` (compresi i punti 7 e 8) — fatta il 2026-11-07, punti 1-8 ok in tema chiaro e scuro e con animazioni ridotte

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001, FR-002 stepper | `app.ts` (`stepperHtml`), `styles.css` (`.stepper*`) | `ui.stepper.test.ts` «lo stepper in ogni schermata», «l'aspetto» |
| FR-003…FR-006 sezioni | `app.ts` (`decoratePanels`, `data-panel`, `data-info`), `styles.css` (`.panel-*`) | `ui.panels.test.ts` (riquadri decorati, ripiegare, stato tra le schermate, info, CSS) |
| FR-007…FR-013 diff | `services/diff.ts`, `services/diffView.ts`, `app.ts` (`changeGroupsHtml`, `diffMode`, `changeTabs`), `styles.css` (`.diff*`, `.change-tab*`) | `diff.service.test.ts`, `diff.view.test.ts`, `ui.diff.test.ts` (schede, righe, Split / Unified, file veri dentro gli zip, piu' Target, senza cambio, HTML) |
| FR-014 aspetto | `styles.css` (variabili `--diff-*` nei blocchi del tema scuro e chiaro) | `ui.diff.test.ts` «il CSS del diff», «i colori del diff si leggono in tutti e due i temi»; `ui.theme.test.ts` |
| FR-015 elenchi ripiegabili | `app.ts` (`FOLD_AFTER`, `agentsBlockHtml`, `foldedAgentLists`, `foldedChanges`, `data-change-fold`, `agentsHtml` dello storico), `styles.css` (`.fold-*`) | `ui.fold.test.ts` «elenco degli agent di un Target», «agent dell'anteprima» e «i Target sono chip separati» |
| FR-016 stepper non tagliato | `styles.css` (`.step-header-row`, `.stepper`) | `ui.fold.test.ts` «lo stepper non si taglia in alto» |
| FR-017 storico e Clear all | `app.ts` (`renderHistoryStep`), `services/history.ts` (`clearHistory`), `styles.css` (`.rec-*`, `.history-tools`) | `ui.fold.test.ts` «storico: Clear all» |
