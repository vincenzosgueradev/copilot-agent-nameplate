# Contract: invokeHeadless (MCP Interface)

**Tool**: Agent Rename Manager | **Date**: 2026-10-14

L'interfaccia `invokeHeadless` espone il tool come strumento MCP consumabile da agent AI (es. Copilot Studio, Microsoft 365 Copilot). Permette di interrogare lo stato del rename e avviare operazioni senza interazione UI.

---

## Operazioni supportate

### 1. `preview`

Calcola e restituisce l'anteprima del rename per tutti gli agent di una solution, senza applicare modifiche.

**Input**:
```json
{
  "operation": "preview",
  "solutionUniqueName": "MySolutionName",
  "newSuffix": "(UAT)"
}
```

**Output**:
```json
{
  "status": "ok",
  "solution": {
    "displayName": "My Solution",
    "publisherPrefix": "myco",
    "envVariableExists": true,
    "currentSuffix": "(DEV)"
  },
  "agents": [
    {
      "botId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "currentName": "Customer Support Agent (DEV)",
      "proposedName": "Customer Support Agent (UAT)",
      "renameState": "suffix-changed",
      "hasTeamsChannel": true,
      "publishRequired": true,
      "manifestNameTruncated": false,
      "proposedManifestNameShort": "Customer Support Agent"
    }
  ]
}
```

---

### 2. `status`

Restituisce lo stato corrente della env variable e degli agent per una solution.

**Input**:
```json
{
  "operation": "status",
  "solutionUniqueName": "MySolutionName"
}
```

**Output**:
```json
{
  "status": "ok",
  "solution": {
    "displayName": "My Solution",
    "publisherPrefix": "myco",
    "envVariableExists": true,
    "currentSuffix": "(DEV)"
  },
  "agentCount": 5,
  "agentsWithCurrentSuffix": 3,
  "agentsWithoutSuffix": 2
}
```

---

### 3. `listSolutions`

Elenca le solution disponibili nell'environment connesso.

**Input**:
```json
{
  "operation": "listSolutions"
}
```

**Output**:
```json
{
  "status": "ok",
  "solutions": [
    {
      "solutionId": "...",
      "uniqueName": "MySolutionName",
      "displayName": "My Solution",
      "isManaged": false,
      "agentCount": 5,
      "envVariableConfigured": true,
      "currentSuffix": "(DEV)"
    }
  ]
}
```

---

## Operazioni non supportate in headless

Le seguenti operazioni richiedono interazione utente e **non sono disponibili** in `invokeHeadless`:

- `apply` — richiede conferma esplicita utente (FR-010)
- `publish` — richiede conferma esplicita utente
- `rollback` — richiede scelta utente tra rollback/mantieni

**Rationale**: Tutte le operazioni di scrittura richiedono conferma umana esplicita per policy enterprise (FR-010). L'interfaccia headless è read-only per design.

---

## Errori

```json
{
  "status": "error",
  "code": "SOLUTION_NOT_FOUND" | "ENV_VARIABLE_MISSING" | "PERMISSION_DENIED" | "CONNECTION_ERROR",
  "message": "Descrizione leggibile dell'errore"
}
```
