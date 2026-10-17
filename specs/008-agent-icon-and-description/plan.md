# Implementation Plan: Icona e descrizione dell'agent

**Branch**: `008-agent-icon-and-description` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md), [research.md](research.md)

## Summary

Un nuovo servizio di **sola lettura**, `agentCards.ts`, legge `iconbase64` (da `bot`) e la descrizione (da `botcomponent.description` del componente GPT) per gli agent della solution aperta, valida l'icona, la tiene in cache per sessione e la consegna alla schermata, che la mostra accanto al nome in tre punti (vista della solution, tabella del suffisso, revisione) e nei chip della ricerca. Nessuna scrittura, nessun cambiamento al package.

## Technical Context

TypeScript strict · DOM puro · Vitest + jsdom. `dataverseAPI.fetchXmlQuery` (già usato per le liste). Nessuna dipendenza nuova.

**Constraints**: sola lettura (FR-008); nessun HTML costruito da valori non validati (FR-003); lettura limitata alla solution aperta (FR-005).

## Constitution Check

| Regola | Esito |
|---|---|
| III Deep Over Broad | ✅ mostra un dato interno dell'agent invece del solo nome |
| VII Enterprise UI | ✅ stessa icona in tutte le liste, dimensioni fisse, nessuna emoji |
| Data Access | ✅ `$select` esplicito, nessun filtro su valori non documentati |
| Testing Standard (1.3.0) | ✅ matrice per la validazione, percorsi della schermata, mutazioni |
| FR-067 (001) | ✅ nessuna scrittura |

## Project Structure

```text
tools/src/
├── services/
│   └── agentCards.ts       # NUOVO: isValidIcon(raw) → dataUri | null; normalizeDescription(raw);
│                           #        loadAgentCards(agentIds, modifiedOn) con cache per sessione
├── types.ts                # AgentCard { iconDataUri: string | null; description: string | null }
├── app.ts                  # state.cards: Map<agentId, {modifiedOn, card}>; agentIconHtml(card, size);
│                           #   riempimento a lista disegnata; descrizione sotto il nome
├── icons.ts                # icona generica dell'agent (esiste: 'bot')
└── styles.css              # .agent-cell, .agent-icon (dimensione fissa), .agent-desc (troncata, attenuata)

tools/test/
├── agentCards.test.ts      # matrice di validazione dell'icona e della descrizione
├── ui.scenarios.test.ts    # icone e descrizioni nelle liste; lazy; cache; fallimento
└── helpers/ui-harness.ts   # UiAgent { icon?, description? } e conteggio delle letture
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | Servizio separato e di sola lettura | Resta chiaro che la funzione non scrive nulla |
| D2 | Validare con firma PNG + alfabeto base64 + lunghezza massima | Il valore arriva da Dataverse: non si fida |
| D3 | `src` di un `<img>` costruito dal tool; descrizione con `textContent` | Nessun valore non validato diventa HTML |
| D4 | Leggere dopo aver disegnato la lista, riempire sul posto con dimensioni fisse | La lista non aspetta le immagini e le righe non si spostano |
| D5 | Cache per sessione con chiave `agentId + modifiedOn` | Riaprire la stessa solution non rilegge |
| D6 | La descrizione si legge da `botcomponent.description` del componente `<schema>.gpt.default`; senza componente o vuota, "No description" | Sorgente verificata (research §2); non si inventa un valore |
| D7 | Il componente GPT si individua per genitore + `schemaname`, non per `componenttype` | Regola del progetto sui valori non documentati |

## Complexity Tracking

Nessuna deroga.

## Risks

- **Lettura via Web API non ancora provata** (icona e descrizione) → tasks T002; la sorgente è invece verificata sull'export (research §2).
- **Peso delle immagini**: limitato alla solution aperta; cache per sessione.
- **Icona non PNG o corrotta** → icona generica, nessun errore.
