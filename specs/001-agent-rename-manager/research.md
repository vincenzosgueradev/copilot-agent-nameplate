# Research: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14

---

## §1 — PPTB Tool Package Structure

**Decision**: Il tool è un web package HTML/JS self-contained con `pptb.config.json` nella root.

**Rationale**: Tutti i tool PPTB seguono questo pattern. Il package viene caricato come iframe dentro l'app Electron. Nessuna build step obbligatoria — il JS può essere vanilla ES2020+ o bundled.

**Key API surface** (`window.toolboxAPI`, `window.dataverseAPI`, `window.powerplatformAPI`):
```js
// Connessione attiva
const conn = window.toolboxAPI.getCurrentConnection();
// { environmentId, environmentUrl, userId, userDisplayName }

// Dataverse read
const result = await window.dataverseAPI.RetrieveMultipleRecords(entitySet, query);
// { value: [...records], '@odata.nextLink': string | undefined }

// Dataverse write
await window.dataverseAPI.UpdateRecord(entitySet, id, data);
await window.dataverseAPI.CreateRecord(entitySet, data);

// Power Platform API
await window.powerplatformAPI.CopilotStudio.Post(path, body, params);

// File locale
await window.toolboxAPI.writeLocalFile(relativePath, content);
const content = await window.toolboxAPI.readLocalFile(relativePath);
```

**Alternatives considered**: React/Vue bundle — scartato, overengineering per questo tool; dipendenze NPM — evitate per semplicità di packaging PPTB.

---

## §2 — Dataverse: Solution Explorer e Agent per Solution

**Decision**: Partire SEMPRE dalla tabella `bot` (fonte autoritativa), poi arricchire con la solution.

> ⚠️ **CORREZIONE (2026-10-14)** — La versione precedente di questa sezione diceva
> "ComponentType 380 = Chatbot". **È FALSO.** La documentazione ufficiale
> ([solutioncomponent#componenttype-options](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/solutioncomponent#read-only-columns-attributes))
> elenca **380 = Environment Variable Definition** e **381 = Environment Variable Value**.
> L'enum documentato **non contiene alcun valore per Bot**. Filtrare su un numero
> indovinato restituisce zero righe silenziosamente — nessun errore, solo lista vuota.
> Questo errore ha causato il bug "tutti gli agent mostrano No solution".

**Rationale**: La tabella `bot` è l'unica fonte che garantisce di vedere TUTTI gli agent
dell'environment. Partire da `solutioncomponent` nasconde gli agent non presenti in una
solution visibile. Due modi corretti per risalire alla solution:

1. **`bot.solutionid`** — colonna documentata sulla tabella `bot` ("Unique identifier of the
   associated solution"). È un `Uniqueidentifier`, quindi in OData si legge come `solutionid`,
   **non** `_solutionid_value`. Zero chiamate extra.
2. **`solutioncomponent` filtrato per `objectid`** — mai per `componenttype`. Avendo già
   gli id dei bot, si usa FetchXML `<condition attribute="objectid" operator="in">`, che
   ignora in sicurezza eventuali voci orfane (bot cancellati).

**Query pattern**:
```
// 1. TUTTI gli agent — fonte autoritativa, include solutionid
FetchXML: <entity name="bot"><attribute name="botid"/><attribute name="name"/>
          <attribute name="solutionid"/><attribute name="statecode"/>
          <attribute name="createdon"/><attribute name="modifiedon"/>
          <attribute name="publishedon"/><order attribute="name"/></entity>
// statecode: 0 = Active, 1 = Inactive. publishedon è vuoto se l'agent non è mai stato pubblicato.
// Tutte le colonne sono presenti nella entity reference ufficiale di `bot`.

// 2. Lista solutions (fetch-all + filtro in-memory: evita URL troppo lunghi)
GET /solutions?$select=solutionid,uniquename,friendlyname,ismanaged
    &$expand=publisherid($select=customizationprefix)&$top=5000

// 3. Membership — per objectid, MAI per componenttype
FetchXML: <entity name="solutioncomponent">
            <attribute name="objectid"/><attribute name="solutionid"/>
            <filter><condition attribute="objectid" operator="in">
              <value>{botId1}</value><value>{botId2}</value>...
            </condition></filter>
          </entity>
```

**Nota**: `Default`, `Active` e `Basic` sono solution di sistema. Un agent che risulta
solo lì non è in nessuna solution custom — va comunque mostrato in lista.

**Alternatives considered**: filtro `componenttype` — scartato, valore per Bot non documentato
(vedi correzione sopra); link-entity annidati a 3 livelli — fallivano silenziosamente.

---

## §3 — PATCH su Bot in Managed Solution

> ⚠️ **CORREZIONE (2026-10-15) — l'ipotesi originale di questa sezione era FALSA.** Diceva che il
> PATCH su `bot.name` in una managed solution "funziona creando un unmanaged layer e non è
> bloccato". Il test reale in UAT l'ha smentita:
> `0x8004f026: The evaluation of the current component(name=bot, …) in the current operation
> (Update) failed during managed property evaluation of condition: Managed Property Name:
> iscustomizableanddeletable; Component Name: bot; Attribute Name: iscustomizable`.

**Decision**: Il rename di un agent in una managed solution è possibile **solo se il publisher ha
lasciato attiva** la managed property **"Can be customized"** (`IsCustomizable`) per quel
componente. Se è disattivata, Dataverse rifiuta l'Update e dal downstream non c'è modo di
aggirarlo.

**Rationale (documentato)** — [Use managed properties](https://learn.microsoft.com/power-platform/alm/use-managed-properties),
[Managed properties](https://learn.microsoft.com/power-platform/alm/managed-properties-alm):
- Ogni componente ha `IsCustomizable`. Se il publisher la imposta a `false`, dopo l'installazione
  come managed il componente non è personalizzabile.
- Le managed property si impostano **nella solution unmanaged**, nell'environment di sviluppo,
  prima dell'export come managed. Una volta importata la managed "non si possono aggiornare se
  non con un aggiornamento della solution da parte del publisher originale", e solo per renderle
  **meno** restrittive.
- Sono applicate solo ai componenti managed: per sapere se un componente è modificabile vanno
  controllate **sia** `IsCustomizable` **sia** `IsManaged` (`IsCustomizable=false` con
  `IsManaged=false` è modificabile).
- Impatto sul tool: in UAT/PROD l'agent va bloccato dal publisher **prima** del deploy; non è
  correggibile da lì. In DEV (unmanaged) non si applica.

**Rilevamento**: `GET bots?$select=botid,ismanaged,iscustomizable`. `iscustomizable` è una managed
property, quindi la Web API la restituisce come `{ Value, CanBeChanged, ManagedPropertyLogicalName }`
([BooleanManagedProperty](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/booleanmanagedproperty)).
Bloccato ⇔ `ismanaged === true && iscustomizable.Value === false`. Se la forma della risposta non
è quella attesa il tool non deduce nulla e non blocca niente.

**Non verificato**: dove si trova esattamente il comando "Managed properties" per un agent Copilot
Studio nell'interfaccia (la documentazione dice solo che "most solution components" lo hanno), e
se Copilot Studio imposti `iscustomizable=false` di default alla creazione di un agent. In UAT
l'agent di test risultava bloccato, quindi potrebbe essere il comportamento predefinito: da
controllare creando un nuovo agent in DEV.

> **Verifica 2026-10-15 — `AddSolutionComponent`:** è documentato che non si possono aggiungere né
> rimuovere componenti in una solution managed ([Solutions overview](https://learn.microsoft.com/power-apps/maker/data-platform/solutions-overview),
> [Introduction to solutions](https://learn.microsoft.com/dynamics365/customerengagement/on-premises/developer/introduction-solutions?view=op-9-1)),
> quindi §4 va letto con questa eccezione.

**Alternatives considered**: creare un unmanaged layer prima del PATCH — non esiste un modo per
farlo quando la managed property lo vieta; usare la UI di Copilot Studio — non automatizzabile,
e non è verificato se subisca la stessa restrizione.

---

## §4 — Environment Variable CRUD

**Decision**: Usare le tabelle Dataverse `environmentvariabledefinitions` (definizione) e `environmentvariablevalues` (valore) con CRUD standard.

**Rationale**: Queste tabelle sono parte dello standard Dataverse per le environment variable. La definizione ha `schemaname` (es. `prefix_AgentDisplaySuffix`), `type` (100000000 = String), `displayname`. Il valore è in `environmentvariablevalues` con lookup alla definizione.

**Query pattern**:
```
// Verifica esistenza env variable nella solution
GET /environmentvariabledefinitions?$filter=schemaname eq '{prefix}_AgentDisplaySuffix'
  &$select=environmentvariabledefinitionid,schemaname,displayname,defaultvalue

// Leggi valore corrente
GET /environmentvariablevalues?$filter=_environmentvariabledefinitionid_value eq '{defId}'
  &$select=environmentvariablevalueid,value

// Crea definizione (se non esiste)
POST /environmentvariabledefinitions
  { schemaname, displayname, type: 100000000, description }

// Aggiorna valore
PATCH /environmentvariablevalues({valueId}) { value: 'nuovo_valore' }
// oppure POST se value record non esiste ancora

// Aggiungi alla solution (dopo creazione)
POST /AddSolutionComponent
  { ComponentId: '{defId}', ComponentType: 380, SolutionUniqueName: '...' }
```

**Note**: ComponentType per `environmentvariabledefinition` = **380** (e 381 per
`environmentvariablevalue`), come da enum ufficiale. Una nota precedente indicava 393:
era errata, vedi la correzione in §2.

**Alternatives considered**: Env variable tramite Power Platform CLI — non disponibile in PPTB tool context.

---

## §5 — applicationmanifestInformation: Struttura e Update

**Decision**: Parse JSON, aggiorna `name.short` (max 30 char) e `name.full`, incrementa `version` (semver patch), PATCH back. Poi PvaPublish per propagare ai canali.

**Rationale**: Il campo `applicationmanifestinformation` in `bot` contiene il manifest Teams come JSON serializzato. Aggiornare solo `bot.name` non aggiorna il manifest — sono campi separati e indipendenti.

**Struttura manifest**:
```json
{
  "$schema": "...",
  "manifestVersion": "1.13",
  "version": "1.0.X",
  "id": "{teams-app-id}",
  "packageName": "...",
  "name": {
    "short": "Nome breve (max 30 char)",
    "full": "Nome completo esteso"
  },
  "description": {
    "short": "...",
    "full": "..."
  },
  "accentColor": "#FFFFFF",
  "bots": [{ "botId": "...", ... }]
}
```

**Logica update**:
```js
const manifest = JSON.parse(bot.applicationmanifestinformation);
manifest.name.short = truncate(newName, 30);
manifest.name.full = newName;
manifest.version = bumpPatchVersion(manifest.version); // "1.0.2" → "1.0.3"
await dataverseAPI.UpdateRecord('bots', botId, {
  applicationmanifestinformation: JSON.stringify(manifest)
});
```

**Alternatives considered**: Aggiornare solo `bot.name` senza manifest — Teams non aggiornerebbe il nome nel canale.

---

## §6 — PvaPublish: Invocazione e Polling

**Decision**: Invocare la bound action Dataverse `Microsoft.Dynamics.CRM.PvaPublish` e fare polling su `PvaPublishStatus` ogni 3 secondi fino a completamento (max 120s timeout).

**Rationale**: PvaPublish è l'unico modo documentato per propagare le modifiche all'agent (incluso manifest Teams) ai canali attivi. È una operazione asincrona — richiede polling.

**Pattern**:
```js
// Avvio publish
await dataverseAPI.ExecuteAction(
  `bots(${botId})/Microsoft.Dynamics.CRM.PvaPublish`,
  {}
);

// Polling status (ogni 3s)
const status = await dataverseAPI.ExecuteFunction(
  `bots(${botId})/Microsoft.Dynamics.CRM.PvaPublishStatus`
);
// status: { PublishStatus: 'Publishing' | 'Published' | 'Failed' }
```

**Alternatives considered**: Power Platform REST API publish endpoint — non documentato per questa operazione; polling su `bot.published` — non riflette stato async publish in corso.

---

## §7 — Logica Strip/Apply Suffisso (Idempotenza)

**Decision**: Il suffisso corrente viene letto dalla env variable, cercato come stringa esatta in coda a `bot.name` (con e senza spazio precedente), rimosso per ottenere il nome base, poi appended il nuovo suffisso.

**Rationale**: Garantisce che rieseguire il tool produca sempre il nome corretto senza duplicazioni (FR-007, Clarification Q1).

**Pseudocode**:
```js
function calculateFinalName(currentBotName, currentSuffix, newSuffix) {
  let baseName = currentBotName;
  
  if (currentSuffix && currentSuffix.trim() !== '') {
    // Prova strip con spazio precedente
    const withSpace = ` ${currentSuffix}`;
    if (baseName.endsWith(withSpace)) {
      baseName = baseName.slice(0, -withSpace.length);
    } else if (baseName.endsWith(currentSuffix)) {
      baseName = baseName.slice(0, -currentSuffix.length).trimEnd();
    }
  }
  
  if (newSuffix && newSuffix.trim() !== '') {
    return `${baseName} ${newSuffix}`.trim();
  }
  return baseName.trim();
}
```

**Edge case**: Se `currentSuffix` è vuota (env variable non configurata o valore vuoto), `baseName = currentBotName` — nessuno strip, applica solo nuovo suffisso.

---

## §8 — Canale Teams Attivo: Rilevamento

**Decision**: Rilevare presenza canale Teams/M365 Copilot tramite `bot.synchronizationstatus` (contiene `applicationId` se Teams è configurato) e/o controllare `botcomponent` con componenttype 18 (Copilot Settings) che include configurazione canali.

**Rationale**: Sapere se un agent ha Teams attivo è necessario per mostrare il banner "Publish required" (FR-013, FR-014). Il campo `synchronizationstatus` JSON contiene `applicationId` (Teams app ID) se il canale è configurato.

**Pattern**:
```js
const syncStatus = JSON.parse(bot.synchronizationstatus || '{}');
const hasTeamsChannel = !!(syncStatus.applicationId);
```

**Alternatives considered**: Query su `botcomponents` tipo 18 — più affidabile ma richiede chiamata extra per ogni agent; usare `bot.published` — indica solo se è stato pubblicato, non quale canale.
