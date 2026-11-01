# Ricerca 016

Basata sul codice del 2026-11-01 (1.1.4 + 015).

## Come funziona oggi (fatti verificati nel codice)
- `runPackaging(solution, suffix, agents, options)` (`services/packaging.ts`) fa, in ordine: alza la versione in DEV (se `options.newVersion`), `exportPair` (managed + unmanaged), legge i due package, calcola il **Patch Plan sul managed** e lo applica a entrambi, verifica ciascuno. Un solo suffisso per chiamata.
- Il Patch Plan nasce da `buildPatchPlan(managedPkg, suffix, agents, options)`: il suffisso e `publishOnImport` entrano **solo** qui e in `build()` (per i valori attesi). Tutto il resto (export, lettura, versione) non dipende dal suffisso: si può fare una volta sola e ripetere solo piano + `build` per Target.
- `writeArtifactSet` scrive **una cartella** con `{Solution}_{versione}_managed_{SUFFISSO}.zip` (+ unmanaged patchato e due `source_*.zip` se `keepSourceArtifacts`) e il `manifest.json`. Il manifest ha `suffix`, `options`, `agents`, `files` a livello alto.
- Lo storico (`PackagingRecord`) ha un `suffix`, un `agents`, un `verification` per record.
- Le impostazioni personali stanno nello store `settings` di PPTB, per nome di connessione (`pins.ts`): chiave → mappa per ambiente, valore illeggibile = «nessun dato», scritture serializzate in coda.
- Il suffisso oggi si scrive in un campo libero con sei preset fissi (`SUFFIX_PRESETS` in `app.ts`).
- `src/headless.ts` e `test/engine.pipeline.test.ts` chiamano `runPackaging` e `writeArtifactSet` con un solo suffisso.

## Conseguenze per il progetto
1. **Export e versione una volta sola è fattibile senza toccare export, lettura e versione**: basta ripetere piano + `build` per ogni Target sugli stessi `PackageContents`. Il risultato è quindi per costruzione «stessi byte di partenza» (FR-008).
2. **Non si rompe l'API esistente**: `runPackaging` resta come involucro sottile che chiama il nuovo motore con un solo Target e restituisce la forma di oggi. Così i test del motore (`test/engine.pipeline.test.ts`) e `headless.ts` restano la rete di sicurezza di FR-006 («con un solo Target nulla cambia»).
3. **Il costo dei dialog di salvataggio cresce con i Target.** Senza scrittura binaria diretta, ogni zip costa un dialog (`writeBinary` → `saveFile`). Con `keepSourceArtifacts` spento sono N zip managed + il manifest; acceso, 2N + 2. Con 3 Target e copie extra: 8 dialog. Va detto **prima** del salvataggio, con il numero (vedi quickstart). Se PPTB espone `writeBinary`, il costo sparisce.
4. **Il confronto N×N è inutile.** Ogni zip è già verificato contro lo stesso export (FR-010). Basta confrontare **ogni Target con il primo spuntato**: N−1 confronti, e la differenza fra due Target qualsiasi si ricava unendo le due liste. Il manifest resta di dimensione lineare. (FR-013 della spec è stato precisato di conseguenza.)
5. **Nome della cartella e percorsi Windows.** Più etichette nel nome della cartella allungano il percorso (limite 260). Regola: si elencano fino a tre etichette, oltre si scrive `[N targets]`; i nomi dei file restano quelli di oggi (uno per Target).
6. **`publishByAgent` (eccezione per agent) e default del Target.** Oggi l'utente può impostare il publish agent per agent. Con i Target, il default è per Target; l'eccezione per agent resta **uguale per tutti i Target** e prevale sul default (stesso criterio di D5: gli agent sono scelti una volta). Confermato dall'utente il 2026-11-01 (D7): vale la regola più specifica.
7. **Riordino.** Il trascinamento (HTML5 drag and drop) non si testa bene in jsdom e non è accessibile da tastiera. Si fanno **pulsanti su/giù** (tastiera) e il trascinamento chiama la stessa funzione pura `moveTarget(list, from, to)`; i test coprono la funzione e i pulsanti.
8. **Rinomina di un Target e spunte salvate.** Le spunte sono salvate per **nome** del Target; rinominando, la voce si aggiorna nella stessa scrittura, altrimenti la spunta andrebbe persa in silenzio.
9. **Lista vuota ≠ lista mai aperta.** Assenza della chiave = mai configurata → precompilare con i preset (FR-002); chiave presente anche vuota = scelta dell'utente. Con lista vuota si va avanti solo creando un Target (Next spento con un messaggio).

## Cosa non è stato verificato (resta alla prova a mano)
- Che PPTB non esponga `writeBinary` (il numero di dialog è quello del caso peggiore).
- Quanto pesa in pixel una lista di 6+ Target nel passo Suffix, e il comportamento del trascinamento nell'host reale.
- Che lo store `settings` di PPTB regga la nuova chiave nelle versioni diverse da quella provata.

## Nessuna fonte esterna
Nessun valore Dataverse nuovo: la funzione lavora su quanto il tool già legge ed esporta.
