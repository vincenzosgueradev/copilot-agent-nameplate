# Tasks 013
- [x] T001 Variante avviso del dialogo (`services/ui.ts`, `styles.css`)
- [x] T002 `confirmNoSuffix` e aggancio a Review (`app.ts`)
- [x] T003 Test della schermata e mutazioni (`ui.nosuffix.test.ts`, `mutation-check.mjs`)
- [ ] T004 Prova a mano del quickstart su un DEV vero

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 avviso a suffisso vuoto | `app.ts` (`next-btn`) | «compare l'avviso», «soli spazi» |
| FR-002 elenco completo prima → dopo | `app.ts` (`confirmNoSuffix`) | «spiega che il suffisso esistente viene tolto» |
| FR-003 Go back | `services/ui.ts` | «Go back chiude l'avviso» |
| FR-004 Continue | `app.ts` | «Continue without suffix porta alla revisione» |
| FR-005 nessun avviso con suffisso | `app.ts` | «con un suffisso scritto non compare» |
| FR-006 variante avviso | `styles.css` `.dialog--warning` | «classe dialog--warning» |
