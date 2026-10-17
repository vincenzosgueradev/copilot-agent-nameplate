# Data Model: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14 | **Revisione**: 2026-10-15 (packaging)

> **Revisione 2026-10-15.** Il modello della v1 ruotava attorno a `AgentRenameRecord`,
> `TeamsManifest` e `BackupRecord`: entità di un flusso che scriveva su Dataverse. Il tool non
> scrive più su Dataverse (FR-067). L'entità centrale è ora il **solution package**; le entità
> rimosse sono elencate in fondo con il motivo.

---

## Runtime Entities (in-memory, sessione corrente)

### PackagingSession

Lo stato di un'operazione di packaging dall'inizio alla scrittura dei file.

| Campo | Tipo | Note |
|---|---|---|
| `sessionId` | string | Identificativo della sessione |
| `sourceEnvironmentUrl` | string | Environment da cui si esporta (la sorgente, tipicamente DEV) |
| `solutionUniqueName` | string | Solution sorgente |
| `artifactSet` | ArtifactSet \| null | Popolato alla scrittura su disco |
| `suffix` | string | Suffisso scelto, senza parentesi quadre (es. `UAT`); vuoto = rimuovi suffisso |
| `selectedAgents` | string[] | `schemaName` degli agent da rinominare (FR-076) |
| `options` | PackagingOptions | Opzioni del patch |
| `packageContents` | `{ managed: PackageContents, unmanaged: PackageContents } \| null` | Popolato dopo i **due** export (FR-084) |
| `patchPlan` | PatchChange[] | Calcolato, mostrato prima di scrivere (FR-075) |
| `step` | `'solution' \| 'suffix' \| 'preview' \| 'result'` | Passo corrente |

### PackagingOptions

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `newVersion` | string \| null | `null` | Versione a cui il tool porta la solution **in DEV** prima dell'export (FR-073, FR-067a); `null` = non si tocca. Non si scrive mai dentro lo zip. L'interfaccia la propone per default come ultimo segmento + 1 |
| `publishOnImport` | `'keep' \| 'force-true' \| 'force-false'` | `'keep'` | Tre stati; `keep` non tocca il file (FR-090) |
| `keepSourceArtifacts` | boolean | `true` | Conserva nell'artifact set i due export non patchati (FR-078, FR-088) |

### PackageContents

Ciò che il tool legge dall'archivio esportato. **Fonte verificata**: research §9.

| Campo | Tipo | Origine nel package |
|---|---|---|
| `bytes` | Uint8Array | `ExportSolutionFile` (base64 decodificato), dal percorso sincrono o asincrono |
| `exportMode` | `'sync' \| 'async'` | Quale percorso ha prodotto questo archivio (FR-093) |
| `exportSeconds` | number | Durata dell'export, registrata nel manifest per i test di carico |
| `entries` | PackageEntry[] | Tutte le entry dell'archivio, con contenuto grezzo |
| `uniqueName` | string | `solution.xml` → `<UniqueName>` |
| `version` | string | `solution.xml` → `<Version>` |
| `managed` | boolean | `solution.xml` → `<Managed>` (`1` = managed) |
| `publisherUniqueName` | string | `solution.xml` → `<Publisher><UniqueName>` |
| `publisherPrefix` | string | `solution.xml` → `<CustomizationPrefix>` |
| `agents` | PackagedAgent[] | Una voce per cartella `bots/<schemaname>/` |
| `inventory` | PackageComponent[] | **Tutto** ciò che c'è nel package, non solo gli agent (FR-091) |
| `fingerprint` | FormatFingerprint | Impronta del formato di questo package (FR-097) |
| `drift` | FormatDrift[] | Scostamenti rispetto a baseline e packaging precedente |
| `nameOccurrences` | NameOccurrence[] | Dove compare il display name di ogni agent (FR-096) |
| `suffixVariable` | PackagedVariable \| null | `environmentvariabledefinitions/<schema>/…` di tipo String |

### PackageEntry

| Campo | Tipo | Note |
|---|---|---|
| `path` | string | Percorso nell'archivio, **immutabile** (FR-069) |
| `data` | Uint8Array | Contenuto grezzo |
| `compressType` | number | Da riusare nella ricostruzione |
| `dateTime` | Date | Da riusare nella ricostruzione |
| `patched` | boolean | `true` solo per le entry effettivamente riscritte |

> **Nota implementativa (FR-077)**: nella riscrittura dell'archivio le entry vanno **ricreate**,
> non clonate dall'header dell'entry sorgente: l'offset originale rende l'archivio illeggibile
> (research §9).

### PackagedAgent

| Campo | Tipo | Origine |
|---|---|---|
| `schemaName` | string | Attributo `schemaname` di `<bot>` — **mai modificato** |
| `file` | string | `bots/<schemaname>/bot.xml` |
| `name` | string | `<name>` — **l'unico campo patchato** |
| `baseName` | string | `name` senza il suffisso finale ` [X]`, calcolato (FR-071) |
| `currentSuffix` | string \| null | `X` estratto da ` [X]`, se presente |
| `publishOnImport` | `boolean \| null` | `bots/<schemaname>/configuration.json` → `publishOnImport`. **`null` = campo assente**, cioè "non specificato": 28 agent su 40 nell'environment di riferimento (FR-080, FR-090) |
| `channels` | string[] | `configuration.json` → `channels[].channelId` |

### PackagedVariable

| Campo | Tipo | Origine |
|---|---|---|
| `schemaName` | string | Attributo `schemaname` della definizione |
| `file` | string | `environmentvariabledefinitions/<schema>/environmentvariabledefinition.xml` |
| _(uso)_ | | Serve **solo** a riconoscere un eventuale *Channel display name suffix* nativo e avvisare del doppio suffisso (FR-089). Nessun campo di questo file viene scritto |
| `type` | string | `<type>` — `100000000` = String (le altre non sono usabili come suffisso) |
| `defaultValue` | string \| null | `<defaultvalue>`, assente negli export verificati. **Sola lettura**: il tool non lo scrive mai (FR-089) |

### FormatFingerprint

L'impronta del formato del package, calcolata a ogni export e confrontata con la baseline del tool
e con l'ultimo packaging della stessa solution (FR-097, FR-098).

| Campo | Tipo | Origine |
|---|---|---|
| `solutionPackageVersion` | string | `solution.xml` → attributo `SolutionPackageVersion` (osservato: `9.2`) |
| `platformStamps` | `{ version, organizationVersion, serviceabilityVersion }` | Attributi di `<ImportExportXml>`; cambiano a ogni aggiornamento di Dataverse |
| `topLevelPaths` | string[] | Cartelle e file di primo livello nell'archivio |
| `botElements` | string[] | Nomi degli elementi presenti in `bot.xml` |
| `botComponentElements` | string[] | Nomi degli elementi presenti in `botcomponent.xml` |
| `configurationKeys` | string[] | Chiavi di primo livello di `configuration.json` |

### FormatDrift

Uno scostamento rilevato rispetto alla baseline o al packaging precedente.

| Campo | Tipo | Note |
|---|---|---|
| `against` | `'baseline' \| 'previous'` | Con che cosa è stato fatto il confronto |
| `kind` | `'added' \| 'removed' \| 'changed'` | |
| `what` | string | Es. `bot.xml: elemento nuovo 'displayname'` |
| `blocking` | boolean | **Sempre `false`** per lo scostamento di formato: è un avviso (FR-097) |

### NameOccurrence

Dove compare il display name dentro il package (FR-096). Atteso: **una sola** occorrenza con
`expected: true`.

| Campo | Tipo | Note |
|---|---|---|
| `file` | string | Entry dell'archivio |
| `locator` | string | Elemento XML o percorso JSON che contiene il valore |
| `value` | string | Il valore trovato |
| `expected` | boolean | `true` per `bots/<schema>/bot.xml` → `<name>`; `true` anche per l'occorrenza nota `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` quando coincide col nome base |
| `willBePatched` | boolean | `false` su tutto ciò che non è `bot.xml` → `<name>` |

Un'occorrenza con `expected: false` **blocca** il packaging finché l'utente non conferma
esplicitamente (FR-096).

### PackageComponent

Una voce dell'inventario del package: serve a mostrare **che cosa viaggia oltre all'agent**
(FR-091). L'artefatto è la solution intera.

| Campo | Tipo | Note |
|---|---|---|
| `path` | string | Cartella di primo livello nell'archivio (`bots/`, `botcomponents/`, `workflows/`, `environmentvariabledefinitions/`…) |
| `kind` | string | Tipo leggibile: `Agent`, `Agent component`, `Cloud flow`, `Table`, `Connection reference`, `Security role`, `Canvas app`, `Sconosciuto` |
| `componentType` | number \| null | Dove ricavabile. **Misurati**: 10212 = Agent, 10213 = Agent component (FR-092) |
| `count` | number | Quante occorrenze |
| `names` | string[] | Nomi, dove leggibili dal package |
| `relatedToSelectedAgent` | boolean | `false` ⇒ è ciò che fa scattare la conferma esplicita di FR-091 |

### PatchChange

Una riga del Patch Plan: ciò che verrà scritto, mostrato prima di scrivere (FR-075).

| Campo | Tipo | Note |
|---|---|---|
| `file` | string | Percorso nell'archivio |
| `element` | `'name' \| 'Version' \| 'publishOnImport'` | Elemento toccato (l'ultimo è JSON, non XML) |
| `before` | string \| null | Valore attuale |
| `after` | string | Valore nuovo |
| `state` | `'no-change' \| 'suffix-added' \| 'suffix-changed' \| 'suffix-removed' \| 'added'` | Per l'anteprima |
| `exceedsTeamsLimit` | boolean | `after` > 30 caratteri — **solo informativo** (FR-019 ridimensionato, FR-079) |

### VerificationResult

Esito dei controlli post-scrittura (FR-077). Se un solo campo è `false`, lo zip non è utilizzabile.

| Campo | Tipo | Controllo |
|---|---|---|
| `archiveReadable` | boolean | L'archivio prodotto si riapre senza errori |
| `entryCountMatches` | boolean | Stesso numero di entry dell'originale |
| `patchedValuesConfirmed` | boolean | Ogni `<name>` patchato rileggo il valore atteso |
| `byteIdenticalEntries` | number | Entry non patchate identiche all'originale (SC-008) |

La verifica è **per archivio**: managed e unmanaged sono verificati separatamente. Se fallisce anche
su uno solo dei due, l'intero artifact set non è valido (FR-085).

---

## Artifact Entities (su disco)

### ArtifactSet

Il prodotto di un'operazione di packaging: la cartella di operazione, con la coppia
managed+unmanaged patchata, gli originali e il manifest (FR-083). È il corrispettivo di ciò che il
*pipelines host* conserva per ogni versione — con la differenza che qui l'artefatto è patchato,
cosa che il pipelines host proibisce.

```text
testAgentTool_1.0.0.2_UAT_20261015-143022/
├── manifest.json
├── testAgentTool_1_0_0_2_managed_UAT.zip      ← role: deploy
├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    ← role: source
├── source_managed.zip                         ← role: restore
└── source_unmanaged.zip                       ← role: restore
```

| Campo | Tipo | Note |
|---|---|---|
| `folderPath` | string | Cartella dell'operazione |
| `folderName` | string | `{UniqueName}_{Version}_{SUFFISSO}_{yyyyMMdd-HHmmss}` |
| `files` | ArtifactFile[] | Da 2 a 4 archivi (FR-088) |
| `manifestPath` | string | `manifest.json` |
| `totalBytes` | number | Spazio occupato, mostrato all'utente (FR-088) |

### ArtifactFile

| Campo | Tipo | Note |
|---|---|---|
| `fileName` | string | Nome del file nella cartella |
| `role` | `'deploy' \| 'source' \| 'restore'` | `deploy` = managed patchato (l'unico da importare in UAT/PROD); `source` = unmanaged patchato; `restore` = export originale |
| `managed` | boolean | Dal `<Managed>` di `solution.xml` |
| `patched` | boolean | `false` per i due originali |
| `bytes` | number | Dimensione |
| `entryCount` | number | Entry nell'archivio |
| `sha256` | string | Hash del file — **ciò che distingue due artefatti con la stessa `<Version>`** (FR-086) |
| `verification` | VerificationResult \| null | `null` per gli originali, che non vengono patchati |

> **FR-087**: l'`ArtifactFile` con `role: 'source'` (unmanaged patchato) non va importato in
> UAT/PROD: creerebbe una solution unmanaged. L'etichetta va mostrata ovunque il file compaia.

### ManifestFile (`manifest.json`)

Il contenuto serializzato della cartella. È l'unica fonte che permette di dire, a posteriori,
**quale file è stato importato dove** (SC-011).

```json
{
  "operationId": "…",
  "timestamp": "2026-10-15T14:30:22Z",
  "user": "…",
  "source": {
    "environmentUrl": "https://org0d6fa303.crm.dynamics.com/",
    "solutionUniqueName": "testAgentTool",
    "version": "1.0.0.2",
    "publisher": { "uniqueName": "Avanade", "prefix": "ava" }
  },
  "suffix": "UAT",
  "export": { "mode": "sync", "seconds": 13.4 },
  "notice": "Questo package e' stato modificato dal tool: un solo elemento, bots/<schema>/bot.xml <name>. Microsoft non supporta la modifica manuale dei file di una solution. source_managed.zip, non modificato, e' nella stessa cartella.",
  "options": { "newVersion": "1.0.0.3", "publishOnImport": "keep", "keepSourceArtifacts": true },
  "versionChange": { "from": "1.0.0.2", "to": "1.0.0.3", "changed": true },
  "agents": [
    { "schemaName": "ava_agenteTool1", "before": "agenteTool1 [DEV]", "after": "agenteTool1 [UAT]" }
  ],
  "files": [
    {
      "fileName": "testAgentTool_1_0_0_2_managed_UAT.zip",
      "role": "deploy", "managed": true, "patched": true,
      "bytes": 31469, "entryCount": 34,
      "sha256": "…",
      "verification": { "archiveReadable": true, "entryCountMatches": true,
                        "patchedValuesConfirmed": true, "byteIdenticalEntries": 33 }
    }
  ]
}
```

---

## Persistence Entities (store locale PPTB)

### PackagingRecord

Voce di History. Sostituisce `BackupRecord`: non essendoci scritture su Dataverse non c'è nulla da
annullare, l'artefatto di ripristino è il package originale (FR-078).

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | Identificativo |
| `timestamp` | string (ISO) | Data/ora del packaging |
| `user` | string | Utente connesso |
| `sourceEnvironmentUrl` | string | Environment sorgente |
| `solutionUniqueName` | string | Solution |
| `version` | string | Versione nel package prodotto |
| `managed` | boolean | Tipo di export |
| `suffix` | string | Suffisso applicato |
| `agents` | `{ schemaName, before, after }[]` | Rename eseguiti nel package |
| `options` | PackagingOptions | Opzioni attive |
| `artifactSetPath` | string | Cartella dell'operazione |
| `files` | `{ fileName, role, sha256 }[]` | Copia ridotta del manifest, per cercare in History senza riaprire i file |
| `verification` | `{ managed: VerificationResult, unmanaged: VerificationResult }` | Esito per archivio (FR-085) |
| `exportMode` | `'sync' \| 'async'` | Percorso usato; `async` significa che il sincrono è fallito (FR-093) |
| `exportSeconds` | number | Durata totale degli export |
| `fingerprint` | FormatFingerprint | Su quale formato è stato prodotto questo artefatto (FR-100) |
| `drift` | FormatDrift[] | Scostamenti segnalati durante l'operazione |
| `confirmations` | `{ what, confirmedAt }[]` | Conferme esplicite date dall'utente (nome in punto non noto, componenti extra) |
| `status` | `'ok' \| 'verification-failed' \| 'failed'` | Esito complessivo |
| `deployments` | DeploymentRecord[] | Fase 2: import eseguiti a partire da questo package |

**Retention**: 30 giorni, massimo 200 voci, solo sul dispositivo. Le voci scadute sono nascoste in
lettura ed eliminate alla scrittura successiva.

### DeploymentRecord *(fase 2)*

| Campo | Tipo | Note |
|---|---|---|
| `timestamp` | string (ISO) | Data/ora dell'import |
| `targetEnvironmentUrl` | string | Environment di destinazione |
| `importJobId` | string | GUID restituito da `deploySolution` |
| `status` | `'running' \| 'succeeded' \| 'failed'` | Esito del polling |
| `message` | string | Messaggio di Dataverse in caso di errore |

### LogEntry

| Campo | Tipo | Note |
|---|---|---|
| `timestamp` | string (ISO) | |
| `level` | `'info' \| 'success' \| 'warning' \| 'error'` | |
| `message` | string | Testo leggibile |

**Export format**: CSV o JSON su richiesta utente.

---

## Dataverse Source Entities (**sola lettura**)

> Nessuna tabella è più scritta dal tool in fase 1 (FR-067). La colonna "Operazione" riporta solo
> `Read` per questo motivo.

### `bot` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `botid` | Read | Chiave primaria |
| `name` | Read | Mostrato nella lista. **Non è il valore rinominato**: quello sta nel package |
| `schemaname` | Read | Correla l'agent di Dataverse con la cartella `bots/<schemaname>/` del package |
| `statecode` | Read | Active / Inactive |
| `publishedon` | Read | Ultima pubblicazione (vuoto = mai pubblicato) |
| `createdon`, `modifiedon` | Read | Colonne della lista agent |
| `ismanaged` | Read | Informativo: segnala che in quell'environment la solution è managed |

### `solutions` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `solutionid` | Read | Chiave primaria |
| `uniquename` | Read | Parametro `SolutionName` di `ExportSolution` |
| `friendlyname` | Read | Display name |
| `version` | Read | Mostrata in lista e usata nel nome del file (FR-074) |
| `ismanaged` | Read | `true` ⇒ non esportabile, non può essere sorgente (FR-068) |
| `isvisible` | Read | Filtro della lista |
| `_publisherid_value` | Read | FK publisher |

### `publishers` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `publisherid` | Read | Chiave primaria |
| `customizationprefix` | Read | Prefisso (es. `ava`), mostrato nei metadati della solution |
| `friendlyname` | Read | Nome publisher |

### `solutioncomponents` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `_solutionid_value` | Filter | Filtro per solution |
| `objectid` | Read | Correlazione con gli id dei bot già noti (FR-025: **mai** filtrare per `componenttype` indovinato) |

### `environmentvariabledefinitions` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `environmentvariabledefinitionid` | Read | Chiave primaria |
| `schemaname` | Read | Mostrato come candidato per il *Channel display name suffix* nativo |
| `type` | Read | `100000000` = String |

### Azioni

| Azione | Fase | Note |
|---|---|---|
| `ExportSolution` | 1 | `{ SolutionName, Managed }` → `ExportSolutionFile` (base64) |
| `ImportSolution` | 2 | Via `dataverseAPI.deploySolution` + `getImportJobStatus` |

---

## State Transitions

### PatchChange.state (per l'elemento `name`)

```
name nel package == nome nuovo          → no-change
currentSuffix == null, suffix valorizzato → suffix-added
currentSuffix valorizzato, suffix diverso → suffix-changed
currentSuffix valorizzato, suffix vuoto   → suffix-removed
```

Il nome nuovo è sempre `baseName` + ` [SUFFISSO]`, dove `baseName` è calcolato **sul valore nel
package** (FR-071). Il calcolo è idempotente: rieseguirlo sullo stesso package con lo stesso
suffisso produce lo stesso risultato.

### PackagingSession.step

```
solution → suffix → preview → result
   ↑          ↑         ↑
   └──────────┴─────────┘   breadcrumb: indietro di un solo livello (FR-033, FR-044)
```

Nessuna transizione scrive su un environment. L'unica scrittura è il salvataggio dei file, dopo
la conferma nello step `preview`.

### PackagingRecord.status

```
entrambi gli archivi verificati        → ok
uno dei due non supera la verifica     → verification-failed   (l'intero set non è valido, FR-085)
export o patch falliti                 → failed                (nessun file prodotto)
```

---

## Entità rimosse rispetto alla v1

| Entità | Motivo |
|---|---|
| `AgentRenameRecord` | Sostituita da `PackagedAgent` + `PatchChange`: l'oggetto del rename è il package, non il record Dataverse |
| `TeamsManifest` (e il bump di `version`) | Il manifest Teams non è nel package e non viene esportato (FR-079, research §9) |
| `BackupRecord` | Nessuna scrittura su Dataverse da annullare: l'artefatto di ripristino è il package originale (FR-078) |
| `environmentvariablevalues` | I valori delle environment variable non vengono né letti né scritti: nel package c'è solo la definizione |
