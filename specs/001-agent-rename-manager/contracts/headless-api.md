# Contract: invokeHeadless (MCP Interface)

**Tool**: Agent Rename Manager | **Date**: 2026-10-14 | **Revisione**: 2026-10-15 (packaging)

L'interfaccia `invokeHeadless` espone il tool come strumento MCP consumabile da agent AI (es.
Copilot Studio, Microsoft 365 Copilot) e da script di automazione. Permette di ispezionare una
solution, calcolare il patch dei nomi e **produrre il package** senza interazione UI.

> **Revisione 2026-10-15.** Le operazioni `preview`, `status` e `apply` della v1 ragionavano in
> termini di rename su Dataverse e di environment variable. Il tool non scrive più su Dataverse
> (FR-067): l'oggetto delle operazioni headless è ora il **solution package**.

---

## Operazioni supportate

### 1. `listSolutions`

Elenca le solution dell'environment connesso che contengono almeno un agent.

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
      "uniqueName": "testAgentTool",
      "displayName": "testAgentTool",
      "version": "1.0.0.2",
      "isManaged": false,
      "exportable": true,
      "publisherPrefix": "ava",
      "agentCount": 1
    }
  ]
}
```

`exportable` è `false` per le solution managed: non sono esportabili e non possono essere sorgente
di un packaging (FR-068).

---

### 2. `inspectPackage`

Esporta la solution e ne restituisce il contenuto rilevante, **senza scrivere alcun file**.

**Input**:
```json
{
  "operation": "inspectPackage",
  "solutionUniqueName": "testAgentTool",
  "managed": true
}
```

**Output**:
```json
{
  "status": "ok",
  "package": {
    "uniqueName": "testAgentTool",
    "version": "1.0.0.2",
    "managed": true,
    "publisher": { "uniqueName": "Avanade", "prefix": "ava" },
    "entryCount": 34,
    "export": { "mode": "sync", "seconds": 7.3 }
  },
  "agents": [
    {
      "schemaName": "ava_agenteTool1",
      "file": "bots/ava_agenteTool1/bot.xml",
      "name": "agenteTool1 [DEV]",
      "baseName": "agenteTool1",
      "currentSuffix": "DEV",
      "publishOnImport": true,
      "channels": ["MsTeams", "Microsoft365Copilot"]
    }
  ],
  "inventory": [
    { "path": "bots/", "kind": "Agent", "componentType": 10212, "count": 1,
      "names": ["ava_agenteTool1"], "relatedToSelectedAgent": true },
    { "path": "botcomponents/", "kind": "Agent component", "componentType": 10213, "count": 14,
      "names": ["…"], "relatedToSelectedAgent": true },
    { "path": "environmentvariabledefinitions/", "kind": "Environment variable", "componentType": 380,
      "count": 1, "names": ["ava_AgentSuffix_testAgentTool"], "relatedToSelectedAgent": false }
  ],
  "compatibility": {
    "fingerprint": {
      "solutionPackageVersion": "9.2",
      "platformStamps": { "version": "9.2.26091.167", "organizationVersion": "9.2.26091.167",
                          "serviceabilityVersion": "9.2.26092.00158" },
      "topLevelPaths": ["bots/", "botcomponents/", "environmentvariabledefinitions/",
                        "solution.xml", "customizations.xml", "[Content_Types].xml"],
      "botElements": ["authenticationmode", "authenticationtrigger", "iconbase64", "iscustomizable",
                      "language", "name", "runtimeprovider", "template", "timezoneruleversionnumber"]
    },
    "drift": [],
    "nameOccurrences": [
      { "file": "bots/ava_agenteTool1/bot.xml", "locator": "bot/name",
        "value": "agenteTool1 [DEV]", "expected": true, "willBePatched": true }
    ]
  },
  "suffixVariable": {
    "schemaName": "ava_AgentSuffix_testAgentTool",
    "file": "environmentvariabledefinitions/ava_AgentSuffix_testAgentTool/environmentvariabledefinition.xml",
    "type": "String",
    "defaultValue": null
  }
}
```

`suffixVariable` è `null` se il package non contiene una definizione di tipo String. **È un dato di
sola lettura**: serve a riconoscere un eventuale *Channel display name suffix* nativo e ad avvisare
del doppio suffisso sui canali (FR-089). Il tool non scrive mai in quel file.

---

### 3. `previewPatch`

Calcola il Patch Plan per un suffisso, senza esportare nulla sul disco.

**Input**:
```json
{
  "operation": "previewPatch",
  "solutionUniqueName": "testAgentTool",
  "suffix": "UAT",
  "agents": ["ava_agenteTool1"],
  "options": {
    "bumpVersion": false,
    "publishOnImport": "keep"
  }
}
```

`agents` è opzionale: se omesso, tutti gli agent del package. `options` è opzionale, i default sono
`false`.

**Output**:
```json
{
  "status": "ok",
  "changes": [
    {
      "file": "bots/ava_agenteTool1/bot.xml",
      "element": "name",
      "before": "agenteTool1 [DEV]",
      "after": "agenteTool1 [UAT]",
      "state": "suffix-changed",
      "nameLength": 17,
      "exceedsTeamsLimit": false
    }
  ],
  "untouched": {
    "entries": 33,
    "note": "schemaname, nomi di cartella e di file, GUID, [Content_Types].xml, customizations.xml"
  }
}
```

---

### 4. `package`

Esegue i due export, il patch, il rezip e la verifica, e scrive l'**artifact set** sul disco
(FR-083).

**Input**:
```json
{
  "operation": "package",
  "solutionUniqueName": "testAgentTool",
  "suffix": "UAT",
  "outputDirectory": "C:\\packages",
  "agents": ["ava_agenteTool1"],
  "options": {
    "bumpVersion": false,
    "publishOnImport": "keep",
    "keepSourceArtifacts": true,
    "overwrite": false
  },
  "confirmExtraComponents": true,
  "confirmUnexpectedOccurrences": false
}
```

**Output**:
```json
{
  "status": "ok",
  "artifactSet": {
    "folderPath": "C:\\packages\\testAgentTool_1.0.0.2_UAT_20261015-143022",
    "export": { "mode": "sync", "seconds": 13.4 },
    "manifestPath": "C:\\packages\\testAgentTool_1.0.0.2_UAT_20261015-143022\\manifest.json",
    "totalBytes": 125876,
    "files": [
      { "fileName": "testAgentTool_1_0_0_2_managed_UAT.zip", "role": "deploy", "managed": true,
        "patched": true, "entryCount": 34, "sha256": "…",
        "verification": { "archiveReadable": true, "entryCountMatches": true,
                          "patchedValuesConfirmed": true, "byteIdenticalEntries": 33 } },
      { "fileName": "testAgentTool_1_0_0_2_unmanaged_UAT.zip", "role": "source", "managed": false,
        "patched": true, "entryCount": 34, "sha256": "…",
        "verification": { "archiveReadable": true, "entryCountMatches": true,
                          "patchedValuesConfirmed": true, "byteIdenticalEntries": 33 } },
      { "fileName": "source_managed.zip", "role": "restore", "managed": true,
        "patched": false, "entryCount": 34, "sha256": "…", "verification": null },
      { "fileName": "source_unmanaged.zip", "role": "restore", "managed": false,
        "patched": false, "entryCount": 34, "sha256": "…", "verification": null }
    ]
  },
  "changes": [
    { "file": "bots/ava_agenteTool1/bot.xml", "before": "agenteTool1 [DEV]", "after": "agenteTool1 [UAT]" }
  ]
}
```

Solo il file con `role: "deploy"` va importato in UAT/PROD. Quello con `role: "source"` è
l'unmanaged patchato, per source control o environment di sviluppo: importarlo a valle creerebbe
una solution unmanaged (FR-087).

Se la verifica fallisce anche su **uno solo** dei due archivi patchati, `status` è `error` e
l'intero artifact set non è dichiarato utilizzabile (FR-085). Gli export originali restano sul
disco e sono sempre importabili.

`package` scrive solo su filesystem locale: non modifica nessun environment. È per questo che, a
differenza dell'`apply` della v1, è disponibile in headless.

---

## Operazioni non supportate in headless

| Operazione | Motivo |
|---|---|
| `deploy` (fase 2) | Modifica un environment: richiede conferma umana esplicita e la scelta della connessione di destinazione |
| `removeUnmanagedLayer` | Operazione distruttiva su un environment: solo da UI, con conferma |

**Rationale**: l'headless si ferma al file. Tutto ciò che tocca un environment resta dietro una
conferma umana.

---

## Errori

```json
{
  "status": "error",
  "code": "SOLUTION_NOT_FOUND" | "SOLUTION_IS_MANAGED" | "NO_AGENTS_IN_PACKAGE" | "BOT_NAME_ELEMENT_MISSING" | "EXPORT_FAILED" | "PACKAGE_VERIFICATION_FAILED" | "OUTPUT_FILE_EXISTS" | "PERMISSION_DENIED" | "CONNECTION_ERROR",
  "message": "Descrizione leggibile dell'errore"
}
```

| Codice | Quando |
|---|---|
| `SOLUTION_IS_MANAGED` | La solution sorgente è managed: non esportabile (FR-068) |
| `NO_AGENTS_IN_PACKAGE` | Il package non contiene nessuna cartella `bots/` |
| `EXPORT_FAILED` | Hanno fallito **entrambi** i percorsi di export: sincrono e fallback asincrono (FR-093) |
| `UNEXPECTED_NAME_OCCURRENCE` | Il display name compare in un punto del package che il tool non conosce: il `nameOccurrences` con `expected: false` è nel messaggio. Si procede solo con `confirmUnexpectedOccurrences: true` (FR-096) |
| `BOT_NAME_ELEMENT_MISSING` | `bot.xml` non contiene `<name>` nel formato atteso: il tool si ferma invece di indovinare (FR-069) |
| `PACKAGE_VERIFICATION_FAILED` | La riapertura di uno dei due archivi patchati non ha superato i controlli: l'intero artifact set è invalidato (FR-077, FR-085) |
| `OUTPUT_FILE_EXISTS` | Cartella di artifact set già presente e `overwrite: false` (FR-074) |
| `EXTRA_COMPONENTS_NOT_CONFIRMED` | Il package contiene componenti diversi dall'agent selezionato e `confirmExtraComponents` non è `true`: l'elenco è nel messaggio (FR-091) |
