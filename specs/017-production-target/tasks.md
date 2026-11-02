# Tasks 017
- [x] T001 Campo `production` e funzioni pure (`types.ts`, `services/targets.ts`)
- [x] T002 Casella nella riga, gestore, condizione di Review, etichetta e testo (`app.ts`, `styles.css`)
- [x] T003 Test: servizio, schermata e matrice; harness (`targets.service.test.ts`, `ui.production.test.ts`, `ui-harness.ts`)
- [x] T004 Mutazioni (`mutation-check.mjs`)
- [ ] T005 Prova a mano del `quickstart.md` su un DEV vero

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 casella solo sulla riga senza nome | `app.ts` (`targetRowsHtml`) | `ui.production.test.ts` «la casella compare solo sulla riga senza nome» |
| FR-002 nessun avviso se marcato | `app.ts` (Review) | «matrice: marcato, uno o più target» |
| FR-003 avviso invariato se non marcato | `app.ts` (Review) | «matrice» e `ui.nosuffix.test.ts` |
| FR-004 conta solo il target spuntato | `app.ts` (`selectedTargetList`) | «un target Production non spuntato non cambia nulla» |
| FR-005 salvataggio e liste vecchie | `services/targets.ts` | `targets.service.test.ts` «production» e «riaprendo il tool» |
| FR-006 rinomina azzera, valore su target con nome ignorato | `services/targets.ts` | servizio e «rinominare toglie la casella» |
| FR-007 «PROD (no suffix)» nella tabella | `app.ts` (`targetsOverviewHtml`) | «il Target Production si chiama PROD, e dice che non ha suffisso» |
| FR-008 Add / Restore non marcano; non entra nel package | `services/targets.ts`, `app.ts` | «Add no suffix parte spento», «il manifest non contiene production» |
| FR-009 testo di aiuto | `app.ts` | «il testo spiega la casella» |
| FR-010 alias PROD dove si nomina il Target | `app.ts` (`targetLabel`) | «l'alias PROD dove il tool nomina il Target» (linguette, matrice, casella, chip) |
