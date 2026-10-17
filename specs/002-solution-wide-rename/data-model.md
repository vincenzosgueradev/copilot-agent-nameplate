# Data Model: Rename a livello di solution

**Feature**: `002-solution-wide-rename` | **Date**: 2026-10-18

## Stato dell'operazione (in memoria)

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `suffix` | string | `''` | Uno solo per operazione (FR-001). Vuoto = toglie un gruppo finale |
| `excludedAgents` | `Set<agentId>` | vuoto | Si tiene l'**esclusione**: il default "tutti" fa seguire gli agent nuovi (D1) |
| `highlightAgentId` | string | `''` | Agent da evidenziare dopo una ricerca (FR-008) |
| `activeSolution` / `browsingSolutionId` | | | Cambiarli azzera l'operazione (FR-009) |

## AgentOutcome *(types.ts)*

```ts
interface AgentOutcome {
    schemaName: string;     // identità del componente: non cambia mai
    before: string;         // <name> nel package esportato
    after: string;          // <name> nel package prodotto
    excluded?: boolean;     // assente nei record storici precedenti
}
```

Calcolato da `agentOutcomes(pkg, plan)`: `excluded` è vero se nel piano non c'è una riga `name` per quell'agent. Un agent **selezionato** il cui nome non cambia ha `excluded: false`.

## Piano di patch

Una riga `name` per ogni agent selezionato (anche `no-change`), con `before`, `after`, `state` e `exceedsTeamsLimit`. Gli agent esclusi **non** hanno righe. `PatchChange.element` è `'name' | 'publishOnImport'` (la versione non è un cambio del package: spec 004).

| `state` | Quando |
|---|---|
| `no-change` | `after == before` |
| `suffix-removed` | suffisso vuoto e il nome cambia |
| `suffix-changed` | c'era un suffisso, ne arriva un altro |
| `suffix-added` | non c'era nessun suffisso |

## Manifest e storico

```jsonc
"agents": [
  { "schemaName": "ava_agenteTool1", "before": "agenteTool1 [DEV]", "after": "agenteTool1 [UAT]", "excluded": false },
  { "schemaName": "ava_agenteTool2", "before": "agenteTool2 [DEV]", "after": "agenteTool2 [DEV]", "excluded": true }
]
```

Ordine: per `schemaname`. `confirmations[]` contiene la conferma sui suffissi misti quando è stata data.

## Posti noti del display name (compat.ts)

| Posto | Contiene | Patchato |
|---|---|---|
| `bots/<schema>/bot.xml` → `<name>` dell'agent | display name | **sì** |
| `bots/<altro>/bot.xml` → `<name>` | nome di un altro agent | no (lo patcha il suo controllo) |
| `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` | nome base **o** nome intero | no |
| qualunque altro elemento XML o stringa JSON uguale al nome | — | **segnalato** come sconosciuto |
