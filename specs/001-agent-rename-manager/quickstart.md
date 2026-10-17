# Quickstart Validation Guide: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14 | **Revisione**: 2026-10-15 (packaging)

Scenari di validazione manuale end-to-end del tool. Ogni scenario è indipendente e verificabile.

> **Revisione 2026-10-15.** Gli scenari della v1 validavano il rename live su Dataverse. Il tool non
> scrive più su Dataverse (FR-067): si valida il **package prodotto**. Il criterio che conta più di
> ogni altro è **V8**: dopo l'import, Solution Layers deve mostrare solo il layer managed.

---

## Prerequisiti

- PPTB installato con il tool caricato
- Connessione a un environment **DEV** con una solution **unmanaged** che contiene almeno un agent
  Copilot Studio (riferimento di test: `testAgentTool` v1.0.0.2, publisher `Avanade`, prefix `ava`,
  agent `ava_agenteTool1`)
- Ruolo **System Customizer** o superiore sull'environment sorgente
- Per gli scenari di deploy (fase 2): una seconda connessione a un environment **UAT**
- Uno strumento per ispezionare gli zip (Esplora risorse, 7-Zip, `unzip -l`)

---

## Scenario V1 — Selezione della solution sorgente

**Obiettivo**: la lista mostra solo solution utilizzabili e segnala quelle che non lo sono.

1. Aprire il tool connesso a DEV
2. Verificare che la lista mostri le solution con almeno un agent, con conteggio, versione,
   publisher e prefix
3. Selezionare una solution **managed**

**Atteso**:
- ✅ La solution managed è segnalata come **non esportabile**, con la spiegazione ("You can't export
  managed solutions") e l'indicazione di operare nell'environment in cui è unmanaged (FR-068)
- ✅ Nessun tentativo di export viene eseguito

4. Selezionare `testAgentTool` (unmanaged) e aprirne il dettaglio

**Atteso**:
- ✅ L'agent `agenteTool1` compare con stato, ultima pubblicazione e date
- ✅ La environment variable `ava_AgentSuffix_testAgentTool` è segnalata come candidata per il
  *Channel display name suffix* nativo, con la precisazione che riguarda **solo Teams e M365
  Copilot** (FR-072, FR-079)

---

## Scenario V2 — Export doppio e lettura del package

**Obiettivo**: l'operazione esporta **due** archivi (managed e unmanaged) e ne mostra il contenuto
reale.

1. Selezionata la solution, avviare il packaging
2. Osservare il riepilogo dei package ricevuti

**Atteso**:
- ✅ Sono state eseguite **due** chiamate `ExportSolution`, una con `Managed: true` e una con
  `Managed: false` (FR-084) — nessuna "conversione" di un archivio nell'altro
- ✅ Nome univoco, versione, publisher e prefix corrispondono alla solution selezionata
- ✅ Il numero di entry è mostrato per entrambi (riferimento: 34 ciascuno per `testAgentTool`)
- ✅ `solution.xml` riporta `<Managed>1</Managed>` nel primo e `<Managed>0</Managed>` nel secondo
- ✅ Gli agent trovati nel package sono elencati con `schemaName` e nome attuale
  (`ava_agenteTool1` → `agenteTool1 [DEV]`)
- ✅ Il tool segnala `publishOnImport: true` e i canali `MsTeams`, `Microsoft365Copilot` (FR-080)

---

## Scenario V3 — Patch Plan: cosa viene toccato e cosa no

**Obiettivo**: prima di scrivere, l'utente vede esattamente cosa cambia.

1. Inserire il suffisso `UAT`
2. Osservare l'anteprima del patch

**Atteso**:
- ✅ Riga di patch: `bots/ava_agenteTool1/bot.xml` → elemento `name` →
  `agenteTool1 [DEV]` → `agenteTool1 [UAT]`, stato `suffix-changed` (FR-075)
- ✅ L'elenco di ciò che **non** viene toccato è visibile ed esplicito: `schemaname`, nomi di
  cartella, nomi di file, GUID, `[Content_Types].xml`, `customizations.xml` (FR-069)
- ✅ Nessun file è ancora stato scritto

3. Svuotare il campo suffisso

**Atteso**:
- ✅ Stato `suffix-removed`, nome risultante `agenteTool1` (FR-071)

---

## Scenario V4 — Idempotenza del packaging

**Obiettivo**: rieseguire il packaging non accoda suffissi.

1. Eseguire il packaging con suffisso `UAT` → zip prodotto
2. Eseguire di nuovo il packaging con suffisso `UAT` sulla stessa solution

**Atteso**:
- ✅ Il nome risultante è `agenteTool1 [UAT]`, **mai** `agenteTool1 [DEV] [UAT]` né
  `agenteTool1 [UAT] [UAT]` (FR-071, SC-002)
- ✅ Lo stato mostrato è `no-change` se il package sorgente portava già quel suffisso

3. Eseguire il packaging con suffisso `PROD` subito dopo

**Atteso**:
- ✅ Nome risultante `agenteTool1 [PROD]` — il suffisso precedente viene sostituito, non accodato

---

## Scenario V5 — Artifact set prodotto: verifica del contenuto

**Obiettivo**: ogni archivio patchato differisce dal proprio originale **solo** nel punto previsto.
È il criterio SC-008.

1. Completare un packaging con suffisso `UAT`, conservando gli originali
2. Aprire la cartella dell'operazione

**Atteso** — struttura (FR-083):
```text
testAgentTool_1.0.0.2_UAT_<timestamp>/
├── manifest.json
├── testAgentTool_1_0_0_2_managed_UAT.zip      ← da importare in UAT/PROD
├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    ← source control / sviluppo
├── source_managed.zip
└── source_unmanaged.zip
```

**Atteso** — contenuto, da verificare su **entrambi** gli archivi patchati:
- ✅ Stesso numero di entry del rispettivo originale (riferimento: 34)
- ✅ `bots/ava_agenteTool1/bot.xml` contiene `<name>agenteTool1 [UAT]</name>`
- ✅ Nella stessa riga, `<bot schemaname="ava_agenteTool1">` è **invariato**
- ✅ Nessuna cartella e nessun file è stato rinominato
- ✅ Tutte le altre entry sono byte-identiche all'originale corrispondente — il tool lo dichiara
  per archivio (riferimento misurato: 33 su 34) (FR-070, FR-085, SC-008)
- ✅ `<Managed>` resta `1` nel managed e `0` nell'unmanaged: il patch non tocca quel flag

---

## Scenario V6 — Verifica post-scrittura

**Obiettivo**: uno zip che non supera i controlli non viene consegnato come valido.

1. Completare un packaging
2. Osservare il blocco di verifica nell'esito

**Atteso**:
- ✅ Archivio riapribile, numero di entry corrispondente, valori patchati riletti e confermati
  (FR-077)
- ✅ Se una sola verifica fallisce, il tool lo dichiara, non presenta lo zip come utilizzabile, e
  ricorda che il package originale resta importabile

> **Nota implementativa da non perdere**: ricostruendo l'archivio le entry vanno **ricreate**. Se si
> clona l'header dell'entry sorgente, l'offset originale viene ereditato e l'archivio risulta
> illeggibile (`Overlapped entries … possible zip bomb`). Vedi research §9.

---

## Scenario V7 — La versione si alza in DEV, e nessuna scrittura sulla environment variable

**Obiettivo**: la versione si alza **nella solution di DEV** prima dell'export (come fa il portale), e
il package porta quella; la environment variable non viene mai scritta.

1. Lasciare attiva **Raise the version in DEV** (la proposta è `1.0.0.3`) ed eseguire il packaging

**Atteso**:
- ✅ In DEV la solution passa da `1.0.0.2` a `1.0.0.3` **prima** dell'export (FR-073, FR-067a)
- ✅ `solution.xml` nel package → `<Version>1.0.0.3</Version>`: lo scrive DEV, il tool non lo patcha
- ✅ La revisione dice che la versione verrà scritta in DEV; il manifest registra `versionChange`
- ✅ Il tool spiega la differenza tra *update* (stessa versione) e *upgrade* (versione superiore), e che
  solo l'Upgrade rimuove gli agent cancellati nell'origine
- ✅ Con l'opzione disattivata non c'è alcuna scrittura e il package porta la versione che DEV ha già
- ✅ Una versione non valida o non più alta di quella di DEV blocca il pulsante e dice perché
- ✅ Tornare indietro e rifare il packaging NON alza la versione una seconda volta

2. Qualunque sia l'opzione scelta, ispezionare
   `environmentvariabledefinitions/ava_AgentSuffix_testAgentTool/environmentvariabledefinition.xml`

**Atteso**:
- ✅ Il file è **byte-identico** all'originale: nessun `<defaultvalue>` aggiunto, nessuna modifica
  (FR-089)
- ✅ Nell'interfaccia **non esiste** un'opzione per allinearlo: il nome sui canali deriva già da
  `bot.name`, quindi un suffisso nativo si sommerebbe a quello del nome
- ✅ Se l'agent ha il *Channel display name suffix* nativo configurato, il tool mostra un avviso sul
  rischio di doppio suffisso (`agenteTool1 [UAT] (UAT)`), senza bloccare (FR-089)

---

## Scenario V8 — Import nel target: nessun unmanaged layer 🎯

**Obiettivo**: è il criterio che giustifica l'intera revisione (SC-007). Da eseguire a mano, anche
prima che la fase 2 sia implementata.

**Precondizione**: in UAT l'agent **non** deve avere customizations attive. Se le ha (da un rename
manuale precedente), rimuoverle: *Solution Layers → Remove active customizations*.

1. Importare in UAT, dal portale o dalla fase 2 del tool, **il solo file con `role: "deploy"`**
   (`testAgentTool_1_0_0_2_managed_UAT.zip`) — mai quello unmanaged (FR-087)
2. Attendere il completamento dell'import
3. Aprire Copilot Studio in UAT
4. Aprire *Solutions → testAgentTool → Agents → agenteTool1 → Solution Layers*

**Atteso**:
- ✅ Il nome dell'agent è `agenteTool1 [UAT]`
- ✅ Solution Layers mostra **un solo layer**: la solution `testAgentTool`, publisher `Avanade`
- ✅ **Nessun "Unmanaged layer"**, nessun *Default Publisher*, nessun "Remove active customizations"
  da fare (SC-007)
- ✅ L'agent è lo stesso di prima, **non un duplicato**: lo `schemaname` non è cambiato (SC-009)
- ✅ Con `publishOnImport: true`, il nome è attivo senza publish manuale (FR-080)

**Se compare un unmanaged layer**: qualcosa ha scritto su Dataverse. Non è il package — il package
non può creare layer. Verificare che nessuna parte del tool stia ancora eseguendo `UPDATE` su `bot`
(FR-067, SC-010).

---

## Scenario V9 — Teams e M365 Copilot 🎯

**Obiettivo**: verificare che il nome patchato arrivi **anche sui canali**, senza nessun passaggio
aggiuntivo. È il criterio SC-012.

**Contesto verificato** (research §11): il nome sui canali è una copia di `bot.name` scattata al
publish, in ciascun environment. Il manifest non viaggia nel package e non contiene alcun nome.

1. Dopo l'import in UAT (scenario V8), verificare che l'agent risulti pubblicato
2. Aprire l'agent nel canale Teams in UAT

**Atteso**:
- ✅ Su Teams l'agent si chiama `agenteTool1 [UAT]`, come in Copilot Studio (SC-012)
- ✅ **Nessun suffisso doppio**: niente `agenteTool1 [UAT] (UAT)`
- ✅ Nessun intervento manuale è stato necessario: `publishOnImport: true` ha pubblicato all'import
  (FR-080)

3. Controprova sul meccanismo — verificare l'identità del canale senza toccare nulla:

```text
bot.applicationmanifestinformation → teams.botChannelRegistrationAppId
Microsoft Graph: servicePrincipals?$filter=appId eq '<quell-id>'&$select=displayName
```

**Atteso**:
- ✅ Il `displayName` del service principal è `agenteTool1 [UAT] (Microsoft Copilot Studio)`
- ✅ L'app id in UAT è **diverso** da quello in DEV: ogni environment ha la propria registrazione

4. Caso negativo da conoscere: se l'agent ha `publishOnImport: false`, oppure viene rinominato senza
   ripubblicare

**Atteso**:
- ✅ Il nome cambia in Copilot Studio ma **resta quello vecchio sui canali**, finché non si
  pubblica. È il comportamento osservato sull'unico agent del tenant con nome e canale divergenti
  (research §11). Il tool DEVE avvisarlo in modo prominente (FR-080)

---

## Scenario V10 — Nome oltre i 30 caratteri

**Obiettivo**: l'avviso informa, non blocca.

1. Scegliere un agent con nome lungo e applicare un suffisso che porti il totale oltre 30 caratteri

**Atteso**:
- ✅ Avviso visibile con il conteggio dei caratteri e la spiegazione che il limite riguarda il
  manifest Teams, il cui nome deriva da `bot.name` (FR-019, FR-079)
- ✅ L'avviso **non blocca** il packaging
- ⚠️ **Comportamento non verificato**: nel tenant non esiste un agent con nome lungo e canale
  allineato su cui misurare se Teams tronchi il nome. Se questo scenario viene eseguito su un agent
  reale, annotare che cosa compare davvero sul canale e aggiornare research §11

---

## Scenario V11 — Manifest, History e tracciabilità

**Obiettivo**: a posteriori si deve poter dire **quale file è stato importato dove**, anche quando
due artefatti hanno la stessa `<Version>`. È il criterio SC-011.

1. Eseguire due packaging dalla stessa versione, uno con suffisso `UAT` e uno con `PROD`
2. Aprire i due `manifest.json`
3. Aprire **History**

**Atteso**:
- ✅ Due cartelle di operazione distinte, con timestamp nel nome
- ✅ I due `manifest.json` riportano lo stesso `source.version` (`1.0.0.2`) ma **suffisso e hash
  SHA-256 diversi** per ogni file (FR-086)
- ✅ Ogni file è descritto con `role` (`deploy` / `source` / `restore`), `managed`, `patched`,
  `entryCount`, `sha256` ed esito della verifica
- ✅ L'artefatto `role: "source"` (unmanaged patchato) è etichettato come **non destinato a
  UAT/PROD** (FR-087)
- ✅ History mostra due voci con data/ora, environment sorgente, solution, versione, suffisso, agent
  `prima → dopo`, percorso della cartella ed esito per archivio
- ✅ Nessuna voce propone un "rollback": non c'è nulla da annullare, l'environment sorgente non è
  mai stato toccato (FR-078)
- ✅ Lo spazio occupato dall'artifact set è mostrato, e la cancellazione della voce elimina anche
  la cartella (FR-088)

---

## Scenario V12 — Nessuna scrittura su Dataverse

**Obiettivo**: verificare SC-010 — il criterio che impedisce la regressione.

1. Eseguire un packaging completo con tutte le opzioni attive
2. Ispezionare il log delle chiamate del tool

**Atteso**:
- ✅ Le uniche chiamate sono letture (`GET`) e `ExportSolution`
- ✅ **Zero** `PATCH`, `POST` o `DELETE` su `bots`, `botcomponents`,
  `environmentvariabledefinitions`, `environmentvariablevalues` (FR-067, SC-010)
- ✅ In UAT, il nome dell'agent prima dell'import è invariato rispetto a prima del packaging

---

## Scenario V13 — headless `package` via MCP

**Obiettivo**: l'interfaccia headless produce lo zip senza UI.

1. Invocare `invokeHeadless` con `{"operation": "inspectPackage", "solutionUniqueName": "testAgentTool", "managed": true}`
2. Invocare `{"operation": "previewPatch", …, "suffix": "UAT"}`
3. Invocare `{"operation": "package", …, "suffix": "UAT", "outputDirectory": "…"}`

**Atteso**:
- ✅ `inspectPackage` restituisce agent, `publishOnImport`, canali e `suffixVariable` senza scrivere
  file
- ✅ `previewPatch` restituisce le `changes` e il conteggio delle entry intatte
- ✅ `package` restituisce l'`artifactSet` completo: `folderPath`, `manifestPath`, `totalBytes` e
  l'elenco dei file con `role`, `sha256` e `verification`
- ✅ `deploy` **non** è disponibile in headless (modifica un environment)

---

## Scenario V14 — Inventario del package: cosa viaggia oltre all'agent

**Obiettivo**: l'artefatto è la **solution intera**. Nessuno deve scoprirlo a valle. È il criterio
SC-013.

1. Eseguire il packaging su **`testAgentTool`** (solution agent-only, 16 componenti)

**Atteso**:
- ✅ L'anteprima mostra l'inventario completo: 1 Agent, 14 Agent component, 1 Environment variable
- ✅ Nessuna conferma aggiuntiva è richiesta per i componenti dell'agent; la environment variable,
  che non appartiene all'agent, compare marcata come tale (FR-091)

2. Eseguire il packaging su **`SigmaMonitoringAgent`** (40 componenti)

**Atteso**:
- ✅ L'inventario elenca anche **2 cloud flow, 1 connection reference, 1 security role**
- ✅ Il tool richiede una **conferma esplicita** prima di produrre l'artefatto, dicendo che
  all'import partiranno anche quei componenti (FR-091)
- ✅ Senza conferma non viene scritto nessun file

3. Verificare la classificazione dei tipi

**Atteso**:
- ✅ I componenti sono classificati con nomi leggibili; i `componenttype` non riconosciuti compaiono
  come "Sconosciuto" con il numero, **mai omessi** (FR-092)

---

## Scenario V15 — publishOnImport a tre stati

**Obiettivo**: il publish è settabile e, per default, il package resta fedele alla sorgente.

1. Eseguire il packaging lasciando l'opzione su **"lascia com'è"** (default)

**Atteso**:
- ✅ `bots/ava_agenteTool1/configuration.json` è **byte-identico** all'originale (FR-090)
- ✅ Il tool mostra comunque il valore trovato: per `agenteTool1` è `true`

2. Impostare **forza No** ed eseguire il packaging

**Atteso**:
- ✅ Nel package `publishOnImport` è `false`
- ✅ Compare l'avviso prominente: senza publish nell'ambiente di destinazione il nome cambia solo in
  Copilot Studio e **resta quello vecchio su Teams e M365** (FR-080)

3. Eseguire il packaging su un agent che **non ha** il campo (28 agent su 40 in DEV)

**Atteso**:
- ✅ Il tool dichiara **"non specificato"**, non `true` e non `false` (FR-090)
- ✅ Non viene promesso nessun comportamento: il default all'import non è documentato da Microsoft
- ✅ Con *forza Sì* o *forza No* il campo viene **aggiunto** al JSON, e la verifica post-scrittura
  lo conferma

---

## Scenario V16 — Strategia di export: sincrono con fallback

**Obiettivo**: l'export è veloce nel caso normale e non fallisce mai nel caso estremo.

**Tempi di riferimento misurati** (research §13), coppia managed+unmanaged:

| Solution | Dimensione | Attesa |
|---|---|---|
| testAgentTool | 32 KB | ~13 s |
| SigmaMonitoringAgent | 61 KB | ~18 s |
| FactoryHub | 976 KB | ~111 s |
| *fallback asincrono* | qualunque | *~154 s per archivio, di cui 152 s di coda* |

1. Eseguire il packaging su `testAgentTool`

**Atteso**:
- ✅ L'export usa il percorso **sincrono** e si completa in una manciata di secondi (FR-093)
- ✅ L'avanzamento mostra quale archivio è in corso e il tempo trascorso — nessuno spinner muto
  (FR-094)
- ✅ Il `manifest.json` riporta `"export": { "mode": "sync", "seconds": … }`

2. Eseguire il packaging su `FactoryHub` (976 KB)

**Atteso**:
- ✅ Si completa comunque in sincrono, intorno ai 111 s per la coppia
- ✅ L'interfaccia resta reattiva per tutta la durata

3. Provocare il fallback (solution molto grande, oppure simulando un timeout del sincrono)

**Atteso**:
- ✅ Il tool passa da solo al flusso asincrono, **senza chiedere nulla**, e lo dichiara mentre
  avviene: "l'export sta richiedendo più del previsto, passo alla modalità asincrona" (FR-093)
- ✅ Il polling interroga **solo** `statecode` e `statuscode`: chiedere una colonna inesistente su
  `asyncoperations` risponde **HTTP 400** (FR-094)
- ✅ Al termine l'archivio è equivalente a quello sincrono — verificato: 32.544 byte in entrambi i
  percorsi su `testAgentTool`
- ✅ Il `manifest.json` riporta `"mode": "async"`, così a posteriori si sa quale percorso è stato
  usato
- ✅ Se **entrambi** i percorsi falliscono, non viene prodotto nessun file e l'errore lo dice
  (`EXPORT_FAILED`)

---

## Scenario V17 — Rete di sicurezza sul formato del package 🎯

**Obiettivo**: il tool si accorge se Microsoft cambia la serializzazione degli agent, **prima** di
produrre un artefatto sbagliato. È il criterio SC-014.

### V17a — Occorrenze del nome (caso normale)

1. Eseguire il packaging su `testAgentTool` e aprire il dettaglio dei controlli

**Atteso**:
- ✅ Il display name `agenteTool1 [DEV]` risulta trovato in **una sola entry su 34**:
  `bots/ava_agenteTool1/bot.xml` → `<name>`, marcata `expected: true` (FR-096)
- ✅ Nessun blocco, nessuna conferma richiesta
- ✅ Lo schemaname `ava_agenteTool1`, presente in 31 entry su 34, **non** viene segnalato: il
  controllo cerca il display name come testo esatto di un elemento, mai come sottostringa

### V17b — Occorrenza del nome base con suffisso vuoto

1. Rinominare l'agent in DEV togliendo il suffisso (nome = `agenteTool1`), rifare il packaging

**Atteso**:
- ✅ Il nome compare ora in **due** punti: `bot.xml` → `<name>` e
  `botcomponents/ava_agenteTool1.gpt.default/botcomponent.xml` → `<name>`
- ✅ La seconda è riconosciuta come **occorrenza nota** (nome del componente, non display name) e
  **non** fa scattare il blocco (FR-096)
- ✅ Il tool dichiara comunque che quel punto **non viene patchato**

### V17c — Occorrenza in un punto sconosciuto (simulata)

1. Simulare un package in cui il display name compare in un'entry non prevista

**Atteso**:
- ✅ Il packaging si **ferma** e mostra l'elenco dei punti trovati con file e posizione (FR-096)
- ✅ Si può procedere **solo** dando una conferma esplicita, che viene registrata nel
  `manifest.json` (FR-100)
- ✅ Senza conferma non viene scritto nessun file

### V17d — Impronta del formato e scostamenti

1. Eseguire il packaging e confrontare l'impronta con la baseline

**Atteso**:
- ✅ L'impronta registra `SolutionPackageVersion`, i timbri di versione della piattaforma, le
  cartelle di primo livello, gli elementi di `bot.xml` e `botcomponent.xml`, le chiavi di
  `configuration.json` (FR-097)
- ✅ Il confronto avviene **sia** con la baseline distribuita col tool **sia** con l'ultimo
  packaging della stessa solution (FR-098)
- ✅ Dopo un aggiornamento di Dataverse i timbri di versione cambiano: compare un **avviso non
  bloccante** che dice cosa è cambiato, e il packaging prosegue
- ✅ Un elemento nuovo in `bot.xml` compare come scostamento `added` con il suo nome
- ✅ L'impronta finisce nel `manifest.json`: mesi dopo si sa su quale formato è stato prodotto
  l'artefatto (FR-100)

**Baseline di riferimento**: i valori verificati il 2026-10-15 sono in research §14, pronti per
essere messi in `baseline/package-format.json`.

### V17e — Controprova dopo l'import *(fase 2)*

1. Dopo un deploy, lasciare che il tool rilegga `bot.name` dall'ambiente di destinazione

**Atteso**:
- ✅ Il valore letto coincide con quello patchato → deploy dichiarato riuscito (FR-099)
- ✅ Se non coincide, il tool **non** dichiara il deploy riuscito e dice che l'assunzione sul
  formato è caduta

---

## Riferimenti

- Anatomia verificata del package: [research.md §9](research.md)
- Requisiti del processo di packaging: [spec.md](spec.md) §Processo di packaging (FR-067 → FR-082)
- Contratto headless: [contracts/headless-api.md](contracts/headless-api.md)
- Modello dati: [data-model.md](data-model.md)
