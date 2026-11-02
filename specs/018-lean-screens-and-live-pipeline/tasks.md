# Tasks 018
- [x] T001 Revisione sobria: tabella e selettore via, avvisi per Target (`app.ts`)
- [x] T002 Test della revisione e adeguamento dei test che leggevano la tabella (`ui.review.test.ts`, `ui-harness.ts`, altri)
- [x] T003 Mutazioni della revisione (`mutation-check.mjs`)
- [ ] T004 Popup: icona di intestazione, righe con icona, niente tabella ripetuta (`ui.ts`, `app.ts`, `icons.ts`, `styles.css`)
- [ ] T005 Pipeline numerata e viva (`app.ts`, `styles.css`)
- [ ] T006 Pulizia dei testi nelle altre schermate; frasi tolte in `research.md`
- [ ] T007 Test e mutazioni di T004-T006
- [ ] T008 Prova a mano del `quickstart.md`

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 niente agent né selettore | `app.ts` (`renderReviewStep`) | `ui.review.test.ts` «la revisione non ripete…» |
| FR-002 avvisi per Target | `app.ts` (`reviewWarningsHtml`) | «gli avvisi che restano» |
| FR-003 opzioni | `app.ts` (`renderReviewStep`) | «le opzioni della revisione» |
| FR-004 icone nel popup | da fare | da fare |
| FR-005 niente tabella ripetuta | da fare | da fare |
| FR-006 pipeline numerata | da fare | da fare |
| FR-007 reduced-motion | da fare | da fare |
| FR-008 senza colore | da fare | da fare |
| FR-009 pulizia | da fare | da fare |
