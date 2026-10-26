# Tasks 014
- [x] T001 Nome, autore, titolo e header senza marchio (`package.json`, `index.html`, `app.ts`, `files.ts`, `styles.css`)
- [x] T002 Versione dell'header da `package.json` (`vite.config.ts`, `vitest.config.ts`, `globals.d.ts`, `app.ts`)
- [x] T003 Dialog di conferma `confirmVersionWrite` (`app.ts`)
- [x] T004 Consenso headless e codice errore (`headless.ts`, contratto 001)
- [x] T005 README "What this tool changes"
- [x] T006 Test e mutazioni (`ui.versionwrite.test.ts`, `headless.versionwrite.test.ts`, `mutation-check.mjs`)
- [x] T007 Avviso formato solo se manca `<name>` (`compat.ts` `relevantDrift`, `app.ts`, `packaging.ts`, `ui.driftfilter.test.ts`)
- [x] T010 Tema chiaro e scuro (`styles.css`, `app.ts` `applyTheme`, `ui.theme.test.ts`)
- [x] T011 URL e scope nel dialog, titolo README esatto (`app.ts`, `README.md`)
- [x] T008 Voce di changelog 1.1.1
- [x] T009 Prova a mano del quickstart su un DEV vero (26 ott 2026): dialog, header, assenza dell'avviso `categories`
- [ ] T012 Prova a mano dopo tema chiaro e URL nel dialog: punti 2 e 6 del quickstart, in entrambi i temi

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 | package.json, index.html, app.ts | «il nome visualizzato non contiene "Copilot"» |
| FR-002 | package.json | «l'autore non e' la piattaforma» |
| FR-003 | vite.config.ts, app.ts | «nessuna versione scritta a mano nell'header» |
| FR-004 | `app.ts` (`confirmVersionWrite`) | «chiede conferma», «nomina ambiente, solution…», «Go back non scrive», «confermando si passa» |
| FR-005 | `app.ts` | «con Raise the version spento non compare nessun avviso» |
| FR-006 | `headless.ts` | `headless.versionwrite.test.ts` (3 casi) |
| FR-007 | README.md | «ha la sezione e non nega la scrittura» |
| FR-008 | `compat.ts` (`relevantDrift`), `app.ts`, `packaging.ts` | `ui.driftfilter.test.ts` (unitari + schermata) |
| FR-009 | `app.ts` (`confirmVersionWrite`), README.md | «nomina ambiente, solution…» (URL, scope), «ha la sezione» |
| FR-010 | `styles.css`, `app.ts` (`applyTheme`) | `ui.theme.test.ts` (variabili, contrasto, applicazione, evento) |
