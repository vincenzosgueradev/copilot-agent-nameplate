# Data Model: architetture di agent

## Impronta (`FormatFingerprint`, types.ts)

```ts
configurationKeys: string[];                              // unione di tutti gli agent (invariata)
configurationByArchitecture?: Record<string, string[]>;   // recognizer.$kind (o "(none)") → chiavi unite
```

Assente nelle registrazioni dello storico anteriori a questa spec.

## Baseline (`baseline/package-format.json`)

```json
"configurationJson": { "profiles": [
  { "id": "standard", "label": "standard agent", "recognizer": "GenerativeAIRecognizer", "keys": [], "optionalKeys": [] },
  { "id": "harness",  "label": "GitHub Copilot harness agent", "recognizer": "CLICopilotRecognizer", "keys": [], "optionalKeys": [] }
] }
```

Obbligatorie dell'harness: `$kind`, `recognizer`, `agentSettings`. Il resto è opzionale.

## Avvisi (`FormatDrift.what`)

| Caso | Testo |
|---|---|
| chiave in più | `configuration.json keys (<label>): appeared "<chiave>"` |
| chiave obbligatoria in meno | `configuration.json keys (<label>): disappeared "<chiave>"` |
| architettura senza profilo | `configuration.json: unknown agent architecture "<kind>" — no baseline to compare its keys with (<chiavi>)` |
| architettura nuova rispetto all'ultimo packaging | `configuration.json: agent architecture "<kind>" was not in the previous packaging` |

Tutti non bloccanti.
