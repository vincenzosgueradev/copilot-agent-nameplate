# Tasks 016

Regole del progetto (CLAUDE.md): a ogni modifica `npx tsc --noEmit`, `npm run build`, `npm test`; funzione nuova con matrice di test e oracolo scritto dalla spec; dopo ogni cambio di logica `npm run test:mutation` (gruppo `targets:`); i test esistenti **non si modificano** salvo T010 e T011. Un commit per fase, a fase verificata.

## Fase 1 — Lista dei Target (servizio)
- [x] T001 Tipi `Target` e `TargetSelection` (`src/types.ts`); `TargetResult` arriva con il motore (T006)
- [x] T002 `services/targets.ts`: funzioni pure `defaultTargets`, `validateTargetName`, `moveTarget`, `addTarget`, `removeTarget`, `renameTarget`, `setTargetPublish`, `reconcileSelection`, `renameInSelections`
- [x] T003 `readTargets` / `saveTargets` (con `renamed` che porta le spunte) / `readSelection` / `saveSelection`, coda di scritture, lettura tollerante (FR-004)
- [x] T004 Test: `test/targets.service.test.ts` (85 test: matrice operazioni × stato, negativi, mutazioni gruppo `targets:`)

## Fase 2 — Motore
- [x] T005 `services/compare.ts`: confronto per entry e classificazione (FR-013); una differenza e' attesa solo in `bots/<schema>/bot.xml` e `configuration.json` e solo dove una patch ha scritto
- [x] T006 `runPackagingTargets` in `packaging.ts` (rifiuta lista vuota e nomi doppi prima di toccare DEV); `runPackaging` come involucro (FR-008, FR-009, FR-010)
- [x] T007 Test: `test/engine.targets.test.ts` (matrice di 48 casi: un export, una scrittura di versione, contenuto di ogni zip, confronto; un Target = `runPackaging`) e `test/compare.test.ts` (26 test); 18 mutazioni (`confronto:` e `motore:`)

## Fase 3 — Artifact set, manifest, storico
- [ ] T008 `writeArtifactSet` multi-Target e nome della cartella (FR-012)
- [ ] T009 `buildManifest` v2 secondo `contracts/manifest-v2.md` (FR-012, FR-013)
- [ ] T010 Riscrivere i test del formato del manifest sulla spec
- [ ] T011 `PackagingRecord.targets`, un record per operazione; riscrivere i test della riga di storico (FR-014)
- [ ] T012 Adattare `headless.ts` (un Target, nessun cambio di comportamento)

## Fase 4 — Schermata
- [ ] T013 Passo Targets: lista, aggiunta, rinomina, rimozione, su/giù, trascinamento, publish per Target (FR-001…FR-005, FR-011)
- [ ] T014 `state.suffix` → `state.targets` / `state.activeTarget`: i 19 punti di lettura uno a uno, senza cambiare il comportamento con un Target
- [ ] T015 Spunte per solution, ripristinate all'apertura (FR-006, FR-007)
- [ ] T016 Selettore dei Target in tabella agent, Review, Preview, Verify, Result; nascosto con un Target (FR-006)
- [ ] T017 Avviso col numero dei salvataggi prima di scrivere (ricerca §3)
- [ ] T018 CSS (tema chiaro e scuro) e testi in inglese
- [ ] T019 Test della schermata: `test/ui.targets.test.ts`

## Fase 5 — Chiusura
- [ ] T020 Mutazioni `targets:` in `scripts/mutation-check.mjs`, tutte scoperte
- [ ] T021 `npm run test:full` e `npm run test:mutation` interi
- [ ] T022 `/custom-types` e `/custom-dedup` (refactoring ampio, nuovi servizi)
- [ ] T023 Prova a mano del `quickstart.md` su un DEV vero
- [ ] T024 Al rilascio: `/custom-changelog` con Upgrade notes sul manifest, README (Features, «What this tool changes», «Artifact Set», «The Flow»), lettura di `../PPTB-PUBLISHING-RULES.md`. **Solo su via libera dell'utente.**

## Matrici e negativi previsti (oracolo = spec, non codice)
| Test | Dimensioni | Oracolo |
|---|---|---|
| Motore | Target spuntati (1, 2, 3) × un Target con suffisso vuoto (sì/no) × publish (uguale/diverso fra Target) × agent esclusi (nessuno/uno) × eccezione di publish per agent (nessuna/una, D7) = 48 | numero di zip = N; `exportPair` chiamato **1** volta; versione scritta **1** volta; ogni Target verificato; il confronto elenca solo nomi e `publishOnImport`; un Target = byte identici al risultato di `runPackaging` di oggi |
| Lista | stato (mai configurata / vuota / piena / illeggibile) × operazione (crea, rinomina, rimuovi, su, giù) | preset alla prima apertura; vuota resta vuota; illeggibile = mai configurata e se ne avvisa; nessun duplicato |
| Schermata | Target spuntati (0, 1, 2) × Target singolo con selettore nascosto × agent escluso | Next spento con 0; selettore assente con 1; nome «dopo» corretto per il Target scelto; l'esclusione vale per tutti |

**Negativi**: nome duplicato (anche con maiuscole diverse); due Target senza suffisso; nome troppo lungo; carattere non ammesso; lista illeggibile; salvataggio fallito (si dice, non si rompe); Target tolto che era spuntato; Target rinominato che era spuntato (la spunta segue); differenza inattesa fra due zip (il risultato è non valido); un solo Target non valido su tre (l'intero risultato è non valido); salvataggio annullato dall'utente a metà (manifest solo con i file scritti, come oggi).

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 lista per ambiente | `services/targets.ts` (T002–T003) | «Lista» (servizio) |
| FR-002 preset alla prima apertura | `defaultTargets` | «mai configurata → preset», «vuota resta vuota» |
| FR-003 crea / rinomina / rimuovi / riordina / publish | `services/targets.ts`, `app.ts` (T013) | «Lista» (operazioni), «Schermata» |
| FR-004 salvataggio e tolleranza | `saveTargets`, `readTargets` | «salvataggio fallito», «lista illeggibile» |
| FR-005 nome unico | `validateTargetName` | «duplicato», «due Target senza suffisso» |
| FR-006 da uno a N Target, comportamento di oggi con uno | `app.ts` (T014, T016), `runPackaging` | «un Target = risultato di oggi», «selettore assente con uno» |
| FR-007 spunte per solution | `readSelection`, `reconcileSelection` | «spunte ripristinate», «Target tolto», «Target rinominato» |
| FR-008 un solo export | `runPackagingTargets` | matrice motore: `exportPair` 1 volta |
| FR-009 una sola versione | `runPackagingTargets` | matrice motore: scrittura di versione 1 volta |
| FR-010 verifica per Target | `runPackagingTargets` | matrice motore; «un solo Target non valido» |
| FR-011 publish per Target modificabile | `app.ts` (T013, T016) | «Schermata»: publish nel piano del Target |
| FR-012 un artifact set, manifest v2 | `artifacts.ts` (T008–T009) | «cartella e file per N Target», «manifest v2» |
| FR-013 confronto col primo | `compare.ts` | «differenze solo di nome e publish», «differenza inattesa → non valido» |
| FR-014 un record di storico | `history.ts`, `PackagingRecord.targets` | «una riga per operazione» |
| FR-015 nessuna scrittura oltre la versione | — (nessun codice di scrittura aggiunto) | invariati «prima del salvataggio non viene scritto nulla» e `headless.versionwrite` |
