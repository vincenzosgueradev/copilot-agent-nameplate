# Tasks 018
- [x] T001 Revisione sobria: tabella e selettore via, avvisi per Target (`app.ts`)
- [x] T002 Test della revisione e adeguamento dei test che leggevano la tabella (`ui.review.test.ts`, `ui-harness.ts`, altri)
- [x] T003 Mutazioni della revisione (`mutation-check.mjs`)
- [x] T004 Popup: icona di intestazione, righe con icona, niente tabella ripetuta (`ui.ts`, `app.ts`, `icons.ts`, `styles.css`)
- [x] T005 Pipeline numerata e viva (`app.ts`, `styles.css`)
- [x] T006 Pulizia dei testi nelle altre schermate; frasi tolte in `research.md`
- [x] T007 Test e mutazioni di T004-T006 (`ui.polish.test.ts` con 17 mutazioni `polish:`, `ui.lean.test.ts` con 13 mutazioni `lean:`)
- [ ] T008 Prova a mano del `quickstart.md`

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 niente agent né selettore | `app.ts` (`renderReviewStep`) | `ui.review.test.ts` «la revisione non ripete…» |
| FR-002 avvisi per Target | `app.ts` (`reviewWarningsHtml`) | «gli avvisi che restano» |
| FR-003 opzioni | `app.ts` (`renderReviewStep`) | «le opzioni della revisione» |
| FR-004 icone nel popup | `services/ui.ts`, `icons.ts`, `index.html`, `styles.css`, `app.ts` (`confirmVersionWrite`) | `ui.polish.test.ts` «popup: l'icona nell'intestazione», «popup della versione» |
| FR-005 tabella mantenuta, con l'icona del file | `app.ts` (`targetsOverviewHtml`) | «la tabella dei package resta, con l'icona dell'archivio» |
| FR-006 pipeline numerata | `app.ts` (`packProgressHtml`), `styles.css` (`.ph*`) | «pipeline: passi numerati, quello in corso si vede» |
| FR-007 reduced-motion | `styles.css` | «il passo in corso pulsa, e con prefers-reduced-motion si ferma» |
| FR-008 senza colore | numero, spunta e scala | «gli stati sono sempre: fatti, al piu' uno in corso, da fare», «piu' grande» |
| FR-009 pulizia | `app.ts`, `styles.css` | `ui.lean.test.ts` «le frasi ridondanti non ci sono piu'» |
