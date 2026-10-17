# Implementation Plan: Publish on import per agent

**Branch**: `003-per-agent-publish-on-import` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

## Summary

Si aggiunge `publishByAgent` alle opzioni di packaging; `buildPatchPlan` risolve il modo effettivo per agent (`publishModeFor`); la schermata mostra un toggle per riga e una riga "per tutti" nel piede della tabella; la verifica rilegge i valori scritti.

## Technical Context

TypeScript strict, DOM puro, Vitest + jsdom. Nessuna dipendenza nuova. Nessuna scrittura su Dataverse.

## Constitution Check

| Principio | Esito |
|---|---|
| VI Simplicity | ✅ `publishByAgent` è opzionale, senza migrazione dei record storici |
| VII Enterprise UI | ✅ un solo tipo di toggle in tutta l'interfaccia; nessuna emoji |
| UI senza ridondanze (preferenza del progetto) | ✅ l'anteprima mostra solo il valore finale (research §4) |

## Project Structure

```text
tools/src/
├── types.ts            # PublishMode; PackagingOptions.publishByAgent?: Record<schemaName, PublishMode>
├── services/
│   ├── patch.ts        # publishModeFor(options, schemaName); righe publishOnImport nel piano
│   ├── rezip.ts        # verifyZip(…, expected: { publish?: Record<path, boolean> })
│   └── packaging.ts    # costruisce expected.publish dal piano
├── headless.ts         # optionsFrom: publishByAgent
└── app.ts              # setPublishMode, publishToggleHtml, bulkToggleHtml (tfoot), colonna in revisione
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | `publishByAgent` opzionale; `publishOnImport` resta il valore per gli agent senza scelta | Compatibilità con storico e headless |
| D2 | Il piano non ha righe per `keep`, per esclusi o per valore uguale | Il package resta fedele alla sorgente (001 FR-090) |
| D3 | Riga "per tutti" in `<tfoot>` della stessa tabella | Allineamento per costruzione (research §2) |
| D4 | `common` = valore unico tra gli agent **spuntati** | Un escluso non deve spegnere il toggle (research §3) |
| D5 | `verifyZip` con valori attesi per `configuration.json` | research §5 |

## Complexity Tracking

Nessuna deroga.
