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

> **⚠️ Superato dal 2026-10-15.** Questa sezione descrive perché il PATCH live su un agent managed
> fallisce *quando il publisher lo ha bloccato*. Il punto vero è un altro: **anche quando riesce, è
> sbagliato** — un UPDATE su un componente che arriva da una managed solution crea un *unmanaged
> layer* nell'environment di destinazione, che da quel momento vince su ogni upgrade successivo
> della solution. Il tool non scrive più su `bot` in nessun environment: vedi **§9** e FR-067.

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

---

## §9 — Anatomia verificata del solution package (export reale)

**Status**: ✅ **Verificato sul campo**, non dedotto dalla documentazione. Export reale della solution
`testAgentTool` (v1.0.0.2, publisher `Avanade`, prefix `ava`) dall'environment DEV
(`org0d6fa303.crm.dynamics.com`) il 2026-10-15 via `POST /api/data/v9.2/ExportSolution`
con `{"SolutionName":"testAgentTool","Managed":true}`.

### Contenuto del package (34 entry)

```text
[Content_Types].xml
solution.xml
customizations.xml
bots/ava_agenteTool1/bot.xml                      ← display name dell'agent
bots/ava_agenteTool1/configuration.json
botcomponents/ava_agenteTool1.topic.<Nome>/botcomponent.xml   (×14)
botcomponents/ava_agenteTool1.topic.<Nome>/data               (×14, YAML)
botcomponents/ava_agenteTool1.gpt.default/botcomponent.xml
botcomponents/ava_agenteTool1.gpt.default/data
environmentvariabledefinitions/ava_AgentSuffix_testAgentTool/environmentvariabledefinition.xml
```

### Dove sta il display name — un solo punto

`bots/ava_agenteTool1/bot.xml` (il blob `<iconbase64>` è omesso qui):

```xml
<bot schemaname="ava_agenteTool1">
  <authenticationmode>2</authenticationmode>
  <authenticationtrigger>1</authenticationtrigger>
  <iconbase64>[...]</iconbase64>
  <iscustomizable>1</iscustomizable>
  <language>1033</language>
  <name>agenteTool1 [DEV]</name>
  <runtimeprovider>0</runtimeprovider>
  <template>default-2.1.0</template>
  <timezoneruleversionnumber>4</timezoneruleversionnumber>
</bot>
```

**Decision**: il patch del nome tocca **esclusivamente** l'elemento `<name>` di
`bots/<schemaname>/bot.xml`, un elemento per agent. Nient'altro nel package contiene il display
name.

**Rationale**: `schemaname` è l'**identità** del componente. Mantenendolo invariato l'import nel
target è un *upgrade dello stesso agent*; cambiandolo si crea un agent nuovo e il vecchio resta
orfano nel managed layer. Per lo stesso motivo non vanno rinominate cartelle né file.

**⚠️ Anti-pattern noto**: lo script più diffuso in rete per rinominare un agent in un export
([gist CodeRunRepeat](https://gist.github.com/CodeRunRepeat/fc97387f34ba247f697681dcf52567be))
fa *substring replace* su tutti i file di `Assets/`, `bots/`, `botcomponents/`, più
`[Content_Types].xml`, `customizations.xml`, `solution.xml`, e **rinomina le cartelle**. Serve a
duplicare un agent nello stesso environment — è l'opposto di quello che serve qui. Usarlo per il
nostro caso romperebbe l'upgrade path.

### Cosa NON c'è nel package

- **Nessun manifest Teams**: `applicationmanifestinformation` non viene esportato. Conferma la
  documentazione Microsoft ("the imported agent might be missing some elements, for example the
  agent icon and channel details is empty",
  [Export and import agents using solutions](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-import-export)).
  → Il nome sui canali Teams/M365 **non** è patchabile dal package: dipende dal publish e dalla
  feature nativa *Channel display name suffix*.
- **Nessun current value delle environment variable**: viene esportata solo la *definizione*
  (`environmentvariabledefinition.xml`), senza valori. I valori restano per-environment.
- `customizations.xml` è vuoto (nessuna entity/workflow), `<RootComponents />` in `solution.xml` è
  vuoto: i bot sono dichiarati dalla presenza delle cartelle, non da una lista di root component.

### `solution.xml` — cosa conta per il repackaging

```xml
<UniqueName>testAgentTool</UniqueName>
<Version>1.0.0.2</Version>
<Managed>1</Managed>
<Publisher><UniqueName>Avanade</UniqueName><CustomizationPrefix>ava</CustomizationPrefix>…</Publisher>
```

`<Managed>1</Managed>` è prodotto dall'export con `Managed: true`. **Non** va flippato a mano su un
export unmanaged per "convertirlo": la conversione offline non è supportata e il package risultante
non è equivalente.

### `environmentvariabledefinition.xml` — aggancio per il suffisso nativo

```xml
<environmentvariabledefinition schemaname="ava_AgentSuffix_testAgentTool">
  <displayname default="Agent Display Suffix – testAgentTool">…</displayname>
  <introducedversion>1.0</introducedversion>
  <iscustomizable>1</iscustomizable>
  <isrequired>0</isrequired>
  <secretstore>0</secretstore>
  <type>100000000</type>
</environmentvariabledefinition>
```

Nell'export non c'è `<defaultvalue>`. Scrivendolo nel package (FR-072) il *Channel display name
suffix* nativo arriva nel target già allineato al suffisso del package, senza toccare l'environment.

### `configuration.json` — `publishOnImport`

```json
{ "channels": [{"channelId": "MsTeams"}, {"channelId": "Microsoft365Copilot"}],
  "publishOnImport": true, … }
```

L'agent si **ripubblica da solo** all'import: il nome patchato diventa effettivo senza un passo di
publish manuale. Questo rende superfluo lo step PvaPublish del disegno originale (§6) per il flusso
di packaging.

### Repackaging — mechanics verificate

Patch + rezip eseguito e verificato in locale: 34 entry in → 34 entry out, zip integro
(`testzip() → None`), `<name>` = `agenteTool1 [UAT]`, e **tutte le altre 33 entry byte-identiche**
all'originale.

**⚠️ Gotcha verificato**: riusando l'oggetto `ZipInfo` dell'entry sorgente per riscriverla
nell'archivio di destinazione, l'`header_offset` originale si porta dietro e l'archivio risulta
illeggibile (`BadZipFile: Overlapped entries … possible zip bomb`). Va creato un `ZipInfo` nuovo
copiando solo `filename`, `date_time`, `compress_type`, `external_attr`. L'equivalente in JS (JSZip
/ fflate) è ricostruire l'entry invece di clonare l'header.

**Alternatives considered**: patch via Power Platform CLI (`pac solution`) — richiede un binario
esterno, fuori dal modello PPTB (tool web self-contained); unpack/repack con `pac solution unpack`
— normalizza i file e produce un package diverso dall'export, rischio di differenze non volute.

---

## §10 — Export managed e unmanaged: due artefatti per operazione

**Status**: ✅ **Verificato sul campo**. Stessa solution `testAgentTool` v1.0.0.2, due chiamate
`ExportSolution` consecutive il 2026-10-15, una con `Managed: true` e una con `Managed: false`.

### Il principio preso dalle pipeline

La documentazione delle Power Platform Pipelines descrive l'artefatto come una **coppia**:

> *"Once the managed **and unmanaged** solution artifacts are exported, the system stores them in
> the pipelines host and prohibits any tampering or modification. The same managed artifact, per
> version, will be deployed to all subsequent stages in the pipeline in sequential order."*
> — [Extend pipelines in Power Platform](https://learn.microsoft.com/power-platform/alm/extend-pipelines)

**Decision**: ogni operazione di packaging produce un **artifact set**: entrambi gli artefatti
(managed e unmanaged) patchati allo stesso modo, nella stessa cartella di operazione, con un
`manifest.json` che li descrive. Il tool assume il ruolo che nelle pipeline ha il *pipelines host*:
è lui a produrre e conservare gli artefatti.

**Rationale**: la pipeline nativa conserva entrambi perché servono a due scopi diversi — il managed
si distribuisce, l'unmanaged è la fotografia della sorgente (source control, ripristino in un
environment di sviluppo o di build). La stessa coppia serve qui, con in più il patch del display
name che la pipeline non sa fare e **non consente di fare**: il *pipelines host* proibisce
esplicitamente la modifica dell'artefatto, e i gated extension (`OnDeploymentRequested`,
pre-export, pre-deployment) possono solo approvare o bloccare uno step, mai sostituire lo zip.

### Differenza misurata tra i due export

| | Unmanaged | Managed |
|---|---|---|
| Entry nell'archivio | 34 | 34 |
| Entry presenti in uno solo dei due | nessuna | nessuna |
| Entry con contenuto diverso | **`solution.xml`** e basta | |
| `solution.xml` → `<Managed>` | `0` | `1` |
| `bots/ava_agenteTool1/bot.xml` → `<name>` | `agenteTool1 [DEV]` | identico |

**Conseguenza pratica**: lo **stesso codice di patch** vale per entrambi gli archivi. Non serve
logica separata.

**⚠️ Tentazione da non seguire**: su questa solution i due export differiscono *solo* per il flag
`<Managed>`, quindi sembrerebbe possibile fare un solo export e derivare l'altro flippando il flag.
**Non va fatto.** L'equivalenza vale per una solution che contiene solo bot e definizioni di
environment variable; appena entrano tabelle, form, grafici o managed property, l'export managed
smette di essere l'unmanaged con un flag diverso. Il tool esegue **due `ExportSolution` distinti** e
patcha ciascun archivio in modo indipendente (FR-084).

### Costo

Due export invece di uno: tempo di esportazione raddoppiato e doppio rischio di timeout sulle
solution grandi (`ExportSolution` è sincrono, vedi plan §Constraints). Sullo zip di test
(~31 KB ciascuno) è irrilevante; va misurato su una solution reale.

---

## §11 — Da dove arriva il nome su Teams e M365 Copilot

**Status**: ✅ **Verificato sul campo** su dati reali del tenant (DEV `org0d6fa303`, UAT
`org0196e755`, 2026-10-15). Risolve la domanda lasciata aperta da §5 e smentisce il presupposto su
cui era costruita FR-008.

### 1. `applicationmanifestinformation` non contiene nessun nome

Letto il campo sull'agent `ava_agenteTool1` in DEV e in UAT. Contiene **solo identificativi**:

```json
{
  "$kind": "ApplicationDetails",
  "teams":        { "version": "1.0.3", "botChannelRegistrationAppId": "f49aa664-…" },
  "microsoft365": { "titleId": "T_12f8f02b-…", "shareLink": "https://m365.cloud.microsoft/chat/?titleId=…",
                    "appId": "2050e30f-…" },
  "copilotChat":  { "isEnabled": true }
}
```

**Conseguenza**: il disegno originale (§5, FR-008) prevedeva di "aggiornare il manifest Teams"
riscrivendo questo campo. **Non c'è niente da riscrivere**: nessun nome, nessun `name.short`. Il
requisito era costruito su un presupposto sbagliato.

### 2. Le identità dei canali sono per ambiente

| | DEV | UAT |
|---|---|---|
| `teams.botChannelRegistrationAppId` | `f49aa664-b7f2-4b99-bf80-e6f3adba670b` | `b2f61a26-38ab-414c-8238-e14144f7a0d1` |
| `microsoft365.appId` | `2050e30f-4e67-4a08-a62c-cddcc5eae6b8` | `5e6c9f29-a499-4153-bda6-b02bb8078a39` |
| `microsoft365.titleId` | `T_12f8f02b-…` | `T_df43ef44-…` |

App id completamente diversi: ogni environment provvede la propria registrazione al momento del
publish. Niente di tutto ciò viaggia nel solution package — coerente con §9.

### 3. Il nome del canale è generato da `bot.name`

Confronto tra `bot.name` e il `displayName` del service principal della registrazione Teams
(Microsoft Graph, `servicePrincipals?$filter=appId eq '…'`), su tutti i 12 agent di DEV che hanno
una registrazione:

```text
UGUALE  | 'agenteTool1 [DEV]'       UGUALE | 'Aria - IT Helpdesk'
UGUALE  | 'CardCopilot'             UGUALE | 'TestMeetingOrchestrator'
UGUALE  | 'Alpha – Deploy Only'     UGUALE | 'Agente VincRequest'
UGUALE  | 'Beta – Deploy + Pin'     UGUALE | 'Nexora Bot'
UGUALE  | 'ElectroHubTechGuide'     UGUALE | 'test no channel agent'
UGUALE  | 'Agent Rename - DEV'
DIVERSO | bot.name='🤖 SMARTTABLE AI ORCHESTRATOR' | canale='Agent' | pubblicato 2026-05-03

coincidono: 11 | divergono: 1
```

Il displayName del service principal è `{bot.name} (Microsoft Copilot Studio)`.

**Decision**: il nome sui canali è una **fotografia di `bot.name` scattata al publish**, per
environment. Quindi **patchare `<name>` in `bot.xml` copre anche Teams e M365 Copilot**, a
condizione che l'agent venga pubblicato nell'ambiente di destinazione — cosa che
`publishOnImport: true` fa automaticamente all'import (§9).

**L'unico caso divergente conferma la regola**: quell'agent è stato pubblicato a maggio e rinominato
dopo, senza ripubblicare. Il nome sul canale è rimasto quello vecchio. Rename senza publish = nome
del canale fermo.

### 4. Conseguenza: i due meccanismi sono alternativi, non complementari

Se `bot.name` contiene già ` [UAT]` **e** si configura anche il *Channel display name suffix*
nativo, su Teams i due si sommano: `agenteTool1 [UAT] (UAT)`. L'opzione di scrivere il
`<defaultvalue>` della environment variable nel package (FR-072 della prima stesura) è stata quindi
**eliminata**: un solo meccanismo, quello del package.

### Non verificato

- **Dove viene memorizzato il *Channel display name suffix* nativo** quando è configurato: nessun
  agent del tenant lo usa, e sulla tabella `bot` non esiste una colonna dedicata (69 colonne, nessun
  match su *suffix* / *display* / *channel*). Candidato: la colonna `configuration`, che in UAT
  espone `channels[].displayName` (valorizzato a `null` su tutti gli agent esaminati). Da
  confermare su un agent che abbia la feature attiva, prima di implementarne il rilevamento.
- **Comportamento oltre i 30 caratteri**: il manifest Teams limita `name.short` a 30 caratteri, ma
  nel tenant non esiste un agent con nome lungo e canale allineato su cui misurare se il nome venga
  troncato. L'avviso preventivo resta (FR-019), dichiarato come non verificato.

---

## §12 — Cosa viaggia davvero nel package, e il publish all'import

**Status**: ✅ **Misurato** sulle solution reali dell'environment DEV, 2026-10-15.

### Il package è la solution intera, non l'agent

Il tool fa scegliere l'agent, ma l'artefatto prodotto contiene **tutta la solution**. Power Platform
non consente un deploy parziale: non è un limite del tool. Composizione misurata via
`solutioncomponents`:

| Solution | Componenti | Oltre all'agent |
|---|---|---|
| **testAgentTool** | 16 | nulla — 1 agent + 14 agent component + 1 env variable |
| AgentRenameTool | 23 | 1 cloud flow, 3 env variable |
| NexoraAgentPlatform | 38 | 3 cloud flow, 3 tabelle |
| **SigmaMonitoringAgent** | 40 | 2 cloud flow, 1 connection reference, 1 security role |
| FactoryHub | 65 | nessun agent — 43 tabelle, 5 cloud flow, 1 canvas app |

**Decision**: il tool non può spezzare la solution, ma **può togliere la sorpresa**: l'anteprima
mostra sempre l'inventario del package e chiede conferma esplicita quando contiene componenti
diversi dall'agent selezionato e dai suoi agent component (FR-091).

**Rationale** — la regola è di Microsoft, e descrive esattamente il rischio:

> *"Don't add components to the solution that aren't new or changed components. When your update is
> imported to the target environment, a solution with unintended components can cause unexpected
> behavior to the existing components that now lay below the layer you introduced with your solution
> update."*
> — [Use table segmentation in solutions](https://learn.microsoft.com/power-platform/alm/segmented-solutions-alm)

**Best practice conseguente**: una solution dedicata per agent, come `testAgentTool`. Dove non è
possibile, il packaging va fatto da uno stato validato, non da un DEV a metà lavoro.

### `componenttype`: valori misurati

> **⚠️ Due enum diversi, da non confondere.** `solutioncomponent.componenttype` (livello
> solution) e `botcomponent.componenttype` (livello interno dell'agent) sono **enumerazioni
> distinte**. I valori qui sotto sono di `solutioncomponent`. Nel package, invece,
> `botcomponent.xml` → `<componenttype>15</componenttype>` usa l'altro enum (15 = Custom GPT).
> Usare un valore dell'uno sull'altro restituisce **zero righe senza errore**.

**Valori di `solutioncomponent.componenttype`:**

| Valore | Componente | Come è stato ricavato |
|---|---|---|
| **10212** | **Agent (bot)** | `testAgentTool` ne ha esattamente 1, e contiene 1 agent; `FactoryHub`, che non ha agent, non ne ha nessuno |
| **10213** | **Agent component (botcomponent)** | `testAgentTool` ne ha 14, e il package contiene 14 cartelle `botcomponents/` (13 topic + 1 gpt) |
| 380 | Environment Variable Definition | già noto |
| 29 | Workflow / cloud flow | già noto |
| 372 | Connection Reference | già noto |

Corregge FR-025 e la Constitution («There is no documented `componenttype` value for Bot/Agent»):
per `solutioncomponent` i valori ora sono **misurati**, non indovinati, su due solution con e senza
agent. La cautela di fondo resta: misurato ≠ documentato, e si usano per **classificare**
l'inventario (FR-092), mai per **cercare** gli agent, che restano risolti dalla tabella `bot`
(FR-024).

### `publishOnImport`: presente solo su una parte degli agent

Distribuzione del campo nella colonna `configuration` dei 40 agent di DEV:

| Valore | Agent |
|---|---|
| `true` | 12 |
| `false` | 0 |
| **campo assente** | **28** |

**Non verificato**: il comportamento all'import quando il campo è assente. `publishOnImport` **non
compare nella documentazione Microsoft** (ricerca del 2026-10-15): è un campo reale del
`BotConfiguration` ma non documentato.

**Decision**: il campo è nel package (`bots/<schemaname>/configuration.json`), quindi è patchabile
come `<name>`. Il tool lo espone con **tre stati** — lascia com'è (default), forza `true`, forza
`false` — e NON lo tocca se non richiesto, così il package resta fedele alla sorgente (FR-090).
Quando il campo è assente il tool lo dichiara come "non specificato" e non promette un
comportamento che non può garantire.

---

## §13 — Export sincrono e asincrono: misure reali e strategia

**Status**: ✅ **Misurato** sull'environment DEV, 2026-10-15. Entrambi i percorsi eseguiti davvero,
non stimati.

### Il flusso asincrono (quello del portale)

```text
1. POST ExportSolutionAsync { SolutionName, Managed }  → AsyncOperationId + ExportJobId
2. GET  asyncoperations(<AsyncOperationId>)?$select=statecode,statuscode
                                                        → attendere statecode = 3, statuscode = 30
3. POST DownloadSolutionExportData { ExportJobId }     → ExportSolutionFile (base64)
```

Documentato in [Solution staging, with asynchronous import and export](https://learn.microsoft.com/power-platform/alm/solution-async).
Esiste per non andare in timeout sulle solution grandi. **Attenzione a `$select`**: chiedere una
colonna inesistente su `asyncoperations` (es. `friendlyname`) restituisce **HTTP 400**, non un campo
vuoto — errore incontrato e corretto durante la prova.

### Misure

**Sincrono** (`ExportSolution`), tempi per singola chiamata:

| Solution | Entry | Dimensione | Managed | Unmanaged | Coppia |
|---|---|---|---|---|---|
| testAgentTool | 34 | 32 KB | 7,31 s | 6,05 s | **13,4 s** |
| SigmaMonitoringAgent | 75 | 61 KB | 10,28 s | 7,30 s | **17,6 s** |
| FactoryHub | 12 | **976 KB** | **79,83 s** | 31,59 s | **111 s** |

**Asincrono**, su `testAgentTool` (la più piccola):

| Fase | Tempo |
|---|---|
| `ExportSolutionAsync` | 0,95 s |
| polling `asyncoperation` (53 letture, 2 s di intervallo) | **152,07 s** |
| `DownloadSolutionExportData` | 1,23 s |
| **totale** | **154,25 s** |

### Lettura dei dati

I 152 secondi **non dipendono dalla dimensione**: sono tempo di coda del job asincrono. Su una
solution da 32 KB l'asincrono è **oltre 20 volte più lento** del sincrono, e servendo due export
diventerebbero ~5 minuti per ogni packaging.

Il portale usa l'asincrono perché deve reggere la solution di qualunque cliente. Su queste solution
il sincrono regge: anche `FactoryHub`, la più pesante dell'environment, sta in 111 s per la coppia.

**Decision**: **sincrono come percorso primario, asincrono come fallback automatico** (FR-093). Si
prende la velocità del primo e la robustezza del secondo, senza chiedere nulla all'utente.

**Alternatives considered**: solo asincrono, come il portale — scartata, ~5 minuti per ogni
packaging anche sul caso minimo; solo sincrono — scartata, su una solution molto più grande di
`FactoryHub` il packaging fallirebbe senza piano B.

### Equivalenza dei due percorsi

L'export asincrono di `testAgentTool` managed pesa **32.544 byte**, esattamente quanto il sincrono
della stessa solution: stesso contenuto, stesso numero di entry (34), archivio valido. Il fallback
non produce un artefatto diverso.

### Nota: il rezip cambia la dimensione del file, non il contenuto

Il package riconfezionato dal tool pesa **31.469 byte** contro i 32.544 dell'export originale, pur
avendo le stesse 34 entry con lo stesso contenuto (33 byte-identiche, 1 patchata). La differenza è
solo il compressore. **Conseguenza**: la verifica di FR-070 confronta le entry una per una, **mai
la dimensione del file** — un confronto sulle dimensioni darebbe un falso allarme a ogni esecuzione.

---

## §14 — Rilevare il cambio di formato: dove compare il nome, e l'impronta del package

**Status**: ✅ **Misurato** sul package reale di `testAgentTool` (export del 2026-10-15).
Risponde alla zona grigia di supportabilità: il formato interno del package non è un contratto
documentato, quindi il tool deve accorgersi da solo se cambia.

### Dove compare il nome dentro il package

Scansione di tutte le 34 entry:

| Cosa si cerca | Occorrenze |
|---|---|
| **Display name esatto** `agenteTool1 [DEV]` | **1 sola**, in `bots/ava_agenteTool1/bot.xml` → `<name>` |
| Nome base `agenteTool1` come testo di elemento XML | 2: `bot.xml` → `<name>`, e `botcomponents/ava_agenteTool1.gpt.default/botcomponent.xml` → `<name>` |
| Schemaname `ava_agenteTool1` | **31 entry su 34** |

Tre conclusioni operative:

1. **Il display name sta in un punto solo.** Un controllo che lo cerchi come *testo esatto di un
   elemento* ha **rumore zero**: si aspetta 1 occorrenza e ne trova 1.
2. **Lo schemaname è ovunque** (31/34). È la prova numerica del perché un rename "cerca e
   sostituisci" sul package distrugge la solution (cfr. §9, anti-pattern).
3. **Occorrenza nota e volutamente non patchata**: `botcomponents/<schema>.gpt.default/botcomponent.xml`
   → `<name>` contiene il **nome base senza suffisso**. È il nome del *componente*, non il display
   name dell'agent, e non viene mostrato come nome dell'agent in nessun canale. Il tool non lo
   tocca, ma **deve conoscerlo** per non segnalarlo come anomalia quando il suffisso è vuoto e
   display name e nome base coincidono.

### Lo scenario pericoloso

Non è che `<name>` sparisca: in quel caso il tool si ferma e lo dice (FR-069). È che Microsoft
aggiunga **un secondo posto** che contiene il display name. Il patch continuerebbe a riuscire,
ma sarebbe **incompleto e silenzioso**. Il controllo sulle occorrenze è la rete che intercetta
esattamente questo caso (FR-096).

### L'impronta del formato

`solution.xml` porta già i timbri di versione della piattaforma, che cambiano a ogni aggiornamento
di Dataverse:

```xml
<ImportExportXml version="9.2.26091.167" SolutionPackageVersion="9.2"
                 OrganizationVersion="9.2.26091.167"
                 CRMServerServiceabilityVersion="9.2.26092.00158">
```

**Baseline verificata il 2026-10-15** — da distribuire insieme al tool e da confrontare a ogni
export (FR-097, FR-098):

| Elemento dell'impronta | Valore osservato |
|---|---|
| `SolutionPackageVersion` | `9.2` |
| Cartelle di primo livello | `bots/`, `botcomponents/`, `environmentvariabledefinitions/` + `solution.xml`, `customizations.xml`, `[Content_Types].xml` |
| Elementi in `bot.xml` | `authenticationmode`, `authenticationtrigger`, `iconbase64`, `iscustomizable`, `language`, **`name`**, `runtimeprovider`, `template`, `timezoneruleversionnumber` |
| Attributo radice di `bot.xml` | `schemaname` |
| Chiavi di `configuration.json` | `$kind`, `channels`, `settings`, `isAgentConnectable`, `publishOnImport`, `gPTSettings`, `isLightweightBot`, `aISettings`, `recognizer`, `deferredProvisioning` |
| Elementi in `botcomponent.xml` | `componenttype`, `iscustomizable`, `name`, `parentbotid`, `statecode`, `statuscode` |

**Decision**: il confronto si fa **sia** con la baseline distribuita col tool **sia** con l'ultimo
packaging della stessa solution (registrato nel manifest). La prima copre la prima esecuzione su un
ambiente già cambiato; il secondo evita di risegnalare uno scostamento già visto e accettato.

**Severità differenziata** (FR-096, FR-097):

| Rilevamento | Comportamento |
|---|---|
| `<name>` assente o formato non riconosciuto | **Blocco** (FR-069) |
| Display name trovato in un punto non noto | **Blocco con conferma esplicita** per procedere |
| Elemento/chiave nuova, o timbri di versione cambiati | **Avviso non bloccante** |

Il terzo caso è volutamente non bloccante: Dataverse si aggiorna di continuo e i timbri di versione
cambiano da soli. Bloccare su quello renderebbe il tool inutilizzabile.

### Quello che questa rete non risolve

La supportabilità formale. Se si apre un ticket a Microsoft su un environment in cui è stato
importato un package modificato, la risposta può essere "non supportato". La mitigazione non è
tecnica ma procedurale: il `manifest.json` dice esattamente che cosa è stato toccato (un solo
elemento, con hash dei file), e `source_managed.zip` resta intatto nell'artifact set, quindi è
sempre possibile reimportare l'export originale e riprodurre il problema senza il patch.

---

## §15 — Dipendenze del rename e scelta della strada

**Status**: ✅ **Verificato** sull'agent `ava_agenteTool1` in DEV, 2026-10-15.

### Il display name non ha dipendenze

`GET RetrieveDependentComponents(ObjectId=<botid>,ComponentType=10212)` → 14 dipendenze, tutte di
tipo 10213 (i componenti dell'agent). Struttura di una riga:

```text
requiredcomponentobjectid     d00083e0-0cc8-f111-aaaf-0022480b86a9   ← GUID
requiredcomponenttype         10212
dependentcomponentobjectid    1fec58ae-9e31-4673-99f3-3b87b333cad0   ← GUID
dependentcomponenttype        10213
dependencytype                2
campi contenenti un NOME:     NESSUNO
```

`RetrieveRequiredComponents` sullo stesso agent: **vuoto**.

**Decision**: il display name **non è una chiave**. Le dipendenze si reggono esclusivamente su
GUID e `componenttype`; l'identità del componente è `botid` + `schemaname`, che il tool non tocca
mai (FR-069, FR-101). Ne discende che **rinominare non può rompere alcuna dipendenza** — è una
proprietà dimostrata, non un'assunzione.

### Che cosa fa davvero una pipeline DevOps

Il pattern documentato è export → `pac solution unpack` → source control → `pac solution pack` →
import. Ma le modifiche si fanno **nell'ambiente**, non nei file: il round-trip serve a versionare,
non a editare. Microsoft lo dice esplicitamente:

> *"Except for the sections described in When to edit the customizations file, **manual editing of
> extracted component files and .zip files isn't supported**."*
> — [Source control with solution files](https://learn.microsoft.com/power-platform/alm/use-source-control-solution-files)

E le eccezioni ammesse stanno tutte dentro `customizations.xml`: ribbon, SiteMap, FormXml, viste
salvate, ISV.config ([When to edit the customizations file](https://learn.microsoft.com/power-platform/alm/when-edit-customization-file)).
`bot.xml` **non è tra quelle**.

### L'alternativa formalmente ineccepibile: build environment

```text
DEV    → export unmanaged                       (DEV non viene mai toccata)
  ↓
BUILD  → import unmanaged
         rinomina l'agent  → export MANAGED     → artefatto per il target
         (ripetuto per ogni ambiente di destinazione)
  ↓
UAT / PROD → import managed
```

Nessun file aperto né riscritto: solo `ExportSolution`, `ImportSolution` e un `Update` su `bot` in
un environment in cui la solution è **unmanaged**, dove il rename è una normale personalizzazione e
non crea alcun layer.

**Costo**: un environment aggiuntivo da gestire, e un ciclo import + rinomina + export (~2 minuti)
per ogni ambiente di destinazione, contro i ~13 secondi del patch del package.

**Varianti valutate**: usare **UAT** come build environment — da escludere, lì la solution è già
managed e importarvi la versione unmanaged ricreerebbe l'unmanaged layer; usare **DEV** con
rinomina e ripristino immediato — praticabile e senza environment aggiuntivi, ma lascia una
finestra di ~2 minuti in cui DEV mostra il nome di un altro ambiente.

### Decisione

**Si procede con il patch del package** (decisione dell'utente, 2026-10-15). La modalità build
environment è stata valutata e scartata per costo operativo; resta documentata qui, pronta da
riprendere se una policy interna o un cliente richiedesse la conformità formale.

La frase "not supported" è stata posta prima della scelta e accettata consapevolmente, su tre basi
verificate: nessuna dipendenza può rompersi (sopra); viene modificato **un solo elemento**,
verificabile entry per entry (§9, §14); l'export originale resta nell'artifact set, quindi ogni
problema è riproducibile senza il patch (§10). Il tool deve dichiararlo apertamente, nella
documentazione e nel `manifest.json` (FR-102).
