# Implementation Plan: La versione si alza in DEV

**Branch**: `004-source-version-in-dev` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

## Summary

Un nuovo servizio, `solutionVersion.ts`, contiene formato, confronto, proposta e **l'unica scrittura** del tool. `runPackaging` la chiama prima dell'export; il piano di patch non ha più righe `Version`; la verifica controlla che lo zip porti la versione scritta; la schermata ha opzione, campo, messaggi e testo.

## Technical Context

TypeScript strict · DOM puro · Vitest + jsdom. `dataverseAPI.update` e `queryData` di `@pptb/types`. Nessuna dipendenza nuova.

## Constitution Check

| Principio | Esito |
|---|---|
| Dati e query (constitution) | ✅ scrittura su una colonna documentata (`solution.version`), query con `$select` esplicito |
| VI Simplicity | ⚠️ una scrittura in più, motivata e isolata (vedi Complexity Tracking) |
| Regola "FR-067" della 001 | ⚠️ eccezione dichiarata FR-067a, documentata in `dataverse.ts` e nella spec |

## Project Structure

```text
tools/src/
├── services/
│   ├── solutionVersion.ts   # NUOVO: isValidVersion, compareVersions, nextVersion, versionProblem,
│   │                        #        raiseSolutionVersion(unique, to) → { from, to, changed }
│   ├── packaging.ts         # raise prima di exportPair; PackagingResult.versionChange;
│   │                        #   expected.version = options.newVersion; pausa tra le fasi
│   ├── patch.ts             # niente più bumpVersion né riga 'Version' nel piano
│   ├── rezip.ts             # verifyZip(…, { version }) legge <Version> in solution.xml
│   ├── artifacts.ts         # manifest.versionChange
│   └── dataverse.ts         # commento: la scrittura vive a parte (FR-067a)
├── types.ts                 # PackagingOptions.newVersion: string | null; PackagingRecord.versionChange
├── headless.ts              # optionsFrom: newVersion
└── app.ts                   # versionFrom/raiseVersion/versionInput/versionTouched; proposedVersion,
                             #   chosenVersion, versionIssue, syncVersionOption, resetVersionPlan;
                             #   riga di opzione con campo; versionHintNow; fase "Raise the version in DEV";
                             #   nota nell'anteprima; aggiornamento dopo il salvataggio
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | Servizio separato per l'unica scrittura | Resta una sola, visibile e dichiarata (`dataverse.ts` resta di sola lettura) |
| D2 | `dataverseAPI` letto al momento dell'uso (`api()`), non all'import | I test sostituiscono l'oggetto |
| D3 | Rilettura dopo la scrittura | Una scrittura che "riesce" ma non cambia nulla non deve far partire un export |
| D4 | Confronto numerico segmento per segmento | `1.0.0.10 > 1.0.0.9` |
| D5 | `versionFrom` fisso per l'operazione; scrittura idempotente | research §4 |
| D6 | La versione non è una riga del piano né un blocco dell'anteprima, ma una **nota** | Non è un cambio del package |
| D7 | `expected.version` nella verifica | Se l'export non porta il numero scritto, DEV e artefatto divergono: deve risultare non valido |

## Complexity Tracking

| Deroga | Perché necessaria | Alternativa scartata |
|---|---|---|
| Una scrittura su Dataverse (FR-067a) | È l'unico modo di tenere allineati DEV, artefatto e target, come fa Microsoft | Il bump nello zip creava il difetto; il solo avviso lasciava l'errore a un passo manuale |

## Risks

- Utente senza privilegio sulla solution → errore chiaro, nessun export (SC-002).
- Operazione interrotta dopo la scrittura e prima dell'export: DEV risulta già alzato. È il comportamento del portale; al tentativo successivo la scrittura è idempotente.
