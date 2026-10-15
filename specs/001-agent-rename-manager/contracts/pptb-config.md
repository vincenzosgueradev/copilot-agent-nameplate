# Contract: pptb.config.json

**Tool**: Agent Rename Manager | **Date**: 2026-10-14

Il file `pptb.config.json` è il manifesto del tool per la piattaforma PPTB. Determina come il tool appare nel marketplace, quali permessi richiede e se supporta l'interfaccia headless (MCP).

---

## Schema

```json
{
  "id": "agent-rename-manager",
  "name": "Agent Rename Manager",
  "version": "1.0.0",
  "description": "Rename Copilot Studio agents across environments using a per-solution environment variable. Solves the DEV/UAT/PROD naming problem after pipeline deployments.",
  "author": "Vincenzo Sguera",
  "category": "Copilot Studio",
  "tags": ["copilot-studio", "agents", "ALM", "rename", "environment", "pipeline"],
  "icon": "rename-agent.svg",
  "entryPoint": "index.html",
  "permissions": {
    "dataverse": {
      "read": [
        "bots",
        "botcomponents",
        "solutions",
        "publishers",
        "solutioncomponents",
        "environmentvariabledefinitions",
        "environmentvariablevalues"
      ],
      "write": [
        "bots",
        "botcomponents",
        "environmentvariabledefinitions",
        "environmentvariablevalues"
      ],
      "actions": [
        "Microsoft.Dynamics.CRM.PvaPublish",
        "Microsoft.Dynamics.CRM.PvaPublishStatus",
        "AddSolutionComponent"
      ]
    },
    "localFiles": {
      "readWrite": true,
      "purpose": "Log operazioni e backup pre-rename (retention 30 giorni)"
    }
  },
  "features": {
    "multiConnection": true,
    "invokeHeadless": true
  },
  "marketplace": {
    "verified": false,
    "publishedAt": null,
    "category": "Copilot Studio",
    "keywords": ["rename", "agent", "ALM", "environment", "copilot studio", "pipeline deployment"]
  }
}
```

---

## Campi obbligatori

| Campo | Tipo | Constraint |
|---|---|---|
| `id` | string | Unique nel marketplace PPTB, kebab-case |
| `name` | string | Max 60 char, titolo marketplace |
| `version` | string | Semver |
| `description` | string | Max 300 char, appare nel marketplace |
| `category` | string | Deve corrispondere a categoria PPTB marketplace |
| `entryPoint` | string | Percorso relativo a `index.html` |
| `permissions.dataverse` | object | Tabelle e azioni richieste — dichiarazione esplicita |

---

## Permissions: rationale

Il tool richiede write su `bots` e `botcomponents` per il rename, e write su `environmentvariabledefinitions`/`environmentvariablevalues` per creare/aggiornare la env variable. L'azione `PvaPublish` è richiesta per il publish post-rename. `AddSolutionComponent` è richiesta per aggiungere la env variable creata alla solution.

`localFiles: true` abilita accesso al filesystem locale PPTB per log e backup — dichiarato esplicitamente per policy marketplace.
