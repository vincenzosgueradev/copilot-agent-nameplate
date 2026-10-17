# Data Model: Publish on import per agent

**Feature**: `003-per-agent-publish-on-import` | **Date**: 2026-10-18

## Opzioni di packaging *(types.ts)*

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `publishOnImport` | `PublishMode` | `'keep'` | Valore per gli agent **senza** scelta esplicita. La schermata non lo espone come interruttore; l'interfaccia headless sì |
| `publishByAgent` | `Record<schemaName, PublishMode>` *(opzionale)* | assente | Assente nei record storici precedenti; un agent assente segue `publishOnImport` |

`PublishMode = 'keep' | 'force-true' | 'force-false'`.

## Risoluzione

```text
modo(agent) = publishByAgent[agent.schemaName] ?? publishOnImport
```

| Condizione | Riga nel piano | Effetto sul file |
|---|---|---|
| agent escluso | nessuna | invariato |
| `modo = keep` | nessuna | invariato |
| `modo = force-X` e valore presente già uguale | nessuna | invariato |
| `modo = force-X` e valore assente | `publishOnImport`, `state: added`, `before: null` | chiave aggiunta |
| `modo = force-X` e valore presente diverso | `publishOnImport`, `state: suffix-changed` | valore cambiato |

## Valori attesi per la verifica

`ExpectedValues.publish: Record<percorso configuration.json, boolean>` — costruito dal piano; `verifyZip` rilegge ogni file e confronta `publishOnImport`.

## Esempio nel manifest

```jsonc
"options": {
  "newVersion": "1.0.0.3",
  "publishOnImport": "keep",
  "publishByAgent": { "ava_agenteTool1": "force-true", "ava_agenteTool2": "keep" },
  "keepSourceArtifacts": false
}
```
