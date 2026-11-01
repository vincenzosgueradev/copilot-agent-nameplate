# Piano 016 — Targets

## Approccio in sintesi
Un motore che esporta e legge **una volta** e ripete piano + build per ogni Target; un artifact set con **un manifest nuovo** (`targets[]`); un servizio per la **lista di Target** salvata come i pin; una schermata che mostra e gestisce la lista e rende per-Target le schermate di revisione, anteprima, verifica e risultato.

Ordine di lavoro: servizio della lista → motore → manifest e storico → schermata. Ogni fase si chiude con `tsc`, build e test; la schermata è l'ultima perché dipende da tutto.

## 1. Servizio della lista (`src/services/targets.ts`, nuovo)
Come `pins.ts`: stessa coda di scritture, stessa `parse` tollerante.
- `readTargets(env): Promise<Target[]>`, `saveTargets(env, list)`, `readSelection(env, solution)`, `saveSelection(env, solution, names)`.
- Chiavi `settings`: `releaseTargets` e `targetSelection` (vedi `data-model.md`).
- Funzioni **pure**, testabili da sole: `defaultTargets()`, `validateTargetName(name, list, exceptIndex?)` (riusa la validazione del suffisso di oggi, non la duplica), `moveTarget(list, from, to)`, `renameTarget(list, selections, index, name)` (aggiorna anche le spunte, ricerca §8), `reconcileSelection(names, list)` (toglie i Target che non esistono più).
- Una lista salvata illeggibile vale «mai configurata» e si dice nel log; un salvataggio fallito si dice all'utente (FR-004).

## 2. Motore (`src/services/packaging.ts`)
- Nuovi tipi `PackagingTarget { name; publishOnImport }` e `TargetResult { target; plan; managed; unmanaged; valid; comparison }`.
- `runPackagingTargets(solution, targets, agents, options, onProgress)`: versione una volta → `exportPair` una volta → lettura una volta → per ogni Target `buildPatchPlan` + `build` con `{...options, publishOnImport: target.publishOnImport}` → confronto di ogni Target col primo.
- `runPackaging(solution, suffix, agents, options, onProgress)` resta, come involucro: chiama il nuovo motore con `[{ name: suffix, publishOnImport: options.publishOnImport }]` e restituisce `PackagingResult` com'è oggi. I test esistenti del motore continuano a chiamare questa funzione e provano che un Target dà lo stesso risultato di oggi.
- Nuovo `src/services/compare.ts`: confronta due zip entry per entry e classifica ogni differenza (`agent-name`, `publish-on-import`); una differenza fuori dal piano di uno dei due fa **fallire** (`valid = false`).
- Resta valido FR-085: un solo Target non valido rende non valido l'intero risultato.

## 3. Artifact set, manifest, storico
- `artifacts.ts`: `writeArtifactSet` riceve il risultato multi-Target; una cartella; per Target uno zip managed (nome come oggi) e, con `keepSourceArtifacts`, l'unmanaged patchato; `source_*.zip` una volta sola. Nome cartella: fino a 3 etichette, poi `[N targets]`. `warnAboutDialogs` riceve il totale.
- `buildManifest` produce il **formato v2** (`contracts/manifest-v2.md`): sempre, anche con un Target (D6).
- `history.ts` e `PackagingRecord`: **un record per operazione**, con `targets[]` (nome, publish, file, esito); i campi di oggi restano per leggere i record vecchi; `suffix` dei record nuovi è l'elenco dei nomi per la tabella dello storico.
- `headless.ts` usa il motore con un solo Target e non cambia comportamento.

## 4. Schermata (`src/app.ts`, `index.html`, `styles.css`)
- **Suffix → Targets.** Il campo libero e i sei preset sono sostituiti da: la lista con casella, nome, menu del publish on import, pulsanti su/giù (e trascinamento), «Remove»; in fondo «Add target» (campo + invio). Un messaggio se si preme Next senza Target spuntati o con lista vuota.
- Tabella degli agent: il nome «dopo» si mostra per il **Target selezionato** in un piccolo selettore sopra la tabella (si riusa `.segmented`). Esclusioni e publish per agent restano uguali per tutti (D5, ricerca §6).
- **Review, Preview, Verify, Result**: ognuna mostra il selettore dei Target e il contenuto di quello scelto; la barra dei totali dice «N targets, M zip». Con un solo Target il selettore **non compare**: la schermata è quella di oggi.
- Avviso prima del salvataggio con il numero dei dialog quando `writeBinary` non c'è (ricerca §3).
- Il dialogo della versione (014) resta uno solo: nomina la versione, non i Target.
- `state.suffix` diventa `state.targets` (lista scelta) e `state.activeTarget` (selettore). I 19 punti che oggi leggono `state.suffix` si spostano uno a uno (task T014).

## 5. Test (rete di sicurezza e nuovi)
- **Regressione**: tutti i test esistenti passano **senza essere modificati**, tranne quelli sul formato del manifest e della riga di storico (T010, T011), che si riscrivono sulla spec.
- **Nuovi**: servizio della lista, motore, confronto, manifest, schermata e matrice (vedi `tasks.md`).
- **Mutazioni**: gruppo `targets:` in `scripts/mutation-check.mjs`.

## File toccati
`src/services/targets.ts` (nuovo), `src/services/compare.ts` (nuovo), `src/services/packaging.ts`, `src/services/artifacts.ts`, `src/services/history.ts`, `src/types.ts`, `src/app.ts`, `src/index.html`, `src/styles.css`, `src/headless.ts` (solo adattamento), `test/targets.*.test.ts`, `test/engine.targets.test.ts`, `test/ui.targets.test.ts`, `test/helpers/*`, `scripts/mutation-check.mjs`, `README.md` e `CHANGELOG.md` **solo al rilascio**.

## Fuori dal piano
Export, lettura del package, patch di un singolo agent, scrittura della versione in DEV: invariati. Nessuna nuova chiamata a Dataverse.

## Rischi
| Rischio | Risposta |
|---|---|
| La schermata Suffix è la più grande del tool e tocca 19 punti | Si fa per ultima, con la regressione dei test esistenti; un Target = comportamento di oggi |
| Molti dialog di salvataggio | Avviso col numero prima di salvare; `keepSourceArtifacts` resta spento di default |
| Chi legge il manifest con uno script | Versione di formato nel manifest (`manifestVersion: 2`) e Upgrade notes al rilascio (MINOR) |
| Lista salvata rovinata | Letta con tolleranza, mai un errore; prova nei test negativi |
