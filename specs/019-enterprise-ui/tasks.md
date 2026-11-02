# Tasks 019
- [x] T001 Stepper: cerchi grandi, corrente evidente, linea che si riempie (`app.ts`, `styles.css`)
- [x] T002 Test e mutazioni dello stepper (`ui.stepper.test.ts`, 9 mutazioni `stepper:`; una equivalente tolta)
- [x] T003 Sezioni ripiegabili con info: `decoratePanels`, `data-panel`, `data-info`, stato in sessione (`app.ts`, `styles.css`)
- [x] T004 Test e mutazioni delle sezioni (`ui.panels.test.ts`, 23 mutazioni `panels:`; due equivalenti tolte)
- [x] T005 `services/diff.ts`: `diffLines`, prefisso/suffisso, LCS, contesto, pezzo evidenziato, limiti
- [x] T006 Test del servizio di diff: matrice, proprieta' con seme fisso, casi negativi (`diff.service.test.ts`, `diff.view.test.ts`, 28 mutazioni `diff:`)
- [x] T007 Diff nell'anteprima: schede Diff / Table, Split / Unified, file veri da `applyPatch` (`app.ts`, `styles.css`)
- [x] T008 Test e mutazioni del diff nella schermata (`ui.diff.test.ts`, 27 test, 21 mutazioni `diffui:`)
- [ ] T009 Rifinitura dell'aspetto e tema chiaro
- [ ] T010 Prova a mano del `quickstart.md`

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001, FR-002 stepper | `app.ts` (`stepperHtml`), `styles.css` (`.stepper*`) | `ui.stepper.test.ts` «lo stepper in ogni schermata», «l'aspetto» |
| FR-003…FR-006 sezioni | `app.ts` (`decoratePanels`, `data-panel`, `data-info`), `styles.css` (`.panel-*`) | `ui.panels.test.ts` (riquadri decorati, ripiegare, stato tra le schermate, info, CSS) |
| FR-007…FR-013 diff | `services/diff.ts`, `services/diffView.ts`, `app.ts` (`changeGroupsHtml`, `diffMode`, `changeTabs`), `styles.css` (`.diff*`, `.change-tab*`) | `diff.service.test.ts`, `diff.view.test.ts`, `ui.diff.test.ts` (schede, righe, Split / Unified, file veri dentro gli zip, piu' Target, senza cambio, HTML) |
| FR-014 aspetto | da fare | da fare |
