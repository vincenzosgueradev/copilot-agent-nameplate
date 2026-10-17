# Contratti: la versione in DEV

**Feature**: `004-source-version-in-dev` | **Date**: 2026-10-18

## 1 — Chiamate a Dataverse

Le uniche due che servono, entrambe sulla tabella `solution`.

### Lettura

```http
GET /api/data/v9.2/solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '<nome>'
```

Il nome ha gli apici raddoppiati (`o'neil` → `o''neil`). Si pretende **una** riga; `ismanaged = true` ferma l'operazione.

### Scrittura *(l'unica del tool, FR-004)*

```text
dataverseAPI.update('solution', <solutionid>, { version: '<major.minor.build.revision>' })
```

### Rilettura

```http
GET /api/data/v9.2/solutions(<solutionid>)?$select=version
```

Se il valore letto non è quello scritto → errore, l'export non parte.

## 2 — Interfaccia headless

```jsonc
// previewPatch / applyPatch
{
  "options": {
    "newVersion": "1.0.0.3",       // string | null ; sostituisce `bumpVersion`
    "publishOnImport": "keep",
    "publishByAgent": { "ava_agenteTool1": "force-true" }
  }
}
```

`newVersion` segue le stesse regole della schermata: formato a quattro numeri, strettamente più alta di DEV (il confronto lo fa `raiseSolutionVersion`), niente export se la scrittura fallisce.

## 3 — Manifest

```jsonc
{
  "options": { "newVersion": "1.0.0.3", … },
  "versionChange": { "from": "1.0.0.2", "to": "1.0.0.3", "changed": true }
}
```

`versionChange` è `null` quando l'opzione è spenta. Non sono cambiati i campi `source.version` e `files[].sha256`: `source.version` è già la versione che il package porta.

## 4 — Errori e messaggi

| Situazione | Messaggio |
|---|---|
| formato | `"<v>" is not a valid version: use four numbers separated by dots.` |
| solution non unica | `Expected one solution named "<n>", found <k>.` |
| managed | `"<n>" is managed: its version cannot be raised here.` |
| DEV già più alta | `DEV is already at X, higher than Y. Someone raised it in the meantime: go back, reload the list and choose a higher version.` |
| rilettura diversa | `The version of "<n>" in DEV reads X after writing Y. The export was not started.` |
| permessi | il messaggio di Dataverse, propagato (es. `prvWriteSolution`) |
