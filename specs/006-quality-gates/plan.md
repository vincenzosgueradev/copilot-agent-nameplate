# Implementation Plan: Cancelli di qualità

**Branch**: `006-quality-gates` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

## Summary

Una suite Vitest a quattro livelli (funzioni pure → pipeline vera → schermata in jsdom → controllo per mutazione), con un oracolo indipendente e fixture generate. Due modalità (veloce/esaustiva), un comando di mutazione, e la regola scritta nella constitution (1.3.0) e nelle skill di rilascio.

## Technical Context

Vitest 5 su Vite 8 · jsdom · `@xmldom/xmldom` · `fflate` (già dipendenza) · `cross-env`, `@types/node` (solo sviluppo). Nessuna dipendenza entra nel pacchetto pubblicato (`files: dist, npm-shrinkwrap.json`).

## Constitution Check

| Principio | Esito |
|---|---|
| Testing Standard (1.3.0) | ✅ questa funzione lo realizza |
| VI Simplicity | ⚠️ una piccola infrastruttura di test, giustificata dal costo dei difetti trovati a mano |
| Tool Validation Gate | ✅ `/custom-publish` esegue anche i test, la validazione PPTB e gli smoke |

## Project Structure

```text
tools/
├── vitest.config.ts              # include test/**; environment node; timeout lungo; setup
├── scripts/
│   ├── mutation-check.mjs        # elenco di difetti, ripristino dalla memoria, esito per difetto
│   ├── smoke-package.mts         # (esistente) export reale
│   └── smoke-multi-agent.mts     # (esistente) due agent su un export reale
└── test/
    ├── setup.ts                  # DOMParser (xmldom), Uint8Array allineato, dataverseAPI segnaposto
    ├── helpers/
    │   ├── fixture.ts            # makePackage/packageFiles: package sintetici con la struttura vera
    │   ├── oracle.ts             # le regole della spec, senza codice di src/
    │   ├── combinatorics.ts      # cartesian, allPairs (greedy con seme), rng, subsets
    │   ├── fake-dev.ts           # DEV finto: solution, versioni, scritture, ordine degli eventi
    │   ├── ui-harness.ts         # vera index.html + app in jsdom; driver di alto livello
    │   ├── mode.ts               # FULL (TEST_FULL=1)
    │   ├── source.ts             # legge i sorgenti dal disco (CSS)
    │   └── raw.d.ts
    ├── engine.plan.test.ts       # buildPatchPlan: matrice (cartesiana a 1–2 agent, coppie a 3–4)
    ├── engine.pipeline.test.ts   # runPackaging vero: zip, versione, idempotenza, errori
    ├── outcomes.test.ts          # agentOutcomes
    ├── package.format.test.ts    # falsi allarmi, rete di sicurezza, errori di formato, suffissi strani
    ├── verify.test.ts            # verifyZip: accetta il giusto, respinge lo sbagliato
    ├── version.test.ts           # formato, confronto, proposta, scrittura in DEV
    ├── ui.flow.test.ts           # avvio e navigazione
    ├── ui.matrix.test.ts         # percorsi casuali contro un modello, fino al salvataggio
    └── ui.scenarios.test.ts      # scenari per regola (stato, managed, ricerca, versione, scorrimento, HTML…)
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | Oracolo separato, mai importato da `src/` | Un test che ricalcola con il codice sotto esame non può fallire |
| D2 | Veloce di default; esaustivo con `TEST_FULL=1` | Una suite che non si lancia non serve (la pipeline esaustiva da sola costava ~6 minuti) |
| D3 | jsdom e non un browser vero | Costo e fragilità; il limite è dichiarato e coperto dal quickstart a vista |
| D4 | Sostituire solo i confini (export, Dataverse, FS, PPTB) | Tutto il resto è il codice vero |
| D5 | DEV finto con registro degli eventi | Si verifica l'**ordine** scrittura → export, non solo il risultato |
| D6 | Mutazioni con ripristino dalla memoria | Le modifiche non committate non si perdono |
| D7 | Fixture generate | Gli export veri contengono dati del tenant e stanno fuori dal repository (`.gitignore`) |

## Complexity Tracking

| Deroga | Perché necessaria |
|---|---|
| Quattro dipendenze di sviluppo nuove | Senza un DOM e un runner non c'è modo di provare la schermata; nessuna entra nel pacchetto pubblicato |

## Risks

- **Falsa sicurezza**: una matrice con oracolo sbagliato passa. Mitigazione: oracolo scritto dalla spec e mutazioni che provano che i test falliscono.
- **Tempo**: `test:mutation` impiega decine di minuti; si lancia filtrato durante il lavoro e intero prima del rilascio.
