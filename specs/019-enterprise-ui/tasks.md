# Tasks 019
- [x] T001 Stepper: cerchi grandi, corrente evidente, linea che si riempie (`app.ts`, `styles.css`)
- [x] T002 Test e mutazioni dello stepper (`ui.stepper.test.ts`, 9 mutazioni `stepper:`; una equivalente tolta)
- [ ] T003 Sezioni ripiegabili con info: `decoratePanels`, `data-panel`, `data-info`, stato in sessione (`app.ts`, `styles.css`)
- [ ] T004 Test e mutazioni delle sezioni (`ui.panels.test.ts`)
- [ ] T005 `services/diff.ts`: `diffLines`, prefisso/suffisso, LCS, contesto, pezzo evidenziato, limiti
- [ ] T006 Test del servizio di diff: matrice, proprieta' con seme fisso, casi negativi (`diff.service.test.ts`) e mutazioni
- [ ] T007 Diff nell'anteprima: schede Diff / Table, Split / Unified, file veri da `applyPatch` (`app.ts`, `styles.css`)
- [ ] T008 Test e mutazioni del diff nella schermata (`ui.diff.test.ts`)
- [ ] T009 Rifinitura dell'aspetto e tema chiaro
- [ ] T010 Prova a mano del `quickstart.md`

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001, FR-002 stepper | `app.ts` (`stepperHtml`), `styles.css` (`.stepper*`) | `ui.stepper.test.ts` «lo stepper in ogni schermata», «l'aspetto» |
| FR-003…FR-006 sezioni | da fare | da fare |
| FR-007…FR-013 diff | da fare | da fare |
| FR-014 aspetto | da fare | da fare |
