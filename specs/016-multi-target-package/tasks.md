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
- [x] T008 `writeArtifactSet` multi-Target: una cartella, uno zip managed per Target, gli export originali una volta; nome della cartella con fino a 3 etichette, oltre `[N targets]` (FR-012)
- [x] T009 `buildManifest` v2 secondo `contracts/manifest-v2.md`, sempre (D6); `ArtifactFile.target` lega ogni file al suo Target (FR-012, FR-013)
- [x] T010 Riscritti sulla spec i test che leggevano il manifest 1.x (`ui.matrix`, `ui.scenarios`); nuovi `test/artifacts.targets.test.ts` (26 test)
- [x] T011 `PackagingRecord.targets` e `buildHistoryRecord`: un record per operazione, i campi di sempre sono quelli del primo Target (FR-014); 19 mutazioni (`artefatti:`)
- [x] T012 `headless.ts` usa il motore con un Target; l'app, per ora, anche (un Target, adattatore `targetView`)

## Fase 4 — Schermata
- [x] T013 Passo Targets: lista con casella, nome modificabile, publish per Target, su/giù, trascinamento, rimozione, «Add» e «Add "no suffix"»; messaggio sotto il campo; salvataggio a ogni modifica (FR-001…FR-005, FR-011)
- [x] T014 `state.suffix` sostituito da `state.targets`, `selectedTargets`, `activeTargetName`: i 19 punti di lettura spostati uno a uno; con un Target il comportamento e' quello di sempre
- [x] T015 Spunte per solution, lette all'apertura del passo (`ensureTargets`) e salvate a ogni modifica e a «Review» (FR-006, FR-007)
- [x] T016 Selettore dei Target in tabella agent, Review, Preview e Verify (nascosto con un Target); tabella dei Target nei controlli; risultato con un archivio per Target (FR-006, FR-013)
- [x] T017 Il numero dei salvataggi e' dichiarato prima di scrivere: elenco dei file nel passo Suffix («N archives: N saves») e conteggio in Review; `warnAboutDialogs` al momento di scrivere (ricerca §3)
- [x] T018 CSS (`.target-*`, `.handoff--many`) con le variabili del tema; testi in inglese
- [x] T019 Test della schermata: `test/ui.targets.test.ts` (47 test); banco di prova esteso (`startRenameBare`, comandi dei Target, `failSettings`); test dei vecchi percorsi adattati ai Target

## Fase 4b — Agent e publish per Target (D8, dopo la prova a mano)
- [x] T025 Spec: D8 sostituisce D5 e il «uguale per tutti» di D7 (fatto in `spec.md`)
- [x] T026 Motore: ogni Target puo' portare i **suoi** agent e le **sue** eccezioni di publish (`TargetRun`); senza, valgono quelli condivisi di oggi
- [x] T027 Test del motore: agent diversi per Target, publish per agent diverso per Target, confronto fra Target con esclusioni diverse, negativi
- [x] T028 Schermata: sotto ogni Target spuntato la sua tabella di agent (casella, nome dopo la rinomina, publish per agent); intestazione sulla lista dei Target; via il selettore `[UAT] | [PROD]` dalla tabella agent
- [x] T029 Anteprima, controlli, conferma dei nomi misti, risultato e storico con le scelte per Target
- [x] T030 Test della schermata e mutazioni (`motore:`, `schermata:`) aggiornati; poi di nuovo T021–T022

## Fase 4c — Rifiniture della prova a mano (D9)
- [x] T031 Publish del Target a tre pulsanti; cambiarlo aggiorna gli agent sotto (azzera le loro eccezioni)
- [x] T032 `restoreDefaults` / `missingPresets` e pulsante Restore defaults
- [x] T033 Riepilogo dei Target (agent, publish, file) nella revisione e nei dialoghi della versione e del suffisso vuoto
- [x] T034 Test del servizio e della schermata
- [x] T035 Mutazioni D9 (14) tutte scoperte

## Fase 5 — Chiusura
- [x] T020 Mutazioni in `scripts/mutation-check.mjs` (gruppi `targets:`, `confronto:`, `motore:`, `artefatti:`, `schermata:`), tutte scoperte
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
