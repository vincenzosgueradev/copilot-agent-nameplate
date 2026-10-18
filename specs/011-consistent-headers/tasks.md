# Tasks: intestazioni uniformi

- [x] T001 Audit delle intestazioni e delle ripetizioni (spec.md)
- [x] T002 Test prima del codice: `tools/test/ui.headers.test.ts` (etichette, sottotitoli, lingua, escape)
- [x] T003 `app.ts`: componente `statsHtml`, `solutionSubtitle`; elenco, solution aperta e anteprima lo usano
- [x] T004 Percorso: `Checks` e `Result`
- [x] T005 Harness: `UiSolution.friendly` per provare nome visualizzato uguale o diverso dal nome univoco
- [x] T006 Mutazioni (011): 8/8 scoperte
- [x] T007 `npm test` (251 verdi), `tsc`, build; `test:full` e `test:mutation` completi prima del rilascio
- [x] T008 Changelog (*Changed*), `specs/README.md`

## Tracciabilità

| Requisito | Codice | Test |
|---|---|---|
| FR-001 un solo componente, con escape | `app.ts` `statsHtml` | `ui.headers.test.ts` «un valore con HTML resta testo» |
| FR-002 etichette inglesi | `app.ts` | «elenco delle solution», «le tile: Version, Publisher…», «anteprima» |
| FR-003 nessuna ripetizione | `app.ts` | «il numero di agent sta nelle tile», «il nome non si ripete», «due totali» |
| FR-004 sottotitolo | `app.ts` `solutionSubtitle` | «nome visualizzato diverso/uguale», «managed», «agent senza solution» |
| FR-005 percorso | `app.ts` `buildBreadcrumb` | «il percorso usa gli stessi nomi del passo» |
| FR-006 nessun italiano | `app.ts` | «nessuna parola italiana in nessuna schermata attraversata» |
