# Implementation Plan: Rename a livello di solution

**Branch**: `002-solution-wide-rename` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md), [research.md](research.md)

## Summary

Il motore di patch accettava già una lista di agent (`buildPatchPlan(pkg, suffix, selected[], options)`); a essere "uno solo" erano **stato e schermata** (`state.activeAgent`, `selectAgent`, `runPackaging(..., [agent.schemaName], ...)`). Il lavoro è quindi soprattutto di interfaccia e di modello di stato, più la correzione di tre assunzioni "un solo agent" nel motore: inventario, impronta del formato, occorrenze del nome.

## Technical Context

**Language/Version**: TypeScript 5 (strict, `noUnusedLocals`), ES2022 · **UI**: DOM puro, nessun framework · **Build**: Vite 8 · **Test**: Vitest + jsdom (spec 006).

**Storage**: nessuno nuovo; stato in memoria, storico in `toolboxAPI.settings`.

**Constraints**: nessuna scrittura su Dataverse per questa funzione; il package resta byte-identico tranne `<name>` (001 FR-069).

## Constitution Check

| Principio | Esito |
|---|---|
| I Gap-First | ✅ nessuna superficie Microsoft rinomina gli agent in un package per ambiente |
| II Copilot Studio First | ✅ |
| VI Simplicity | ✅ un solo suffisso invece di N: meno stato, meno errori |
| VII Enterprise UI | ✅ breadcrumb `Solutions › {Solution} › Suffix › Review › Preview` |

Nessuna violazione, nessuna complessità da giustificare.

## Project Structure

```text
tools/src/
├── app.ts                    # stato: excludedAgents, highlightAgentId; solutionAgents(), selectedAgents(),
│                             #   suffixesAfter(); startRename(); agentRowsHtml(); revisione e anteprima
├── types.ts                  # AgentOutcome { schemaName, before, after, excluded? }
├── services/
│   ├── patch.ts              # agentOutcomes(pkg, plan): esito per agent, unica fonte per manifest e storico
│   ├── package.ts            # buildInventory(files, agentSchemas[]); fingerprint su tutti gli agent
│   ├── compat.ts             # findNameOccurrences: posti noti; unione delle chiavi di configurazione
│   └── artifacts.ts          # manifest.agents = tutti gli agent, con excluded
└── baseline/package-format.json   # channels, isLightweightBot opzionali

tools/test/                   # engine.plan, engine.pipeline, outcomes, package.format, ui.* (spec 006)
```

## Decisions

| # | Decisione | Perché | Dove |
|---|---|---|---|
| D1 | Esclusione, non selezione, nello stato | Il default è "tutti": un agent nuovo non resta indietro | `state.excludedAgents` |
| D2 | `agentOutcomes()` unica fonte per manifest e storico | Prima ciascuno ricostruiva la lista e divergevano | `patch.ts` |
| D3 | Inventario: "dell'agent" se il componente appartiene a *uno qualunque* degli agent | Con `agents[0]` gli altri risultavano "extra" | `package.ts` |
| D4 | Impronta: unione delle chiavi di tutti gli agent | Il primo file dello zip è arbitrario | `compat.ts` |
| D5 | Rete di sicurezza sui suffissi misti in **revisione** (Dataverse) e al **salvataggio** (package) | La conferma bloccante deve basarsi sui nomi veri del package | `app.ts` |

## Complexity Tracking

Nessuna deroga.

## Risks

- **Nome intero nel componente GPT**: effetto sui canali non verificato (research §2). Mitigazione: nota nella schermata dei controlli + verifica manuale dopo l'import.
- **Solution molto grandi**: l'export è sincrono con fallback asincrono (001 §13); questa funzione non lo cambia.
