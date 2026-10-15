# Data Model: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14

---

## Runtime Entities (in-memory, sessione corrente)

### AgentRenameSession

Stato della sessione di rename corrente.

| Campo | Tipo | Descrizione |
|---|---|---|
| `sessionId` | string (UUID) | ID univoco sessione, usato nei backup e log |
| `environmentId` | string | ID environment PPTB connesso |
| `environmentName` | string | Display name environment |
| `solutionId` | string (GUID) | ID solution selezionata |
| `solutionUniqueName` | string | Unique name solution (es. `MySolution`) |
| `solutionDisplayName` | string | Friendly name solution |
| `publisherPrefix` | string | Customization prefix publisher (es. `myco`) |
| `envVariableDefId` | string \| null | GUID della `environmentvariabledefinition`, null se non esiste |
| `currentSuffixValue` | string | Valore attuale della env variable (può essere vuoto) |
| `newSuffixValue` | string | Suffisso che l'utente vuole applicare |
| `agents` | AgentRenameRecord[] | Lista agent caricati dalla solution |
| `status` | SessionStatus | Stato macchina sessione |
| `startedAt` | Date | Timestamp avvio sessione |

**SessionStatus enum**: `idle` | `loading` | `previewing` | `confirming` | `applying` | `publishing` | `complete` | `error`

---

### AgentRenameRecord

Stato per singolo agent all'interno della sessione.

| Campo | Tipo | Descrizione |
|---|---|---|
| `botId` | string (GUID) | ID univoco agent (`bot.botid`) |
| `currentName` | string | `bot.name` attuale |
| `currentBaseName` | string | Nome base calcolato (currentName con currentSuffix strippato) |
| `currentSuffix` | string \| null | Suffisso attualmente presente nel nome (null se non rilevato) |
| `proposedName` | string | Nome finale calcolato (currentBaseName + newSuffix) |
| `renameState` | RenameState | Stato del confronto nome attuale vs proposto |
| `currentManifest` | TeamsManifest \| null | Manifest Teams parsato (null se campo vuoto) |
| `proposedManifestNameShort` | string \| null | `name.short` proposto (null se no manifest) |
| `manifestNameTruncated` | boolean | true se proposedName ≥ 30 char e richiederebbe troncatura |
| `currentDescription` | string \| null | Description da botcomponent tipo 15 |
| `proposedDescription` | string \| null | Description aggiornata per l'ambiente |
| `hasTeamsChannel` | boolean | true se canale Teams/M365 Copilot configurato |
| `publishRequired` | boolean | true se hasTeamsChannel e manifest verrà modificato |
| `applyStatus` | ApplyStatus | Stato dell'operazione di apply |
| `publishStatus` | PublishStatus | Stato del Publish post-rename |
| `errorMessage` | string \| null | Messaggio errore se applyStatus = error |

**RenameState enum**: `no-change` | `suffix-added` | `suffix-changed` | `suffix-removed`

**ApplyStatus enum**: `pending` | `in-progress` | `success` | `error` | `skipped`

**PublishStatus enum**: `not-required` | `pending` | `in-progress` | `success` | `failed` | `skipped`

---

### TeamsManifest

Struttura JSON del campo `bot.applicationmanifestinformation`.

| Campo | Tipo | Constraint |
|---|---|---|
| `$schema` | string | Read-only, non modificare |
| `manifestVersion` | string | Read-only, non modificare |
| `version` | string | Semver (es. "1.0.3") — incrementare patch ad ogni update |
| `id` | string | Teams app GUID — read-only, non modificare |
| `name.short` | string | **Max 30 caratteri** — warning preventivo in preview |
| `name.full` | string | Nessun limite specifico |
| `description.short` | string | Opzionalmente aggiornato |
| `description.full` | string | Opzionalmente aggiornato |
| `accentColor` | string | Read-only per questo tool |

---

## Persistence Entities (file locale)

### BackupRecord

Snapshot pre-operazione per ogni agent. Salvato in file JSON locale prima di ogni apply.

| Campo | Tipo | Descrizione |
|---|---|---|
| `sessionId` | string | Riferimento alla sessione |
| `timestamp` | ISO8601 | Momento del backup |
| `environmentId` | string | Environment al momento del backup |
| `solutionId` | string | Solution al momento del backup |
| `botId` | string | ID agent |
| `botName` | string | `bot.name` al momento del backup |
| `applicationManifestInformation` | string \| null | Valore raw JSON del campo manifest |
| `description` | string \| null | Description da botcomponent tipo 15 |

**File path**: `{backupDir}/{sessionId}/backup-{timestamp}.json`

**Retention**: 30 giorni default, configurabile dall'utente.

---

### LogEntry

Ogni operazione eseguita dal tool genera uno o più log entry.

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | string (UUID) | ID univoco entry |
| `timestamp` | ISO8601 | Momento dell'operazione |
| `sessionId` | string | Sessione di origine |
| `userId` | string | ID utente PPTB connesso |
| `userDisplayName` | string | Display name utente |
| `environmentId` | string | Environment target |
| `solutionId` | string | Solution target |
| `botId` | string \| null | Agent target (null per operazioni solution-level) |
| `botName` | string \| null | Nome agent al momento dell'operazione |
| `operation` | OperationType | Tipo operazione |
| `field` | string \| null | Campo modificato (es. `bot.name`, `applicationmanifestinformation`) |
| `valueBefore` | string \| null | Valore prima della modifica |
| `valueAfter` | string \| null | Valore dopo la modifica |
| `outcome` | `success` \| `error` \| `skipped` | Esito |
| `errorMessage` | string \| null | Dettaglio errore se outcome = error |

**OperationType enum**: `rename_bot_name` | `rename_manifest` | `rename_description` | `update_env_variable` | `create_env_variable` | `publish` | `rollback` | `backup_created`

**File path**: `{logDir}/log-{YYYY-MM}.json` (rotazione mensile)

**Export format**: CSV o JSON su richiesta utente.

---

## Dataverse Source Entities (read/write via API)

### `bot` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `botid` | Read | Chiave primaria |
| `name` | Read + PATCH | Nome display agent — campo principale del rename |
| `applicationmanifestinformation` | Read + PATCH | Manifest Teams JSON |
| `published` | Read | Data ultima pubblicazione (null = mai pubblicato) |
| `synchronizationstatus` | Read | JSON con `applicationId` Teams |
| `ismanaged` | Read | Flag managed solution |

### `botcomponent` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `botcomponentid` | Read | Chiave primaria |
| `_parentbotid_value` | Filter | Filtro per agent padre |
| `componenttype` | Filter | 15 = Custom GPT (description) |
| `description` | Read + PATCH | Description dell'agent (componenttype 15) |

### `solutions` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `solutionid` | Read | Chiave primaria |
| `uniquename` | Read | Unique name (usato in AddSolutionComponent) |
| `friendlyname` | Read | Display name |
| `_publisherid_value` | Read | FK publisher per ottenere customizationprefix |

### `publishers` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `publisherid` | Read | Chiave primaria |
| `customizationprefix` | Read | Prefisso (es. `myco`) per costruire schemaname env variable |

### `solutioncomponents` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `_solutionid_value` | Filter | Filtro per solution |
| `componenttype` | Filter | 380 = Bot (Copilot Studio agent) |
| `objectid` | Read | ID dell'agent nella solution |

### `environmentvariabledefinitions` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `environmentvariabledefinitionid` | Read | Chiave primaria |
| `schemaname` | Read + POST | `{prefix}_AgentDisplaySuffix` |
| `displayname` | Read + POST | Display name leggibile |
| `type` | POST | 100000000 = String |
| `defaultvalue` | Read | Valore default (opzionale) |

### `environmentvariablevalues` (tabella Dataverse)

| Campo usato | Operazione | Note |
|---|---|---|
| `environmentvariablevalueid` | Read | Chiave primaria |
| `_environmentvariabledefinitionid_value` | Filter | FK alla definizione |
| `value` | Read + PATCH + POST | Valore stringa del suffisso |

---

## State Transitions

### AgentRenameRecord.renameState

```
currentName == proposedName       → no-change
currentSuffix == null, newSuffix set → suffix-added
currentSuffix set, newSuffix set, different → suffix-changed
currentSuffix set, newSuffix empty → suffix-removed
```

### AgentRenameRecord.applyStatus

```
initial → pending
user clicks Apply → in-progress
PATCH success → success
PATCH error → error (with errorMessage)
rollback applied → pending (reset)
```

### TeamsManifest.version increment

```
"1.0.2" → "1.0.3"   (patch bump obbligatorio ad ogni update manifest)
```
Teams riconosce il nome aggiornato solo se version aumenta.
