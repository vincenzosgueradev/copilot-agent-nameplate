# Feature Specification: Agent Rename Manager

**Feature Branch**: `001-agent-rename-manager`

**Created**: 2026-10-14

**Status**: Draft

**Input**: Tool PPTB per rinominare agent Copilot Studio cross-environment **nel package della solution**, senza creare unmanaged layer negli ambienti di destinazione

---

## Overview

Agent Rename Manager è un tool per Power Platform ToolBox (PPTB) che risolve il problema del naming degli agent Copilot Studio tra ambienti DEV, UAT e PROD.

Quando un agent viene deployato tramite Power Platform Pipelines da DEV a UAT o PROD, arriva nell'ambiente target con lo stesso nome dell'ambiente sorgente. Non esiste oggi nessuno strumento — né nell'Admin Center né nel marketplace PPTB — che permetta di rinominare gli agent in modo consistente, tracciato e sicuro su più ambienti.

Il tool **non rinomina gli agent nell'ambiente di destinazione**: li rinomina **nel package**. Il flusso è:

```text
DEV → agent → Export solution (managed) → patch del display name nel package → zip pronto all'import
                                                                                  └→ (fase 2) deploy opzionale
```

Il nome arriva così **nel managed layer** dell'ambiente di destinazione, esattamente come ogni altra
proprietà della solution. Nessun unmanaged layer, nessuna customization attiva da rimuovere, nessun
conflitto con gli upgrade successivi della solution.

---

## Clarifications

### Session 2026-10-14

- Q: Quando il tool calcola il nome finale dell'agent, da quale valore parte per costruire "nome base + suffisso"? → A: Strip del suffisso corrente (letto dalla env variable `{prefix}_AgentDisplaySuffix`) poi applica nuovo suffisso — idempotente per definizione.
- Q: Cosa deve fare il tool quando alcuni agent nella solution hanno già un suffisso applicato e altri no (stato inconsistente)? → A: Mostra nella preview lo stato di ogni agent (già rinominato / da rinominare), poi applica su tutti senza distinzione — trasparente e idempotente.
- Q: Il log e i backup contengono dati sensibili — dove devono essere salvati e per quanto tempo conservati? → A: File locale in cartella configurabile dall'utente, conservati 30 giorni per default, scaricabili e cancellabili dall'utente. Nessuna trasmissione esterna.

### Session 2026-10-14 (test feedback)

- UX: Il campo input del suffisso (SuffixSelector) DEVE avere un pulsante "Clear" visibile per azzerare il valore corrente con un click. → Aggiunto FR-022.
- UX: La spec DEVE essere aggiornata ogni volta che emergono nuovi requisiti o comportamenti attesi durante il test del tool.

### Session 2026-10-14 (navigazione e discovery)

- Q: Lo scope del rename è la solution intera o il singolo agent? → A: **Il singolo agent.** L'utente seleziona una solution, vede gli agent contenuti, e clicca l'agent su cui vuole lavorare. Il rename agisce solo sull'agent selezionato. → FR-023.
- Q: Da quale tabella si scopre la lista degli agent? → A: **Dalla tabella `bot`**, che è la fonte autoritativa. Partire da `solutioncomponent` nasconde gli agent non presenti in una solution visibile. → FR-024.
- Correzione tecnica: il valore `componenttype` per Bot **non esiste** nell'enum documentato; `380` è **Environment Variable Definition** (non Chatbot, come affermava erroneamente `research.md`). Filtrare su un valore indovinato restituisce zero righe silenziosamente. → FR-025.
- UX: La tabella solution DEVE mostrare solo le solution **unmanaged** che **contengono almeno un agent** — è un tool per agent, le solution vuote e managed sono rumore. → FR-026.
- UX: La colonna "Type" è stata rimossa dalla tabella: con il filtro unmanaged ripeteva lo stesso valore su ogni riga.
- UX: Il pannello laterale con la lista agent è stato rimosso — ridondante una volta introdotta la navigazione solution → dettaglio.
- UX: L'intestazione della tabella DEVE restare visibile durante lo scroll (sticky). → FR-027.
- UX: Serve una ricerca testuale che filtri **sia le solution sia gli agent contenuti**, perché l'utente spesso ricorda il nome dell'agent ma non la solution. → FR-028.
- UX: Il pulsante "Clear" del suffisso DEVE essere disabilitato quando il campo è vuoto. → Raffina FR-022.

### Session 2026-10-14 (layout enterprise e navigazione)

- UX: L'app DEVE essere **full width e responsive**, con grafica di livello enterprise. Lo `max-width: 860px` sugli step panel lasciava metà schermo vuoto. → FR-031, FR-032. Elevato a Principio VII della Constitution (v1.1.0).
- Q: Come si torna indietro di un solo livello senza tornare alla root? → A: **Breadcrumb navigabile.** La gerarchia reale è `Solutions › {Solution} › {Agent} › Preview › Apply`; l'agent selezionato e la schermata "Configure Suffix" sono lo stesso nodo, quindi il crumb dell'agent riporta a quello step. Da Preview, il passo indietro è cliccare il nome dell'agent. → FR-033, FR-034, FR-035.
- UX: La colonna Created (e per coerenza tutte le colonne) DEVE essere cliccabile per ordinare asc/desc al volo. → FR-036, FR-037, FR-038.

### Session 2026-10-14 (dettaglio solution e schermata suffisso)

- UX: Il dettaglio solution lasciava una piccola card agent in un'area vuota. → Ora è un **rettangolo a tutta altezza**: intestazione, barra metadati e tabella agent che riempie il resto. → FR-039.
- UX: La schermata "Configure Suffix" DEVE essere più enterprise e di immediata comprensione, con **anteprima live** del nome risultante mentre si digita. → FR-040, FR-041, FR-042.
- Q: Il tool deve creare la variabile d'ambiente già nello step suffisso? → A: **No.** Lo step suffisso non scrive nulla (FR-010: conferma esplicita prima di ogni scrittura). La variabile viene creata all'Apply, dietro dialog di conferma. Per non lasciare l'utente all'oscuro, lo step mostra in anticipo la lista "What happens when you apply" con cosa verrà creato/modificato. → FR-043.
- UX: I pulsanti Back devono salire di **un solo livello** (Suffix → Solution, Preview → Suffix), non alla root, e il suffisso digitato non va perso tornando indietro. → FR-044.
- Bug: l'utente cancella il valore ma il tool continua a mostrarlo. Cause individuate: (1) i nomi venivano letti una sola volta all'avvio e mai aggiornati, nemmeno dopo un apply; (2) se si elimina il *current value* di una variabile il tool ricadeva silenziosamente sul *default value*, che alla creazione viene impostato al primo suffisso applicato; (3) la bozza del suffisso reintroduceva il valore digitato in precedenza. → FR-047 → FR-051.
### Session 2026-10-15 (primo test su UAT)

- **Ipotesi smentita:** research §3 e SC-007 davano per scontato che il PATCH di `bot.name` funzioni su una managed solution. In UAT Dataverse ha risposto `0x8004f026 … managed property evaluation … iscustomizableanddeletable … bot … iscustomizable`: l'agent era bloccato dal publisher. Su un agent bloccato il tool, nella sua forma originale, **non può** rinominare in UAT/PROD. → research §3 riscritto, SC-007 ridimensionato, FR-063.
- Difetto del tool, non solo dell'ambiente: dopo il rename rifiutato l'apply scriveva comunque la variabile, lasciando `variabile = UAT` e `agent = [DEV]`. → FR-064, FR-065, FR-066.
- Q: Si blocca il pulsante quando l'agent è Locked? → A: No, diventa "Try anyway": il rilevamento si basa sul formato di una managed property che non è stato possibile verificare su un tenant reale, e ora un tentativo fallito non cambia nulla.
- Domanda aperta: Copilot Studio imposta `iscustomizable = false` di default alla creazione di un agent? Se sì, nessun agent distribuito via pipeline sarebbe rinominabile a valle senza un intervento del publisher. Da verificare creando un agent nuovo in DEV e controllandone il valore.

### Session 2026-10-15 (environment managed)

- Bug: connesso a UAT il tool trovava 2 agent ma mostrava "No solutions found", perché le solution di UAT sono managed e il filtro era fisso su unmanaged. → Selettore di tipo con default dedotto dai dati (FR-061, FR-026).
- Q: Si decide il tipo dal nome dell'environment (DEV/UAT)? → A: No, un environment può chiamarsi come vuole. Si guarda cosa contiene.
- Scoperto durante l'analisi: su una solution managed `AddSolutionComponent` non è permesso. L'apply, in un environment dove la variabile non esiste ancora, avrebbe creato la definizione e poi fallito, lasciando l'operazione a metà. → FR-062.

### Session 2026-10-15 (backup e rollback)

- Q: Dove si salvano i backup? → A: nello store `settings` locale del tool, fornito da PPTB: nessun percorso da indovinare (l'API non espone la cartella dati di PPTB), nessun prompt, nulla lascia il dispositivo. **Deviazione da FR-021:** la cartella configurabile dall'utente non è implementata in questa versione; il file si ottiene con **Export** dal dialog di salvataggio. → FR-060.
- Q: Cosa succede se il backup non si riesce a salvare? → A: l'apply non parte. Meglio un'operazione bloccata con un messaggio chiaro che una modifica senza rete di sicurezza. → FR-054.
- Q: Cosa viene ripristinato? → A: esattamente ciò che l'apply scrive: nome dell'agent e variabile d'ambiente, con le tre varianti create / valore esistente / solo default. → FR-055, FR-057.
- Q: Cosa succede se qualcosa è cambiato dopo il backup? → A: il tool lo segnala prima di procedere (agent rinominato di nuovo, agent eliminato, variabile che verrebbe cancellata) e lascia decidere. → FR-058.
- Corner case: l'utente cancella il valore della variabile dalla solution ma l'agent conserva `[DEVS]` nel nome; come normalizzarlo? → A: il tool rileva lo scostamento tra nome e variabile e lascia scegliere all'utente se **sostituire** il suffisso orfano o **adottarlo** nella variabile. → FR-052.
- Deviazione da FR-005: il formato del suffisso è fisso `[SUFFIX]`; le varianti con parentesi tonde `(DEV)` non sono state implementate. I valori predefiniti sono ora chip rapidi (DEV, TEST, UAT, STAGING, PREPROD, PROD) + campo libero.

### Session 2026-10-15 (correzione del processo — packaging invece di rename live)

- **Difetto di processo, non un bug:** rinominare l'agent in UAT/PROD via `UPDATE` su `bot` crea un
  **unmanaged layer** sul componente managed (Solution Layers → "Unmanaged layer", publisher
  *Default Publisher*, Order 2 sopra la solution). Da quel momento il layer vince su ogni upgrade
  successivo della solution: il nome resta congelato e l'ambiente non è più allineato al package.
  Che l'`UPDATE` riesca o venga rifiutato dalla managed property è secondario — **riuscire è il caso
  peggiore**, perché il danno è silenzioso. → FR-067.
- Q: Dove si applica allora il rename? → A: **Nel package della solution**, prima dell'import.
  Export da DEV come managed → patch del display name → rezip → zip importabile. Il nome entra nel
  managed layer. → FR-068, FR-069.
- **Verificato su export reale** (`testAgentTool` v1.0.0.2 da DEV, 2026-10-15, vedi research §9):
  il display name sta in **un solo punto**, `bots/<schemaname>/bot.xml` → `<name>`. Patch + rezip
  provati: 34 entry in / 34 out, zip integro, **33 entry su 34 byte-identiche**. → FR-070.
- Q: Si rinomina anche lo `schemaname` / le cartelle, come fanno gli script di rename in giro? →
  A: **No, mai.** Lo `schemaname` è l'identità del componente: cambiarlo trasforma l'upgrade in un
  agent nuovo e lascia il vecchio orfano. Quegli script servono a *duplicare* un agent nello stesso
  environment. → FR-069.
- Q: Il rename live via Dataverse resta come modalità per DEV (dove la solution è unmanaged e il
  layer non si creerebbe)? → A: **No, rimosso del tutto.** Un flusso solo è un flusso che non si può
  usare male. → FR-067, requisiti superati.
- Q: Da dove arriva il suffisso, ora che non si scrive più in Dataverse? → A: **Input al momento del
  packaging**. *(In questa sessione si era aggiunta anche la scrittura del `<defaultvalue>` della
  environment variable dentro lo zip; eliminata il giorno stesso — vedi la sessione sui canali: il
  suffisso nativo si sommerebbe a quello del nome. → FR-089.)*
- **Scoperto nell'export:** il manifest Teams (`applicationmanifestinformation`) **non è nel
  package**. Verificato poi che quel campo **non contiene nemmeno un nome**, solo identificativi: il
  nome sui canali deriva da `bot.name` al publish. FR-008 e le user story che davano per scontato il
  patch del manifest sono superate. → FR-079, research §11.
- **Scoperto nell'export:** `bots/<schema>/configuration.json` contiene `publishOnImport: true` —
  l'agent si ripubblica da solo all'import, quindi lo step PvaPublish non serve più nel flusso di
  packaging. → FR-080.
- Q: Il deploy sull'ambiente target lo fa il tool? → A: **In seconda battuta**, come step opzionale.
  La fase 1 si chiude con lo zip sul disco. → FR-081.

### Session 2026-10-15 (il tool prende il posto della pipeline — artifact set)

- **Vincolo scoperto:** le Power Platform Pipelines **proibiscono la modifica dell'artefatto**
  (*"the system stores them in the pipelines host and prohibits any tampering or modification"*,
  [Extend pipelines](https://learn.microsoft.com/power-platform/alm/extend-pipelines)) e
  distribuiscono **lo stesso artefatto managed a tutti gli stage**. I gated extension
  (`OnDeploymentRequested`, pre-export, pre-deployment) possono solo approvare o bloccare uno step,
  mai sostituire lo zip. Un package patchato quindi **non può entrare in una pipeline nativa**.
- Q: Si rinuncia al packaging o alla pipeline? → A: **Il tool assume il ruolo della pipeline** per
  le solution che contengono agent. Il principio resta identico — export, artefatto immutabile,
  deploy del medesimo artefatto — ma l'artefatto lo produce il tool, perché è l'unico punto del
  processo in cui il display name può essere corretto senza creare un unmanaged layer. → FR-083.
- Q: Quali artefatti si conservano? → A: **Entrambi**, come fa il pipelines host: managed e
  unmanaged, patchati allo stesso modo, nella stessa cartella di operazione, con un `manifest.json`
  che li descrive. Il managed si distribuisce, l'unmanaged è la fotografia della sorgente (source
  control, ripristino in un environment di sviluppo o di build). → FR-083, FR-085.
- **Verificato su export reale** (research §10): managed e unmanaged della stessa solution hanno le
  stesse 34 entry e differiscono **solo** in `solution.xml` (`<Managed>` 0 vs 1). Lo stesso codice
  di patch vale per entrambi.
- Q: Visto che differiscono per un flag, si può fare un export solo e derivare l'altro? → A:
  **No.** L'equivalenza vale per una solution di soli bot; appena entrano tabelle, form o managed
  property l'export managed non è più l'unmanaged con un flag diverso. Due `ExportSolution`
  distinti, due patch indipendenti. → FR-084.
- Q: Due artefatti con la stessa `<Version>` ma contenuto diverso (uno per UAT, uno per PROD): come
  si distinguono in audit? → A: `manifest.json` con **hash SHA-256** di ogni file, suffisso,
  sorgente, operatore e data. La versione da sola non basta e non va forzata con un bump, che
  creerebbe una deriva di versioni per ambiente. → FR-086.
- **Q (decisa il 2026-10-15): il deploy passa dalle Power Platform Pipelines native? → A: No, le
  solution si importano manualmente.** Il vincolo di immutabilità dell'artefatto **non si applica**:
  non c'è nessun pipelines host da cui uscire. Il tool prende il posto dell'export manuale e
  aggiunge il rename, senza cambiare il modo in cui si distribuisce. Il vincolo resta documentato
  perché tornerebbe valido il giorno in cui si adottassero le pipeline native: in quello scenario
  l'artifact set andrebbe importato fuori dalla pipeline, oppure si ripiegherebbe sul suffisso
  nativo dei canali.
- **Q: il nome deve essere diverso in Copilot Studio o sui canali? → A: in entrambi.**
- **Q (chiusa il 2026-10-15 con verifica sul tenant): da dove arriva il nome su Teams e M365? →
  A: da `bot.name`, fotografato al publish, per environment.** Verificato in tre modi (research
  §11): (1) `applicationmanifestinformation` **non contiene nessun nome**, solo identificativi —
  il presupposto di FR-008 era sbagliato; (2) DEV e UAT hanno app id dei canali completamente
  diversi, provveduti al publish di ciascun environment; (3) su 12 agent di DEV con registrazione
  Teams, **11 hanno il nome del canale identico a `bot.name`**, e l'unico divergente era stato
  rinominato dopo l'ultimo publish. → **Patchare `<name>` nel package copre anche Teams e M365**,
  perché `publishOnImport: true` pubblica l'agent all'import. → FR-079 riscritta, FR-080
  promossa a requisito critico.
- **Q: si tiene anche il suffisso nativo dei canali? → A: No, eliminato.** Se `bot.name` contiene
  già ` [UAT]` e si configura anche il *Channel display name suffix*, su Teams i due si sommano
  (`agenteTool1 [UAT] (UAT)`): sono **alternativi, non complementari**. FR-072 (scrittura del
  `<defaultvalue>` nel package) è **eliminata**; resta un avviso se la feature nativa risulta
  configurata. → FR-089.

### Session 2026-10-15 (la solution intera viaggia — inventario e publish)

- **Vincolo di piattaforma:** l'artefatto è la **solution intera**, non l'agent. Power Platform non
  consente deploy parziali: rinominando un agent si ridistribuisce tutto ciò che sta nella sua
  solution. Misurato (research §12): `testAgentTool` contiene solo l'agent (16 componenti),
  ma `SigmaMonitoringAgent` porterebbe con sé **2 cloud flow, 1 connection reference e 1 security
  role**.
- Q: Il tool può spezzare la solution? → A: **No**, e non deve provarci. Può però **togliere la
  sorpresa**: l'anteprima mostra sempre l'inventario del package e chiede **conferma esplicita**
  quando contiene componenti diversi dall'agent selezionato. → FR-091.
- Best practice conseguente, nelle parole di Microsoft: *"Don't add components to the solution that
  aren't new or changed components… can cause unexpected behavior to the existing components that
  now lay below the layer you introduced"*
  ([Use table segmentation](https://learn.microsoft.com/power-platform/alm/segmented-solutions-alm)).
  Tradotto: **una solution dedicata per agent**, come `testAgentTool`. Dove non è possibile, si fa
  packaging da uno stato validato, non da un DEV a metà lavoro.
- Q: Il publish all'import si può rendere opzionale? → A: **Sì.** `publishOnImport` sta dentro
  `bots/<schemaname>/configuration.json`, cioè nel package: si patcha come `<name>`. Tre stati,
  **default "lascia com'è"**, così il package resta fedele alla sorgente. → FR-090.
- **Limite dichiarato:** su 40 agent di DEV, 12 hanno `publishOnImport: true`, **28 non hanno il
  campo** e nessuno ha `false`. Il comportamento di default quando il campo manca **non è
  documentato** da Microsoft. Il tool lo dichiara "non specificato" invece di promettere (FR-090).
- **Misurato:** `componenttype` **10212 = Agent**, **10213 = Agent component**. FR-025 diceva che il
  valore per Bot non fosse ricavabile: ora è verificato su due solution, una con agent e una senza.
  → FR-092.

### Session 2026-10-15 (export: misure reali e strategia)

- Q: `ExportSolution` è sincrono e lo chiamiamo due volte — regge? → **Misurato** (research §13):
  la coppia managed+unmanaged costa **13,4 s** su `testAgentTool`, **17,6 s** su
  `SigmaMonitoringAgent`, **111 s** su `FactoryHub` (976 KB, la più pesante dell'environment).
  Sotto i 2 minuti anche nel caso peggiore disponibile.
- Q: Si usa il flusso del portale (`ExportSolutionAsync` + polling + `DownloadSolutionExportData`)?
  → **Provato davvero**: 154 s totali su `testAgentTool`, di cui **152 s di sola coda** del job
  asincrono. Il tempo di coda **non dipende dalla dimensione**: sul caso minimo l'asincrono è oltre
  20 volte più lento del sincrono, e con due export si arriverebbe a ~5 minuti per packaging.
- **Decisione: sincrono come percorso primario, asincrono come fallback automatico.** Si prende la
  velocità del primo e la robustezza del secondo; l'utente non deve scegliere né sapere quale è
  stato usato, ma il manifest lo registra. → FR-093, FR-094.
- Verificato che i due percorsi producono lo **stesso artefatto**: l'export asincrono di
  `testAgentTool` managed pesa 32.544 byte, identico al sincrono.
- **Trappola incontrata**: un `$select` con una colonna inesistente su `asyncoperations` restituisce
  **HTTP 400**, non un campo vuoto. Il polling va scritto chiedendo solo `statecode` e `statuscode`.
- **Trappola di verifica**: il package riconfezionato pesa 31.469 byte contro 32.544 dell'originale,
  a parità di contenuto — cambia solo il compressore. La verifica di FR-070 DEVE confrontare le
  entry una per una e **mai** le dimensioni del file.

### Session 2026-10-15 (zona grigia di supportabilità — rete di sicurezza sul formato)

- **Rischio accettato:** Microsoft non documenta il formato interno del package come contratto
  stabile. Il tool lo apre e lo riscrive. Il rischio **tecnico** si può ridurre quasi a zero; quello
  **formale** (un ticket su un environment con package modificato) no.
- Q: Si può accorgere da solo se il formato cambia nel tempo? → **Sì, e con rumore zero.** Misurato
  (research §14): il display name esatto compare in **una sola entry su 34**
  (`bots/<schema>/bot.xml` → `<name>`), mentre lo schemaname compare in **31 entry su 34**. Un
  controllo sul display name come *testo esatto di un elemento* non ha falsi positivi. → FR-096.
- **Lo scenario pericoloso non è che `<name>` sparisca** — in quel caso il tool si ferma già oggi
  (FR-069). È che Microsoft aggiunga **un secondo posto** che contiene il display name: il patch
  riuscirebbe lo stesso, ma **incompleto e in silenzio**. È esattamente quello che il controllo
  intercetta.
- Q: Blocca o avvisa? → A: **Blocca, con conferma esplicita** per procedere. Un avviso si ignora
  senza accorgersene; qui si rischia un artefatto corrotto a valle. → FR-096.
- Q: Come si rileva il cambio di formato in generale? → A: **impronta del package** — timbri di
  versione della piattaforma presenti in `solution.xml`, cartelle di primo livello, elementi di
  `bot.xml`, chiavi di `configuration.json` — confrontata **sia con una baseline distribuita col
  tool sia con l'ultimo packaging della stessa solution**. → FR-097, FR-098.
- **Severità differenziata**: elemento nuovo o timbri di versione cambiati → **avviso non
  bloccante**. Dataverse si aggiorna di continuo: bloccare su quello renderebbe il tool
  inutilizzabile.
- **Occorrenza nota da non confondere con un'anomalia**:
  `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` contiene il **nome base senza
  suffisso**. È il nome del componente, non il display name: non viene patchato, ma il tool deve
  conoscerlo per non segnalarlo quando il suffisso è vuoto. → FR-096.

### Session 2026-10-15 (dipendenze, supportabilità, scelta della strada)

- **Verificato: il rename non può rompere dipendenze.** `RetrieveDependentComponents` sull'agent
  restituisce 14 dipendenze (i suoi agent component) e **nessun campo contiene un nome**: solo
  GUID e `componenttype`. Il display name **non è una chiave**, niente lo referenzia. L'identità è
  `botid` + `schemaname`, che il tool non tocca mai. → research §15, FR-101.
- **Verificato: cosa fa davvero una pipeline DevOps.** Export → `unpack` → commit → `pack` →
  import è il pattern documentato, ma le modifiche si fanno **nell'ambiente**, non nei file.
  Microsoft è esplicita: *"Except for the sections described in When to edit the customizations
  file, **manual editing of extracted component files and .zip files isn't supported**"*
  ([Source control with solution files](https://learn.microsoft.com/power-platform/alm/use-source-control-solution-files)).
  Le eccezioni ammesse stanno tutte dentro `customizations.xml` (ribbon, sitemap, FormXml, viste,
  ISV.config): **`bot.xml` non è tra quelle**.
- Q: Esiste una strada formalmente ineccepibile? → **Sì**: un *build environment* in cui importare
  la solution **unmanaged**, rinominare l'agent lì (operazione legittima, nessun layer) ed
  esportarla **managed**, una volta per ambiente di destinazione. Solo API native, nessun file
  riscritto.
- **Decisione dell'utente (2026-10-15): si procede con il patch del package.** Valutata e scartata
  la modalità build environment: richiederebbe un environment aggiuntivo da gestire e un ciclo
  import+rinomina+export (~2 minuti) per ogni destinazione, contro i 13 secondi del patch. La
  frase "not supported" è stata messa sul tavolo prima della scelta e **accettata
  consapevolmente**, sulla base di: (1) nessuna dipendenza può rompersi, dimostrato; (2) viene
  modificato **un solo elemento**, verificabile entry per entry; (3) l'export originale resta
  nell'artifact set, quindi ogni problema è riproducibile senza il patch. → FR-102.
- **Fuori scope, non scartata per sempre:** la modalità build environment resta documentata come
  alternativa pronta, da riprendere se un cliente o una policy interna richiedesse la conformità
  formale. → research §15.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Selezione della solution e lettura del contesto (Priority: P1)

Un maker apre il tool connesso a **DEV**, cerca la solution che contiene l'agent da distribuire e ne
legge il contesto: agent contenuti, publisher, versione, e se la solution porta con sé una
environment variable utilizzabile come suffisso dei canali.

**Why this priority**: Il packaging parte da una solution sorgente. Sbagliare solution significa
produrre uno zip inutile.

**Independent Test**: Connesso a DEV, l'utente trova la solution `testAgentTool`, ne apre il
dettaglio e vede l'agent `agenteTool1` con stato e date, senza dover sapere nulla di `bot` o
`solutioncomponent`.

**Acceptance Scenarios**:

1. **Given** un environment connesso, **When** l'utente apre il tool, **Then** vede le solution che
   contengono almeno un agent, con conteggio agent, versione, publisher e prefix
2. **Given** una solution **managed**, **When** l'utente la seleziona come sorgente del packaging,
   **Then** il tool spiega che una managed solution non è esportabile e indica di lavorare
   nell'environment in cui la solution è unmanaged (FR-068)
3. **Given** una solution con una environment variable di tipo String, **When** l'utente apre il
   dettaglio, **Then** il tool la segnala come candidata per il *Channel display name suffix*
   nativo, spiegando che riguarda solo Teams e M365 Copilot (FR-072, FR-079)
4. **Given** una solution senza environment variable, **When** l'utente procede, **Then** nessun
   blocco: il packaging del display name non la richiede

---

### User Story 2 — Package: export, patch e zip (Priority: P1)

Scelti gli agent e il suffisso dell'ambiente di destinazione, l'utente genera lo zip della solution
con i nomi già corretti, pronto da importare come managed.

**Why this priority**: È il cuore del tool e l'unica parte che risolve il problema alla radice.

**Independent Test**: Da `testAgentTool` in DEV con suffisso `UAT`, l'utente ottiene
`testAgentTool_1_0_0_2_managed_UAT.zip` in cui `bots/ava_agenteTool1/bot.xml` contiene
`<name>agenteTool1 [UAT]</name>` e **ogni altra entry è byte-identica** all'export originale.

**Acceptance Scenarios**:

1. **Given** una solution unmanaged selezionata, **When** l'utente avvia il packaging, **Then** il
   tool esporta la solution come **managed** e mostra cosa ha ricevuto: nome univoco, versione,
   publisher, numero di entry, agent trovati nel package
2. **Given** il package esportato, **When** il tool calcola il patch, **Then** mostra per ogni agent
   `nome nel package → nome nuovo`, il file esatto che verrà toccato
   (`bots/<schemaname>/bot.xml`) e l'elenco di ciò che **non** viene toccato (schemaname, cartelle,
   file, GUID)
3. **Given** un agent il cui nome nel package ha già un suffisso (`agenteTool1 [DEV]`), **When** si
   applica il suffisso `UAT`, **Then** il risultato è `agenteTool1 [UAT]`, mai
   `agenteTool1 [DEV] [UAT]` (FR-071)
4. **Given** il patch confermato, **When** il tool scrive lo zip, **Then** lo riapre e verifica
   integrità, numero di entry e valore di `<name>` prima di dichiarare il file pronto (FR-077)
5. **Given** lo zip prodotto, **When** l'utente lo confronta con l'export originale, **Then** le
   uniche differenze sono gli elementi `<name>` patchati (e `<Version>`, se richiesto il bump) —
   il tool lo dimostra con un diff entry-per-entry (FR-070)
6. **Given** una solution con più agent, **When** l'utente applica il suffisso, **Then** tutti gli
   agent del package vengono patchati nella stessa operazione, con esito per ciascuno (FR-076)

---

### User Story 3 — Artifact set, ripristino e tracciabilità (Priority: P1)

Ogni packaging lascia sul disco un **artifact set**: la coppia managed+unmanaged patchata, gli
export originali e un `manifest.json`. È lo stesso principio del *pipelines host* — che conserva
la coppia per versione e la tratta come immutabile — con in più il patch del display name, che il
pipelines host non consente. Il ripristino non è un'operazione sul database: è reimportare
l'originale.

**Why this priority**: Il flusso di packaging non scrive su nessun environment, quindi non serve
più un rollback transazionale su Dataverse — serve che gli artefatti di partenza non vadano persi
e che a posteriori si sappia quale file è stato importato dove.

**Independent Test**: Dopo due packaging dalla stessa versione con suffissi diversi, i due
`manifest.json` mostrano lo stesso `source.version` ma hash SHA-256 diversi, e la cartella di
ciascuna operazione contiene i quattro archivi attesi.

**Acceptance Scenarios**:

1. **Given** un packaging completato, **When** l'utente apre la cartella dell'operazione, **Then**
   trova `manifest.json`, l'archivio managed patchato (`…_managed_{SUFFIX}.zip`), quello unmanaged
   patchato (`…_unmanaged_{SUFFIX}.zip`) e i due export originali (FR-083, FR-074)
2. **Given** l'artifact set, **When** l'utente apre `manifest.json`, **Then** trova per ogni file
   `role`, `managed`, `patched`, numero di entry, **hash SHA-256** ed esito della verifica, oltre a
   sorgente, suffisso, operatore, data/ora e agent `prima → dopo` (FR-086)
3. **Given** due artifact set generati dalla stessa versione con suffissi diversi, **When** si
   confrontano, **Then** la `<Version>` è la stessa ma hash e suffisso li distinguono senza
   ambiguità — nessun bump di versione necessario (SC-011)
4. **Given** l'artifact set, **When** l'utente deve importare in UAT, **Then** il tool indica in
   modo inequivocabile **un solo file**: quello con `role: deploy`. L'unmanaged patchato è
   etichettato come non destinato a UAT/PROD (FR-087)
5. **Given** un packaging completato, **When** l'utente apre **History**, **Then** vede data/ora,
   environment sorgente, solution, versione, suffisso, agent `prima → dopo`, il percorso della
   cartella, l'esito della verifica **per archivio** e lo spazio occupato
6. **Given** uno zip patchato per errore con il suffisso sbagliato, **When** l'utente rigenera,
   **Then** non serve alcuna operazione di ripristino: gli export originali non sono mai stati
   modificati e l'environment sorgente non è mai stato toccato
7. **Given** una cartella di artifact set già esistente, **When** l'utente conferma il salvataggio,
   **Then** il tool chiede conferma prima di sovrascrivere
8. **Given** la verifica fallita su **uno solo** dei due archivi patchati, **When** il packaging
   termina, **Then** l'intero artifact set è dichiarato non valido e il tool lo dice: managed e
   unmanaged che non concordano sono peggio di nessun artefatto (FR-085)

---

### User Story 4 — Solution Explorer e navigazione multi-environment (Priority: P2)

L'utente connette più environment tramite PPTB multi-connection e naviga le solution di ciascuno.

**Why this priority**: La vista cross-environment è il differenziatore principale rispetto a fare tutto manualmente in Copilot Studio.

**Independent Test**: Con due connessioni attive (DEV e UAT), l'utente vede le solution di entrambi gli environment, identifica quale ha il suffisso configurato e quale no, e può operare su ciascuno indipendentemente.

**Acceptance Scenarios**:

1. **Given** più connessioni PPTB attive, **When** l'utente apre il tool, **Then** vede tutti gli environment connessi con le rispettive solution
2. **Given** la tabella solution di un environment, **When** l'utente clicca una riga, **Then** si apre il dettaglio della solution con i metadati (nome univoco, versione, publisher, prefix, data creazione) e la lista degli agent contenuti
3. **Given** il dettaglio di una solution, **When** l'utente clicca un agent, **Then** il tool entra nel flusso di rename per **quel solo agent**
4. **Given** una solution con 50+ agent, **When** il tool carica la lista, **Then** il caricamento è progressivo con indicatore di progresso — non blocca l'interfaccia
5. **Given** agent che non appartengono a nessuna solution unmanaged, **When** l'utente apre la tabella, **Then** trova una riga dedicata "Agents without a solution" che li raggruppa — nessun agent dell'environment è irraggiungibile
6. **Given** la vista cross-environment, **When** l'utente guarda due environment affiancati, **Then** vede lo stesso agent con il nome che ha in ciascun ambiente

---

### User Story 5 — Deploy opzionale sull'ambiente di destinazione (Priority: P3 — fase 2)

Con lo zip pronto, l'utente può importarlo direttamente nell'ambiente di destinazione dal tool,
invece di passare dal portale.

**Why this priority**: È una comodità, non la soluzione del problema. La fase 1 si chiude con lo zip
sul disco; questa user story si implementa in seconda battuta.

**Independent Test**: Con due connessioni PPTB (DEV e UAT), dopo il packaging l'utente sceglie UAT
come destinazione, avvia l'import e segue l'avanzamento fino all'esito, poi verifica in Solution
Layers che l'agent abbia **solo** il layer managed.

**Acceptance Scenarios**:

1. **Given** uno zip patchato e una connessione all'ambiente di destinazione, **When** l'utente
   avvia il deploy, **Then** il tool importa il package e mostra l'avanzamento dell'import job fino
   all'esito (FR-081)
2. **Given** un agent che nell'ambiente di destinazione ha **già un unmanaged layer** (da un rename
   manuale precedente), **When** l'utente avvia il deploy, **Then** il tool lo rileva e avvisa che
   il layer vince sul nome del package: va rimosso con **Remove active customizations** prima o dopo
   l'import, altrimenti il nome non cambierà (FR-082)
3. **Given** un import della **stessa versione** già installata, **When** l'utente procede,
   **Then** il tool spiega che è un *update* e non un *upgrade*, e offre il bump di versione
   (FR-073)
4. **Given** un import fallito, **When** il tool riceve l'errore, **Then** mostra il messaggio di
   Dataverse e lascia lo zip sul disco, pronto per un nuovo tentativo o per l'import manuale

---

### User Story 6 — Log operazioni (Priority: P2)

Ogni operazione eseguita viene registrata nel log del tool con tutti i dettagli.

**Why this priority**: Audit trail obbligatorio per uso enterprise e multi-utente.

**Independent Test**: Dopo un rename di 3 agent, il log mostra: timestamp, utente, environment, solution, agent, campo modificato, valore prima, valore dopo. Il log è scaricabile.

**Acceptance Scenarios**:

1. **Given** qualsiasi operazione completata (rename, publish, rollback, creazione env variable), **When** l'operazione termina, **Then** viene registrata nel log con: timestamp, utente connesso, environment, solution, agent, campo, valore prima → dopo, esito
2. **Given** la sezione log, **When** l'utente la apre, **Then** vede la lista di tutte le operazioni filtrabili per data, environment, solution, agent
3. **Given** il log, **When** l'utente clicca "Esporta", **Then** scarica un file (CSV o JSON) con tutte le operazioni visibili

---

### Edge Cases

- Cosa succede se l'utente non ha i permessi per esportare la solution? → `ExportSolution` risponde con un errore di privilegio: il tool mostra il messaggio e indica il ruolo necessario (System Customizer come minimo, vedi documentazione Copilot Studio)
- Cosa succede se la environment variable del suffisso canali non è nel package? → L'opzione "allinea il suffisso nativo Teams/M365" resta disabilitata con la spiegazione del perché; il patch del display name procede comunque (FR-072)
- Come viene calcolato il "nome base" per l'idempotenza? → Il tool legge il `<name>` **dal package appena esportato** (non da Dataverse), e se termina con ` [X]` (1–20 caratteri tra parentesi quadre — il formato che il tool stesso scrive) lo rimuove per ottenere il nome base, poi appende il nuovo suffisso. Se non c'è suffisso riconoscibile, il nome del package è già il nome base (FR-071).
- Cosa succede se l'utente cancella il valore della variabile d'ambiente ma l'agent ha ancora il suffisso nel nome (es. nome `Agent [DEVS]`, valore vuoto)? → Senza intervento il tool non riconosce `[DEVS]` come suffisso e ne accoderebbe un secondo (`Agent [DEVS] [DEV]`), violando l'idempotenza (FR-007). Lo step suffisso rileva lo scostamento e propone **Replace** o **Keep and save** (FR-052). L'override vale per l'agent selezionato, è condiviso con la Preview, e si azzera alla selezione di un altro agent e dopo un apply riuscito
- Cosa succede se alcuni agent nella solution hanno già il suffisso e altri no? → Il tool mostra nella preview lo stato di ciascun agent (già rinominato / da rinominare / rinominato con suffisso diverso) e applica comunque su tutti in modo idempotente — nessun warning bloccante, massima trasparenza nella preview.
- Cosa succede se il nome base + suffisso supera 30 caratteri (limite manifest Teams)? → Warning preventivo nella preview con conteggio caratteri
- Cosa succede se la solution sorgente è managed? → Non è esportabile ("You can't export managed solutions"): il tool lo dice subito e indica di lavorare nell'environment in cui la solution è unmanaged, cioè DEV (FR-068). La managed property "Can be customized" **non è più rilevante**: il tool non modifica componenti managed in nessun environment
- Cosa succede se nel package ci sono agent che l'utente non vuole rinominare? → La selezione è per agent: gli agent non selezionati restano nel package con il nome originale, byte-identici (FR-076)
- Cosa succede se l'utente disconnette l'environment durante l'export? → L'export fallisce e non viene prodotto alcun file. Non esiste uno stato parziale da annullare: fino alla scrittura dello zip non è stato modificato nulla, né in locale né in Dataverse
- Cosa succede se `solutioncomponent` contiene voci orfane che puntano a bot cancellati? → La membership viene risolta con FetchXML `operator="in"` sugli id noti, che ignora in sicurezza gli id inesistenti invece di fallire con "Entity Does Not Exist"
- Cosa succede se un agent non appartiene a nessuna solution unmanaged? → Compare nella riga "Agents without a solution" e resta pienamente rinominabile (FR-029)
- Cosa succede se la risoluzione della solution fallisce del tutto? → Gli agent restano elencati con solution `null`; il log riporta `Solution resolved for N/M agent(s)` così l'anomalia è diagnosticabile invece di presentarsi come lista vuota senza errori
- Cosa succede se la ricerca non trova nulla? → Messaggio esplicito che cita il termine cercato, non una tabella vuota senza spiegazione
- Cosa succede se il package non contiene nessuna cartella `bots/`? → La solution non contiene agent: il tool lo dice e non produce alcuno zip, invece di salvare un file identico all'originale
- Cosa succede se `bot.xml` non contiene un elemento `<name>` (formato di export cambiato)? → Il tool si ferma su quell'agent e lo segnala con il percorso del file: meglio un packaging bloccato che uno zip patchato a metà su un formato non riconosciuto (FR-069)
- Cosa succede se il nome dell'agent nel package è diverso da quello che si vede in Copilot Studio? → Vince il package: è la fonte di ciò che verrà importato. Il tool mostra entrambi se divergono, perché indica che qualcuno ha rinominato l'agent fuori dal flusso
- Cosa succede se lo zip prodotto non supera la verifica di riapertura? → Il tool non lo consegna come valido: segnala il fallimento e lascia il package originale, che è sempre reimportabile (FR-077)
- Cosa succede se l'ambiente di destinazione ha già un unmanaged layer sull'agent? → Il nome del package non comparirà finché il layer esiste, perché il layer unmanaged sta sopra quello managed. Il tool lo rileva e indica **Remove active customizations** (FR-082)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il tool DEVE esporre una tabella delle solution dell'environment connesso con le colonne: Display name, Name (nome univoco), Agents (conteggio), Created, Version, Publisher — ordinata per numero di agent decrescente
- **FR-002**: Il tool DEVE caricare 50+ agent in modo progressivo senza bloccare l'interfaccia
- **FR-003**: Il tool DEVE rilevare automaticamente se una solution ha la env variable `{publisher_prefix}_AgentDisplaySuffix` e mostrare warning se assente
- **FR-004**: Il tool DEVE guidare la creazione della env variable con nome fisso `{publisher_prefix}_AgentDisplaySuffix` nel publisher della solution
- **FR-005**: Il tool DEVE offrire valori predefiniti selezionabili con un click (`DEV`, `TEST`, `UAT`, `STAGING`, `PREPROD`, `PROD`) più campo testo libero (max 20 caratteri). Il suffisso è sempre reso tra parentesi quadre dopo il nome base: `Nome agent [SUFFISSO]` *(le varianti con parentesi tonde previste in origine non sono implementate, vedi clarifications)*
- **FR-006**: Il tool DEVE mostrare una preview del rename per l'agent selezionato con: nome attuale | nome base calcolato | nome finale | stato attuale (già rinominato con suffisso / da rinominare / rinominato con suffisso diverso)
- **FR-007**: Il tool DEVE applicare il rename in modo idempotente — vedi **FR-071** per la versione applicata al package *(versione originale basata sul valore della env variable: superata, il nome base si calcola ora sul contenuto del package)*
- **FR-008**: ~~Il tool DEVE modificare per l'agent selezionato: `bot.name`, `description`, `applicationmanifestinformation` (manifest Teams se presente), env variable~~ — **superato**. Il tool non modifica record Dataverse (FR-067); il manifest Teams non è nel package (FR-079); l'unico campo patchato è `<name>` in `bot.xml` (FR-069)
- **FR-009**: Il tool DEVE mostrare durante l'apply ogni campo modificato con nome tecnico, valore prima e valore dopo
- **FR-010**: Il tool DEVE richiedere conferma esplicita dell'utente prima di qualsiasi operazione di scrittura
- **FR-011**: Il tool DEVE creare un backup automatico dello stato corrente di ogni agent prima di ogni operazione
- **FR-012**: Il tool DEVE offrire scelta rollback / mantieni stato parziale in caso di errore durante l'operazione
- **FR-013**: Il tool DEVE rilevare automaticamente quali canali sono attivi per ogni agent (Teams, M365 Copilot, altri)
- **FR-014**: Il tool DEVE indicare chiaramente per ogni agent se è richiesto un Publish per attivare il rename sui canali
- **FR-015**: Il tool DEVE permettere il Publish come step separato post-rename, per singolo agent o bulk
- **FR-016**: Il tool DEVE registrare ogni operazione nel log con: timestamp, utente, environment, solution, agent, campo, valore prima → dopo, esito
- **FR-017**: Il tool DEVE permettere l'esportazione del log in formato CSV o JSON
- **FR-021**: Il log e i backup pre-operazione DEVONO essere salvati su file locale in una cartella configurabile dall'utente (default: cartella dati PPTB), conservati per 30 giorni per default, e non devono mai essere trasmessi a servizi esterni. L'utente può scaricarli o cancellarli manualmente dalla sezione log del tool.
- **FR-018**: Il tool DEVE gestire errori di permessi con messaggi specifici che indicano il ruolo necessario
- **FR-019**: Il tool DEVE validare che nome base + suffisso non superi 30 caratteri (limite manifest Teams) e avvisare preventivamente nella preview
- **FR-020**: Il tool DEVE supportare multi-connection PPTB per operare su environment diversi in parallelo
- **FR-022**: Il campo input del suffisso DEVE avere un pulsante "Clear" per azzerare il valore. Il pulsante DEVE essere disabilitato quando il campo è vuoto e riabilitarsi non appena l'utente digita
- **FR-023**: Lo scope di un'operazione di rename DEVE essere il **singolo agent selezionato**, non l'intera solution. Il flusso è: tabella solution → dettaglio solution con lista agent → selezione agent → suffisso → preview → apply
- **FR-024**: Il tool DEVE ricavare la lista degli agent dalla tabella `bot` (fonte autoritativa), MAI partendo da `solutioncomponent`. L'appartenenza a una solution è un metadato arricchito a parte: un fallimento nella risoluzione della solution NON DEVE mai nascondere un agent dalla lista
- **FR-025**: Il tool NON DEVE filtrare `solutioncomponent` per un `componenttype` **supposto**. La membership DEVE essere risolta filtrando per `objectid` sugli id dei bot già noti, oppure leggendo la colonna documentata `bot.solutionid`. *(Aggiornamento 2026-10-15: i valori reali sono ora misurati — 10212 = Agent, 10213 = Agent component — vedi FR-092. La cautela resta: misurato ≠ documentato.)*
- **FR-026**: La tabella solution DEVE mostrare solo solution **visibili** (`isvisible`), **non di sistema** (Default/Active/Basic e qualsiasi "Default Solution") e che **contengono almeno un agent**, filtrate per tipo secondo FR-061. *(Versione originale: solo unmanaged. In UAT e PROD le solution sono managed, quindi quel filtro fisso mostrava "No solutions found" pur avendo trovato gli agent.)*
- **FR-061**: La tabella DEVE offrire un selettore di tipo **Unmanaged / Managed / All** con il numero di solution per ciascun tipo. Finché l'utente non sceglie, il tipo è deciso dai dati e non dal nome dell'environment: si apre su Unmanaged se esistono unmanaged con agent, altrimenti su Managed. La scelta esplicita ha la precedenza e si azzera al cambio di connessione. La colonna Type compare solo nella vista All, dove non è ridondante. Se il tipo selezionato non ha risultati ma l'altro sì, il messaggio lo dice ("2 managed solutions have agents — switch the type above")
- **FR-027**: L'intestazione della tabella solution DEVE restare ancorata in cima durante lo scroll, senza che le righe scorrano sopra di essa
- **FR-028**: Il tool DEVE offrire una ricerca testuale unica che filtra in parallelo su: nome e nome univoco della solution, publisher, **e nomi degli agent contenuti**. Se il match avviene su un agent, la solution DEVE comparire comunque, con gli agent corrispondenti mostrati sotto la riga ed evidenziati. Cliccando un agent trovato si DEVE saltare direttamente al rename di quell'agent
- **FR-029**: Il tool DEVE esporre una voce "Agents without a solution" che raggruppa gli agent non appartenenti a nessuna solution unmanaged, così che nessun agent dell'environment risulti irraggiungibile
- **FR-030**: Qualsiasi testo proveniente da Dataverse (nomi solution, nomi agent, publisher) DEVE essere sottoposto a escape HTML prima del rendering, inclusa l'evidenziazione dei risultati di ricerca
- **FR-031**: L'interfaccia DEVE occupare l'intera larghezza disponibile del contenitore PPTB. Sono vietati wrapper a larghezza fissa che lasciano spazio morto (rif. Constitution, Principio VII)
- **FR-032**: Il layout DEVE essere responsive e degradare senza scroll orizzontale di pagina: sotto 1100px si riduce il pannello log, sotto 900px l'header si impila e le colonne secondarie (Version, Publisher) vengono nascoste, sotto 720px il pannello log viene nascosto e la colonna Name omessa
- **FR-033**: Il tool DEVE esporre un breadcrumb che riflette il percorso completo `Solutions › {Solution} › {Agent} › Preview › Apply`. Ogni segmento tranne l'ultimo DEVE essere cliccabile e navigare esattamente a quel livello, permettendo di tornare indietro di un solo passo senza riportare alla root
- **FR-034**: Il breadcrumb DEVE restare completo anche quando l'agent è selezionato direttamente dai risultati di ricerca: il livello solution viene popolato dalla solution dell'agent, così il passo indietro atterra su di essa
- **FR-035**: Il breadcrumb è l'affordance primaria di ritorno; i pulsanti "torna alla root" dedicati sono stati rimossi in quanto ridondanti
- **FR-036**: Tutte le intestazioni della tabella solution DEVONO essere cliccabili per ordinare, con indicatore di direzione (▲/▼) sulla colonna attiva. Il click sulla stessa colonna inverte la direzione; il click su una colonna diversa applica un default sensato (decrescente per Agents/Created/Version, crescente per i campi testuali). Ordinamento iniziale: Agents decrescente
- **FR-037**: L'ordinamento DEVE operare sul valore sottostante, non sulla stringa visualizzata: le date si ordinano per timestamp (non per il testo "1 week ago" vs "26/01/2026") e le versioni segmento per segmento (`1.0.0.10` > `1.0.0.6`, non confronto lessicografico)
- **FR-038**: La colonna Created DEVE esporre la data assoluta completa in tooltip, così l'ordinamento resta verificabile anche sulle righe che mostrano una data relativa
- **FR-039**: Il dettaglio solution DEVE essere un pannello a tutta altezza e larghezza con: intestazione (nome, numero agent, nome univoco), barra metadati (versione, publisher, prefix, creazione) e una tabella agent che occupa lo spazio restante con scroll interno e intestazione sticky. Colonne: Agent, Status (`Active`/`Inactive` da `bot.statecode`), Last published (`bot.publishedon`, oppure "Never published"), Modified, Created. Il click su una riga avvia il rename di quell'agent
- **FR-040**: La schermata di configurazione suffisso DEVE essere divisa in due pannelli affiancati — form (campo + valori rapidi) e anteprima live — con sotto la lista degli effetti dell'apply. In schermi stretti (< 900px) i pannelli si impilano
- **FR-041**: L'anteprima DEVE aggiornarsi a ogni tasto premuto, senza interrogare Dataverse, mostrando: nome attuale, nome base (solo se diverso, cioè quando un suffisso corrente è stato rimosso), nome nuovo con il suffisso evidenziato, stato della modifica (`No change` / `Suffix added` / `Suffix changed` / `Suffix removed`) e un indicatore di lunghezza rispetto al limite di 30 caratteri. Oltre il limite compare un warning **non bloccante** (FR-019)
- **FR-042**: Il pannello form DEVE indicare per quale environment si sta impostando il suffisso (es. "Suffix for DEV"), poiché ogni environment mantiene un valore proprio, e DEVE evidenziare il valore predefinito attivo quando coincide con il testo digitato
- **FR-043**: Lo step suffisso NON DEVE eseguire scritture. Prima di proseguire DEVE però elencare in linguaggio semplice le due scritture che l'apply eseguirà: (1) variabile d'ambiente — da creare / da aggiornare con `vecchio → nuovo` / già corretta, con nome schema e solution di appartenenza; (2) nome dell'agent — `attuale → nuovo` oppure "nessuna modifica". L'elenco riflette solo ciò che l'apply scrive davvero (`bot.name` e la variabile)
- **FR-044**: Il pulsante Back DEVE salire di un solo livello (Suffix → dettaglio Solution, Preview → Suffix). Il suffisso digitato DEVE essere conservato se l'utente torna indietro e riapre lo step per lo stesso agent; cambiando agent la bozza viene azzerata
- **FR-045**: La ricerca della variabile d'ambiente DEVE ignorare le risposte arrivate dopo che l'utente è passato a un altro agent (nessuna sovrascrittura dello stato con dati di un agent precedente) e, in caso di errore, mostrare il messaggio con un pulsante Retry
- **FR-046**: I tre step del flusso (Suffix, Preview, Apply) DEVONO mostrare un indicatore di avanzamento a tre passi con il passo corrente evidenziato e quelli precedenti marcati come completati
- **FR-047**: Entrando in una lista (tabella solution o dettaglio solution) il tool DEVE rileggere i dati da Dataverse. La vista viene disegnata subito dalla cache e aggiornata sul posto all'arrivo dei dati, con un indicatore "Updating…" visibile solo durante la lettura. Il re-render NON DEVE toccare i form (nessuna perdita di ciò che l'utente sta digitando) e DEVE preservare lo scroll della tabella
- **FR-048**: Un refresh in background che fallisce DEVE mantenere gli ultimi dati validi e registrare un warning nel log, senza svuotare la tabella. Refresh ravvicinati (< 2 s) vengono saltati; il refresh manuale e quello a fine apply sono sempre eseguiti. Il log segnala "changes detected" solo se i dati sono davvero cambiati
- **FR-049**: Aprendo lo step suffisso il tool DEVE rileggere da Dataverse il nome corrente dell'agent insieme alla variabile, perché l'anteprima è calcolata su quel nome. Se l'agent non esiste più, mostra un errore con Retry invece di un'anteprima su dati obsoleti
- **FR-050**: Il tool DEVE distinguere l'origine del valore del suffisso: *current value* salvato nell'environment oppure *default value* della definizione (usato quando non esiste un current value). Quando si ricade sul default lo dichiara esplicitamente sotto il campo e nell'elenco degli effetti ("Save "X" as the current value"), perché salvare un current value è una scrittura reale anche se il testo coincide. Aprire un agent dalla lista parte sempre dal valore letto ora da Dataverse, mai da una bozza precedente; la bozza sopravvive solo a Back/breadcrumb
- **FR-052**: Il suffisso da togliere dal nome dell'agent NON DEVE coincidere per forza con il valore salvato nella variabile: i due possono divergere (valore cancellato, nome modificato a mano). Se il nome termina con ` [X]` (solo parentesi quadre, il formato che il tool scrive, 1–20 caratteri) e `X` è diverso dal valore salvato, il tool DEVE mostrare nello step suffisso un avviso "Suffix out of sync" che spiega che un nuovo suffisso verrebbe accodato al vecchio (`Agent [DEVS] [DEV]`) e offrire due azioni esplicite: **Replace [X]** (lo considera il suffisso corrente: il valore digitato lo sostituisce, campo vuoto lo rimuove) e **Keep [X] and save it to the variable** (precompila il campo con `X`, il nome resta invariato e la variabile viene riallineata). Dopo la scelta l'avviso diventa una conferma con **Undo**. Il tool NON DEVE mai applicare questa correzione in automatico, perché un nome può legittimamente finire con `[…]` (es. `Report [v2]`); le parentesi tonde non vengono segnalate per lo stesso motivo
- **FR-053**: Lo stato di avanzamento dell'apply DEVE usare marcatori circolari coerenti con lo stepper (in attesa: cerchio vuoto; in corso: cerchio con spinner; riuscito: cerchio verde con ✓; fallito: cerchio rosso con ✕), mai emoji, che a seconda del font si rendono come quadratini. Ogni voce (ogni agent e la variabile) passa da "in corso" a esito finale mentre l'operazione avanza
- **FR-054**: Il backup DEVE essere salvato **prima** della prima scrittura. Se non è possibile salvarlo, il tool NON DEVE modificare nulla e DEVE spiegarne il motivo: nessun backup, nessuna scrittura (implementa FR-011)
- **FR-055**: Il backup DEVE contenere: id, data/ora, environment, solution, per ogni agent il nome prima e dopo, e per la variabile d'ambiente nome schema, se la definizione esisteva, se esisteva un current value e quale, il valore nuovo e gli id dei record. Gli id dei record creati durante l'apply vengono aggiunti man mano, anche se un passo successivo fallisce, così un apply interrotto resta completamente annullabile. *(Descrizione e manifest Teams non sono ancora scritti dal tool, quindi non sono ancora nel backup: vanno aggiunti insieme alla loro scrittura.)*
- **FR-056**: A fine apply il tool DEVE mostrare un esito: se riuscito, **Undo this change** e **View history**; se qualche passo è fallito, **Roll back everything** oppure **Keep current state** (implementa FR-012). L'apply DEVE funzionare, e il pulsante di ritorno abilitarsi, anche quando l'agent non appartiene a nessuna solution
- **FR-057**: Il rollback DEVE ripristinare ciò che l'apply ha scritto: il nome dell'agent; la variabile come segue — creata dall'apply → cancellati prima il valore e poi la definizione; current value già esistente → ripristinato il valore precedente; era in uso solo il default → rimosso il current value aggiunto, lasciando intatti definizione e default. Il rollback DEVE essere idempotente (un record già inesistente in una cancellazione non è un errore), DEVE riportare ogni passo fallito con il motivo e DEVE marcare il backup come `rolled-back` solo se tutti i passi sono riusciti
- **FR-058**: Prima di annullare il tool DEVE mostrare in linguaggio semplice l'elenco delle azioni e avvisare quando il rollback sovrascriverebbe modifiche successive: agent rinominato di nuovo dopo il backup, agent non più esistente, cancellazione di una variabile (che la rimuove anche dalla solution). Se i nomi correnti non si possono verificare, lo dichiara invece di tacere
- **FR-059**: Il tool DEVE offrire una vista **History** con tabella (When, Environment/solution, Agent prima → dopo, Variable, Status, azioni **Restore**, **Export**, **Delete**), **Export all** e un contatore sul pulsante. **Restore** DEVE essere disabilitato, con spiegazione nel tooltip, se il backup è già annullato, appartiene a un altro environment rispetto alla connessione attiva, o non ha modificato nulla. L'export usa il dialog di salvataggio di PPTB
- **FR-060**: I backup DEVONO restare sul dispositivo (store `settings` locale del tool di PPTB), essere conservati 30 giorni (nascosti in lettura, eliminati alla scrittura successiva) con un massimo di 200 voci, e non essere mai trasmessi all'esterno. Le scritture DEVONO essere serializzate e rilette a ogni salvataggio, perché più copie del tool possono essere aperte insieme (implementa FR-021 con la deviazione indicata nelle clarifications)
- **FR-062**: Su una solution **managed** il tool NON DEVE tentare `AddSolutionComponent` (la documentazione Microsoft: "You can't add or remove solution components in a managed solution"): se la variabile deve essere creata, viene creata fuori dalla solution, con un warning nel log e una dicitura esplicita nell'elenco "What happens when you apply". Nel caso normale la definizione non va creata affatto: arriva con la solution dall'environment in cui è stata creata, insieme al suo default value
- **FR-063**: Il tool DEVE rilevare in anticipo, per ogni agent, se Dataverse ne rifiuterà la modifica perché appartiene a una managed solution il cui publisher ha disattivato la managed property **"Can be customized"** (`bot.ismanaged = true` **e** `bot.iscustomizable.Value = false`). La lettura è best effort: se non riesce o la risposta non ha la forma attesa l'agent resta "sconosciuto" e nulla viene bloccato su una supposizione. Un agent bloccato DEVE essere segnalato con un chip **Locked** nella tabella agent, con un banner nello step suffisso e nella Preview che spiega il motivo e cosa chiedere al publisher (attivare la proprietà nell'environment sorgente prima dell'export come managed e importare la solution aggiornata), e il pulsante di avanzamento diventa **Try anyway** invece di essere disabilitato, perché il rilevamento potrebbe sbagliare
- **FR-064**: Un apply il cui rename viene rifiutato NON DEVE cambiare nulla. Se nessun agent è stato rinominato, la variabile d'ambiente NON DEVE essere scritta (altrimenti resterebbe in avanti rispetto al nome: variabile `UAT`, agent `[DEV]`), il backup inutile viene rimosso e l'esito dice "Nothing was changed" con il motivo. Un errore riconosciuto come managed property è spiegato come tale; gli altri mostrano il messaggio di Dataverse, troncato, senza etichettarli come "locked"
- **FR-065**: Il backup DEVE registrare per ogni agent se il rename è riuscito (`renamed`) e per la variabile se è stata scritta (`written`). Il rollback NON DEVE includere nel piano ciò che non è stato scritto; se il flag manca (apply interrotto, backup di versioni precedenti) il passo è incluso per prudenza
- **FR-066**: Il rollback NON DEVE scrivere il nome di un agent che ha già il nome di destinazione: la scrittura è inutile e, su un agent bloccato, fallirebbe con la stessa restrizione che aveva fermato il rename originale. Se tutti i passi sono già a posto il backup viene marcato come annullato con il messaggio "Everything is already as it was before this change"
- **FR-051**: Dopo un apply riuscito la cache locale DEVE riflettere i nomi appena scritti e i dati vanno riletti in background. L'apply DEVE funzionare anche per gli agent senza solution (il pulsante "Back to Solutions" DEVE abilitarsi comunque)

#### Processo di packaging *(revisione 2026-10-15)*

- **FR-067**: Il tool NON DEVE eseguire operazioni di scrittura su `bot`, `botcomponent` o sulle
  environment variable di **nessun** environment. Il rename DEVE avvenire esclusivamente modificando
  il package di una solution esportata. **Motivo**: un `UPDATE` su un componente che proviene da una
  managed solution crea un *unmanaged layer* nell'environment di destinazione; quel layer sta sopra
  il managed e da quel momento vince su ogni upgrade successivo della solution, scollegando
  l'ambiente dal package. Il problema non è che l'`UPDATE` possa fallire: è che possa **riuscire**
- **FR-068**: Il tool DEVE esportare la solution sorgente con `ExportSolution`, in **entrambe** le
  forme — `Managed: true` e `Managed: false` — producendo l'artifact set di FR-083. La solution
  sorgente DEVE essere
  **unmanaged** (una managed solution non è esportabile): se l'utente ne seleziona una managed, il
  tool DEVE spiegarlo e indicare di operare nell'environment in cui la solution è unmanaged. Il
  tool NON DEVE mai tentare di "convertire" un export unmanaged in managed modificando `<Managed>`
  in `solution.xml`, nemmeno quando i due export risultano identici a meno di quel flag (FR-084)
- **FR-069**: Il patch del nome DEVE modificare **esclusivamente** il contenuto dell'elemento
  `<name>` dentro `bots/<schemaname>/bot.xml`, un elemento per agent. Il tool NON DEVE modificare:
  `schemaname`, nomi di cartella, nomi di file, GUID, `[Content_Types].xml`, `customizations.xml`,
  né eseguire sostituzioni testuali globali sul package. **Motivo**: lo `schemaname` è l'identità
  del componente — cambiarlo trasforma l'upgrade in un agent nuovo e lascia il precedente orfano nel
  managed layer. Se `<name>` non è presente nel formato atteso, il tool DEVE fermarsi su
  quell'agent e indicare il file, invece di tentare una sostituzione approssimativa
- **FR-070**: Tutte le entry del package diverse da quelle esplicitamente patchate DEVONO restare
  **byte-identiche** all'export originale, e il tool DEVE poterlo dimostrare con un confronto
  entry-per-entry prima di consegnare il file
- **FR-071**: Il nome base DEVE essere calcolato sul valore letto **dal package**: se `<name>`
  termina con ` [X]` (1–20 caratteri tra parentesi quadre, il formato scritto dal tool) la parte
  finale viene rimossa, poi viene appeso ` [SUFFISSO]`. Rieseguire il packaging con lo stesso
  suffisso DEVE produrre lo stesso nome, mai `Agent [DEV] [UAT]`. Un suffisso vuoto rimuove il
  suffisso esistente e lascia il nome base
- **FR-072**: ~~Scrittura opzionale del `<defaultvalue>` della environment variable nel package per
  allineare il *Channel display name suffix* nativo~~ — **eliminata il 2026-10-15**. Il nome sui
  canali deriva già da `bot.name` (research §11), quindi il suffisso nativo si **sommerebbe** a
  quello del nome: `agenteTool1 [UAT] (UAT)`. Un solo meccanismo. Sostituita da **FR-089**
- **FR-073**: Il tool DEVE lasciare `<Version>` invariata per default e offrire un **bump** opzionale
  (incremento dell'ultimo segmento) in `solution.xml`, spiegando la differenza: stessa versione =
  *update*, versione superiore = *upgrade*
- **FR-074**: I file dell'artifact set DEVONO avere nomi parlanti e non ambigui:
  `{UniqueName}_{Version}_managed_{SUFFISSO}.zip`, `{UniqueName}_{Version}_unmanaged_{SUFFISSO}.zip`
  e, se conservati, `source_managed.zip` / `source_unmanaged.zip`. La cartella dell'operazione DEVE
  essere scelta tramite il dialog di PPTB e il tool DEVE chiedere conferma prima di sovrascrivere
  un artifact set esistente.
  **Nome della cartella dell'operazione** *(revisione 2026-10-16)*: DEVE essere leggibile senza
  decifrarlo, nella forma `{UniqueName} {Version} [{SUFFISSO}] - {AAAA-MM-GG hh-mm}`, per esempio
  `testAgentTool 1.0.0.2 [UAT] - 2026-10-15 21-38`; senza suffisso la parentesi riporta
  `[senza suffisso]`. L'`UniqueName` resta in testa perché le operazioni si raggruppino per
  solution nel file manager. I due punti fra ore e minuti NON sono ammessi da Windows nei nomi di
  cartella: si usa il trattino. Suffisso e `UniqueName` DEVONO essere ripuliti dei caratteri che
  il filesystem rifiuta (`\ / : * ? " < > |`) prima di comporre il nome.
  **Conseguenza nota**: la marca temporale si ferma al minuto, quindi due artifact set della stessa
  solution, versione e suffisso prodotti entro lo stesso minuto ricadono sulla **stessa cartella**.
  È il caso che la conferma di sovrascrittura di questo stesso FR deve intercettare
- **FR-075**: Prima di scrivere qualsiasi file il tool DEVE mostrare l'anteprima del patch: per ogni
  agent `nome nel package → nome nuovo`, il percorso esatto del file toccato, le opzioni attive
  (bump di versione) e l'elenco di ciò che **non** viene toccato
- **FR-076**: Un package può contenere più agent: il tool DEVE elencarli tutti e permettere di
  selezionare quali rinominare. Gli agent non selezionati DEVONO restare byte-identici
- **FR-077**: Dopo la scrittura il tool DEVE riaprire lo zip e verificare: integrità dell'archivio,
  numero di entry uguale all'originale e valore di `<name>` per ogni agent patchato. Lo zip DEVE
  essere dichiarato pronto solo se la verifica passa. **Nota implementativa**: ricostruendo
  l'archivio le entry vanno ricreate, non clonate dall'header dell'entry sorgente, altrimenti
  l'offset originale rende l'archivio illeggibile (vedi research §9)
- **FR-078**: Il tool DEVE conservare nell'artifact set anche i **package originali** non patchati
  (`source_managed.zip`, `source_unmanaged.zip`): sono gli artefatti di ripristino. La conservazione
  DEVE essere disattivabile quando lo spazio su disco conta (FR-088). Non esiste rollback su
  Dataverse perché non esiste scrittura su Dataverse (implementa, nel nuovo processo, l'intento di
  FR-011 e FR-012)
- **FR-079**: Il tool DEVE spiegare come arriva il nome sui canali, perché è la domanda che l'utente
  si pone subito dopo il rename: il manifest non viaggia nel package e non contiene alcun nome; il
  nome su **Teams e M365 Copilot** è una **copia di `bot.name` scattata al publish**, in ciascun
  environment (verificato, research §11). Di conseguenza **il patch del package copre anche i
  canali**, e il tool DEVE dirlo senza ambiguità — né promettendo più di quanto fa, né lasciando
  credere che serva un passaggio in più quando non serve
- **FR-080** *(critico)*: Il tool DEVE leggere `bots/<schemaname>/configuration.json` e riportare
  il valore di `publishOnImport`. **È il publish che porta il nome sui canali** (FR-079): con
  `true` l'agent si ripubblica da solo all'import e il nome patchato è effettivo ovunque; con
  `false` il tool DEVE avvisare in modo prominente che **senza un publish nell'ambiente di
  destinazione il nome cambia solo in Copilot Studio e resta quello vecchio su Teams e M365** — è
  esattamente il caso osservato sull'unico agent del tenant con nome e canale divergenti
- **FR-081** *(fase 2)*: Il tool DEVE poter importare lo zip prodotto in un environment connesso,
  mostrando l'avanzamento dell'import job fino all'esito. Il deploy DEVE essere **opzionale e
  separato**: la fase 1 si chiude con lo zip sul disco.
  **Vincolo sulla destinazione** *(revisione 2026-10-16)*: il deploy DEVE agire su una connessione
  **scelta dall'utente e diversa dalla sorgente**, come già previsto dall'Independent Test della
  User Story 5 (due connessioni, DEV e UAT, con UAT scelta come destinazione). Un pannello che
  assume la **connessione attiva** come destinazione è sbagliato: durante il packaging quella è
  l'ambiente di **origine**, e reimportarvi il managed vi stenderebbe sopra un layer managed —
  esattamente ciò che questo flusso esiste per evitare. Una prima implementazione faceva così ed
  è stata **rimossa** il 2026-10-16; `services/deploy.ts` resta disponibile. Finché PPTB non
  espone la scelta dell'environment dentro il tool, il deploy NON DEVE essere riproposto in UI:
  la fase 1 si chiude con l'artefatto su disco e l'import avviene nell'ambiente successivo
- **FR-082** *(fase 2)*: Prima di un deploy il tool DEVE rilevare se l'agent nell'ambiente di
  destinazione ha un **unmanaged layer** attivo e avvisare che, finché esiste, il nome del package
  non comparirà: va rimosso con **Remove active customizations**

#### Artifact set — il tool nel ruolo del pipelines host *(revisione 2026-10-15)*

- **FR-083**: Ogni operazione di packaging DEVE produrre un **artifact set**: una cartella di
  operazione contenente l'artefatto **managed** patchato e un `manifest.json`, e — quando
  l'opzione di FR-088 è attiva — anche l'**unmanaged** patchato e i due originali non patchati. Il principio è quello delle Power
  Platform Pipelines, che conservano la coppia managed+unmanaged per versione e la trattano come
  immutabile; la differenza è che qui l'artefatto lo produce il tool, perché il pipelines host
  **proibisce la modifica dell'artefatto** e quindi non può ospitare il patch del display name

  ```text
  testAgentTool_1.0.0.2_UAT_20261015-143022/
  ├── manifest.json
  ├── testAgentTool_1_0_0_2_managed_UAT.zip      ← da importare in UAT/PROD
  ├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    ← source control / environment di sviluppo
  ├── source_managed.zip                         ← export originale, non patchato
  └── source_unmanaged.zip                       ← export originale, non patchato
  ```

- **FR-084**: Il tool DEVE eseguire **due `ExportSolution` distinti** (`Managed: true` e
  `Managed: false`) e patchare ciascun archivio in modo indipendente. NON DEVE derivare un artefatto
  dall'altro modificando `<Managed>` in `solution.xml`, **nemmeno quando i due export risultano
  identici a meno di quel flag** (research §10): l'equivalenza vale per una solution di soli bot e
  cade appena entrano tabelle, form o managed property
- **FR-085**: Lo **stesso Patch Plan** DEVE essere applicato a entrambi gli archivi, con verifica
  post-scrittura indipendente su ciascuno (FR-077). Se la verifica fallisce anche su uno solo dei
  due, l'**intero artifact set** DEVE essere dichiarato non valido: un set in cui managed e
  unmanaged non concordano è peggio di nessun set
- **FR-086**: Il `manifest.json` DEVE contenere: identificativo e data/ora dell'operazione, utente,
  environment sorgente, solution, versione, publisher, suffisso applicato, agent patchati
  `prima → dopo`, opzioni attive, e per ogni file **nome, dimensione, numero di entry e hash
  SHA-256**. **Motivo**: due artefatti della stessa `<Version>` con suffissi diversi (uno per UAT,
  uno per PROD) non sono distinguibili dalla versione installata nel target; l'hash e il manifest
  sono ciò che rende l'operazione tracciabile senza ricorrere a un bump di versione, che creerebbe
  una deriva di versioni per ambiente
- **FR-087**: Il tool DEVE etichettare in modo inequivocabile l'artefatto unmanaged — nel manifest,
  nell'esito e nella History — come **non destinato a UAT/PROD**: importarlo in un ambiente a valle
  creerebbe una solution unmanaged, cioè esattamente il problema che il processo elimina
- **FR-088**: L'artifact set occupa fino a quattro archivi per operazione. Il tool DEVE mostrare lo
  spazio occupato, permettere di non conservare gli originali (FR-078) e applicare al set la stessa
  retention della History (30 giorni), eliminando la cartella insieme alla voce.
  **Set minimo e costo per archivio** *(revisione 2026-10-16)*: su PPTB **ogni archivio costa un
  dialog di salvataggio**, perché la piattaforma non espone una scrittura binaria (`writeText` è
  UTF-8, `saveFile` apre sempre) e vieta ai tool di invocare una shell. Quattro archivi significano
  quattro dialog, più quello della cartella: cinque interruzioni per un'operazione. L'artifact set
  **predefinito** è quindi il minimo che serve a importare — il **managed patchato** e il
  `manifest.json`, che essendo testo non costa alcun dialog — e un'unica opzione conserva le copie
  aggiuntive: l'unmanaged patchato (FR-087) e i due export originali (FR-078). L'opzione DEVE
  dichiarare il costo, e il riepilogo pre-export DEVE dire quanti archivi verranno scritti
- **FR-089**: Il tool NON DEVE scrivere il `<defaultvalue>` della environment variable né toccare
  in alcun modo il *Channel display name suffix* nativo. DEVE però **avvisare** quando quella
  feature risulta configurata sull'agent, perché sommata al suffisso nel nome produce un doppio
  suffisso sui canali (`agenteTool1 [UAT] (UAT)`): i due meccanismi sono alternativi. Il
  rilevamento è **best effort** — la posizione in cui la feature memorizza il riferimento alla
  variabile non è ancora stata confermata su un agent che la usi (research §11, "Non verificato");
  finché non lo è, l'avviso DEVE essere informativo e incondizionato, mai un blocco

#### Contenuto del package e publish *(revisione 2026-10-15)*

- **FR-090**: Il tool DEVE esporre `publishOnImport` (in `bots/<schemaname>/configuration.json`) con
  **tre stati**: *lascia com'è* (**default**), *forza `true`*, *forza `false`*. Per default il campo
  NON DEVE essere modificato, così il package resta fedele alla sorgente. Il tool DEVE mostrare il
  valore trovato per ogni agent e, quando il campo **è assente** (28 agent su 40 nell'environment di
  riferimento), dichiararlo **"non specificato"**: il comportamento di default all'import non è
  documentato da Microsoft (research §12) e il tool NON DEVE promettere un esito che non può
  garantire. Quando il risultato è che l'agent non verrà pubblicato, l'avviso di FR-080 DEVE essere
  prominente: senza publish il nome non arriva sui canali
- **FR-091**: L'anteprima DEVE **sempre** mostrare l'inventario completo del package — per tipo, con
  conteggio e nomi dove disponibili — perché l'artefatto è la **solution intera** e all'import
  viaggia tutto, non solo l'agent. Quando il package contiene componenti diversi dall'agent
  selezionato e dai suoi agent component (cloud flow, tabelle, connection reference, security role,
  canvas app…), il tool DEVE richiedere una **conferma esplicita** prima di produrre l'artefatto,
  elencando che cosa partirà. **Motivo**: Microsoft avverte che componenti non modificati inclusi in
  un update creano layer sopra quelli esistenti e possono disattivarne le customization; il tool non
  può impedirlo, ma non deve lasciarlo scoprire a valle
- **FR-092**: Per l'inventario di FR-091 il tool PUÒ usare i `componenttype` **misurati**
  (10212 = Agent, 10213 = Agent component) per classificare i componenti, mostrando come "tipo
  sconosciuto" i valori che non riconosce invece di ometterli. NON DEVE usarli per **trovare** gli
  agent: quella strada resta FR-024 (tabella `bot`, fonte autoritativa), perché un valore misurato
  non è un valore documentato e può cambiare

#### Strategia di export *(revisione 2026-10-15)*

- **FR-093**: Il tool DEVE usare `ExportSolution` (**sincrono**) come percorso primario e ripiegare
  **automaticamente** sul flusso asincrono — `ExportSolutionAsync` → polling di
  `asyncoperations(<id>)` su `statecode`/`statuscode` → `DownloadSolutionExportData` — quando il
  sincrono fallisce per timeout o errore di servizio. Il fallback NON DEVE richiedere una scelta
  all'utente: DEVE essere dichiarato mentre avviene ("l'export sta richiedendo più del previsto,
  passo alla modalità asincrona") e **registrato nel manifest** (FR-086). **Motivo misurato**
  (research §13): il sincrono costa 13 s sulla solution più piccola e 111 s sulla più pesante
  dell'environment, mentre l'asincrono costa **154 s a prescindere dalla dimensione**, perché il
  job resta in coda; usarlo sempre significherebbe ~5 minuti per ogni packaging
- **FR-094**: L'interfaccia DEVE mostrare l'avanzamento reale dell'export — quale dei due archivi è
  in corso, tempo trascorso, e in modalità asincrona lo stato del job — senza mai bloccarsi né
  sembrare ferma. Un'operazione che può durare **da 13 secondi a 5 minuti** non può essere
  rappresentata da uno spinner muto. Il polling DEVE interrogare **solo** `statecode` e
  `statuscode`: un `$select` con una colonna inesistente su `asyncoperations` risponde HTTP 400
- **FR-095**: La verifica di equivalenza del package (FR-070, FR-077) DEVE confrontare le **entry
  una per una** e NON DEVE mai usare la dimensione del file come criterio: il rezip produce un
  archivio di dimensione diversa (31.469 byte contro 32.544) a parità di contenuto, perché il
  compressore non è lo stesso. Un confronto sulle dimensioni darebbe un falso allarme a ogni
  esecuzione

#### Rete di sicurezza sul formato del package *(revisione 2026-10-15)*

- **FR-096**: Dopo l'export e **prima** del patch, il tool DEVE cercare il display name corrente di
  ogni agent come **testo esatto di un elemento XML o valore esatto di una stringa JSON** — mai
  come sottostringa — in tutte le entry del package. Attesa: **una sola occorrenza**, in
  `bots/<schemaname>/bot.xml` → `<name>` (verificato: 1 occorrenza su 34 entry). Se il nome compare
  altrove, il tool DEVE **bloccare** e mostrare i punti trovati, consentendo di procedere **solo
  dietro conferma esplicita** che quei punti non verranno patchati. **Motivo**: lo scenario
  pericoloso non è che `<name>` sparisca (FR-069 lo copre) ma che ne compaia un secondo, lasciando
  un patch incompleto e silenzioso. Il tool DEVE conoscere l'occorrenza legittima di
  `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` (nome base, non display name) e
  NON DEVE segnalarla quando il suffisso è vuoto e i due valori coincidono
- **FR-097**: Il tool DEVE calcolare a ogni export un'**impronta del formato** del package:
  `SolutionPackageVersion` e i timbri di versione della piattaforma in `solution.xml`, l'elenco
  delle cartelle di primo livello, i nomi degli elementi di `bot.xml` e `botcomponent.xml`, le
  chiavi di `configuration.json`. L'impronta DEVE essere confrontata **sia** con la baseline
  distribuita col tool (FR-098) **sia** con quella dell'ultimo packaging della stessa solution,
  registrata nel manifest. Uno scostamento — elemento nuovo, chiave nuova, cartella nuova, timbri
  cambiati — produce un **avviso non bloccante** che dice esattamente che cosa è cambiato.
  **Motivo**: Dataverse si aggiorna di continuo e i timbri cambiano da soli; bloccare su questo
  renderebbe il tool inutilizzabile, non segnalarlo lo renderebbe cieco
- **FR-098**: Il tool DEVE contenere una **baseline del formato** versionata insieme al codice —
  quella verificata il 2026-10-15 su `testAgentTool` (research §14) — così che il confronto
  funzioni anche alla **prima** esecuzione su un ambiente il cui formato è già cambiato. La
  baseline DEVE riportare la data e l'origine della verifica, e va aggiornata consapevolmente,
  mai in automatico.
  **Voci facoltative** *(revisione 2026-10-16)*: la baseline DEVE distinguere ciò che un package
  ha **sempre** da ciò che può legittimamente mancare, e l'assenza di una voce facoltativa NON
  DEVE produrre uno scostamento. Il confronto è simmetrico — segnala sia ciò che compare sia ciò
  che sparisce — quindi elencare una voce facoltativa fra quelle attese genera un falso allarme a
  ogni package che non la contiene. Sono facoltative, perché dipendono da come è fatta la singola
  solution e non dal formato:
  - `environmentvariabledefinitions/` fra le cartelle di primo livello: c'è solo se la solution
    contiene variabili d'ambiente, che per un agent non sono obbligatorie
  - `description` fra gli elementi di `botcomponent.xml`: colonna nullable, serializzata
    nell'export solo quando ha un valore
  - `publishOnImport`, `publishOnCreate`, `deferredProvisioning` fra le chiavi di
    `configuration.json`, per la stessa ragione
- **FR-099** *(fase 2)*: Dopo un deploy il tool DEVE rileggere `bot.name` dall'ambiente di
  destinazione e confrontarlo con il valore patchato. È la **controprova end-to-end**: se non
  coincidono, l'assunzione sul formato è caduta e il tool DEVE dirlo in modo esplicito, non
  dichiarare il deploy riuscito
- **FR-100**: Il `manifest.json` DEVE registrare l'impronta del formato e l'esito di tutti i
  controlli (occorrenze del nome trovate, scostamenti rilevati, conferme date dall'utente). È ciò
  che permette, mesi dopo, di sapere su quale formato è stato prodotto un artefatto — e, in caso di
  segnalazione a Microsoft, di dimostrare che è stato toccato **un solo elemento**, con
  `source_managed.zip` intatto accanto per riprodurre il problema senza il patch
- **FR-101**: Il tool NON DEVE modificare `botid`, `schemaname` né alcun GUID, perché sono
  l'identità del componente e **l'unica cosa su cui si reggono le dipendenze**: verificato che i
  record di dipendenza contengono esclusivamente GUID e `componenttype`, **nessun campo con un
  nome** (research §15). Ne discende che il rename del display name non può rompere alcuna
  dipendenza — ed è il motivo per cui l'operazione è sicura, non una speranza
- **FR-102**: La documentazione del tool DEVE dichiarare apertamente che Microsoft non supporta la
  modifica manuale dei file estratti da una solution, e che il tool lo fa comunque su **un solo
  elemento**. NON DEVE presentare l'operazione come supportata. La dichiarazione DEVE accompagnare
  anche l'artefatto prodotto, nel `manifest.json`, così che chi lo importa mesi dopo sappia cosa ha
  in mano. **Motivo**: è una scelta consapevole presa il 2026-10-15 dopo aver valutato
  l'alternativa formalmente ineccepibile (build environment); una scelta consapevole si documenta,
  non si nasconde

#### Requisiti superati dalla revisione del 2026-10-15

Sostituiti dal processo di packaging; restano a verbale perché descrivono il percorso fatto.

| Requisito | Motivo del superamento |
|---|---|
| FR-003, FR-004 | La env variable non viene più creata né scritta in Dataverse dal tool. Resta rilevante solo come `<defaultvalue>` nel package (FR-072) |
| FR-008 | Nessuna scrittura su Dataverse. In più, la parte su `applicationmanifestinformation` era costruita su un presupposto **sbagliato**: quel campo non contiene alcun nome, solo identificativi (verificato, research §11) |
| FR-009, FR-010 | Sostituiti dall'anteprima del patch e dalla conferma prima della scrittura del file (FR-075) |
| FR-011, FR-012, FR-054–FR-060, FR-064–FR-066 | Backup e rollback transazionali su Dataverse: non più necessari, l'artefatto di ripristino è il package originale (FR-078). La History diventa storico dei packaging |
| FR-013, FR-014, FR-015 | Rilevamento canali e PvaPublish: l'agent si ripubblica all'import (FR-080) |
| FR-043, FR-045, FR-049, FR-050, FR-052, FR-062 | Riguardano la lettura/scrittura della env variable come fonte del suffisso: il suffisso è ora un input del packaging |
| FR-063 | Managed property "Can be customized": irrilevante, il tool non modifica componenti managed |
| FR-019 | **Riabilitato il 2026-10-15**: il nome del canale deriva da `bot.name`, quindi il limite di 30 caratteri del manifest Teams torna pertinente. Resta un **avviso non bloccante**, e dichiarato come non verificato: nel tenant non esiste un agent con nome lungo su cui misurare se venga troncato (research §11) |


### Key Entities

- **Agent** (`bot`): nome, stato, date, `schemaname` (**immutabile, identità del componente**), `solutionid`. In Dataverse è la fonte autoritativa per *elencare* gli agent dell'environment; il valore che viene rinominato, però, è quello **nel package**, non questo record
- **Solution**: nome univoco, display name, publisher prefix e nome publisher, versione, data creazione, `ismanaged`, `isvisible`, conteggio agent, env variable suffisso
- **Environment Variable** (`{prefix}_AgentDisplaySuffix`): valore suffisso per l'ambiente, String, parte della solution
- **Solution Package**: l'archivio restituito da `ExportSolution`. Entità di lavoro centrale del tool. Parti rilevanti: `solution.xml` (`UniqueName`, `Version`, `Managed`, publisher e prefix), `bots/<schemaname>/bot.xml` (**`<name>` = display name, unico punto da patchare**), `bots/<schemaname>/configuration.json` (`publishOnImport`, canali), `environmentvariabledefinitions/<schema>/environmentvariabledefinition.xml` (`<defaultvalue>` per il suffisso canali). Vedi research §9 per l'anatomia verificata
- **Patch Plan**: ciò che il tool si appresta a scrivere nel package, mostrato prima di scrivere: per ogni agent `file, nome prima, nome dopo`; opzioni attive (defaultvalue della env variable, bump di versione); elenco esplicito di ciò che resta intatto
- **Packaging Record**: la voce di History di un packaging — data/ora, environment sorgente, solution, versione, tipo di export (managed/unmanaged), suffisso, agent patchati `prima → dopo`, percorso del package originale e di quello patchato, esito della verifica post-scrittura. Sostituisce l'entità *Backup*: non essendoci scritture su Dataverse non c'è nulla da annullare, l'artefatto di ripristino è il package originale
- **Log Entry**: timestamp, utente, environment, solution, agent, campo, valore prima, valore dopo, esito

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utente produce lo zip pronto all'import per tutti gli agent di una solution in meno di 5 minuti, indipendentemente dal numero di agent
- **SC-002**: Il packaging è idempotente — rieseguirlo con lo stesso suffisso produce lo stesso nome nel package, mai un suffisso accodato a un altro
- **SC-003**: Non esiste uno stato parziale da annullare: fino alla scrittura dello zip nessun file è stato prodotto e nessun environment è stato modificato
- **SC-004**: Il tool elimina il 100% degli errori di naming post-deploy dovuti a operazioni manuali su Copilot Studio
- **SC-005**: Un utente che non conosce la differenza tra display name Copilot Studio e nome su Teams capisce, dopo un solo uso del tool, che cosa cambia nel package e che cosa invece dipende dal publish e dal suffisso nativo
- **SC-006**: Ogni operazione è tracciata nel log — zero operazioni non registrate
- **SC-007**: Dopo l'import di uno zip prodotto dal tool, l'agent nell'ambiente di destinazione ha il nome corretto e **Solution Layers mostra soltanto il layer managed della solution** — nessun unmanaged layer, nessun "Remove active customizations" da fare *(versione originale: rename su managed solution via PATCH — abbandonata, vedi clarifications 2026-10-15 e research §3)*
- **SC-008**: Nello zip prodotto, le entry diverse da quelle patchate sono **byte-identiche** all'export originale — verificabile con un confronto entry-per-entry (misurato: 33 su 34 nel test del 2026-10-15)
- **SC-009**: Lo zip prodotto viene accettato dall'import di Dataverse senza errori di package, e l'agent risulta aggiornato — **non duplicato**: lo `schemaname` non cambia mai
- **SC-010**: Zero scritture del tool su `bot`, `botcomponent` o environment variable in qualunque environment — verificabile dal log delle chiamate
- **SC-014**: Se Microsoft cambia la serializzazione degli agent, il tool se ne accorge **prima** di
  produrre un artefatto sbagliato: si ferma se non riconosce il formato, blocca se il nome compare
  in un punto nuovo, avvisa se qualcosa è cambiato senza conseguenze. In nessun caso produce in
  silenzio un package patchato a metà
- **SC-013**: Nessun utente scopre a valle che l'import ha portato con sé altri componenti:
  l'inventario è sempre visibile prima di produrre l'artefatto, e se c'è altro oltre all'agent
  è stato confermato esplicitamente
- **SC-012**: Dopo l'import nell'ambiente di destinazione e il publish dell'agent, il nome corretto
  compare **sia in Copilot Studio sia su Teams/M365 Copilot**, senza nessun intervento aggiuntivo e
  senza suffissi doppi
- **SC-011**: Ogni operazione produce un artifact set completo e coerente: managed e unmanaged
  patchati allo stesso modo, originali conservati, `manifest.json` con l'hash di ogni file — a
  partire dal quale è sempre possibile dire **quale file è stato importato dove**, anche quando due
  artefatti condividono la stessa `<Version>`

---

## Assumptions

- **La modifica manuale dei file di una solution non è supportata da Microsoft**, e il tool la fa
  comunque, su un solo elemento. Scelta presa consapevolmente il 2026-10-15, con l'alternativa
  formalmente ineccepibile (build environment) valutata e scartata per costo operativo. Le basi
  della scelta: nessuna dipendenza può rompersi (dimostrato), viene toccato un solo elemento
  (verificabile), l'export originale resta disponibile (riproducibilità)
- **Il formato interno del package non è un contratto documentato da Microsoft.** Il rischio
  tecnico è mitigato dalla rete di FR-096 → FR-100; quello formale — un ticket su un environment
  in cui è stato importato un package modificato — resta, e la mitigazione è procedurale: il
  manifest documenta l'unico elemento toccato e l'export originale resta nell'artifact set, quindi
  il problema è sempre riproducibile senza il patch
- **L'artefatto è sempre la solution intera**: Power Platform non consente deploy parziali. La
  mitigazione è organizzativa (una solution dedicata per agent) più informativa (inventario e
  conferma, FR-091) — il tool non può e non deve spezzare la solution
- **Il deploy avviene per import manuale della solution**, non tramite Power Platform Pipelines
  native (confermato il 2026-10-15). Il tool prende quindi il posto dell'**export manuale**: stesso
  processo di distribuzione di oggi, con in più il rename nel package e la tracciabilità
  dell'artifact set (FR-083, FR-086), che un export manuale non lascia
- **Se in futuro si adottassero le Power Platform Pipelines native**, il vincolo tornerebbe valido:
  il pipelines host proibisce la modifica dell'artefatto (*"prohibits any tampering or
  modification"*) e distribuisce lo stesso artefatto managed a tutti gli stage, quindi un package
  patchato non potrebbe entrarvi. In quello scenario: artifact set importato fuori dalla pipeline,
  oppure ripiego sul suffisso nativo dei canali. Da rivalutare, non da ignorare
- Le solution in UAT e PROD sono managed
- Il tool opera su singolo tenant — nessuna gestione cross-tenant
- Il numero di environment per progetto è variabile (minimo 3-4) — il tool non assume struttura fissa DEV/UAT/PROD
- La feature nativa Microsoft *Channel display name suffix* è in **preview** (documentazione aggiornata a ottobre 2026) e copre **solo Teams e M365 Copilot**: non cambia il display name in Copilot Studio, che resta il problema risolto da questo tool. Le due cose sono complementari, non alternative
- Il formato del solution package resta quello verificato il 2026-10-15 (research §9). Il tool DEVE fallire in modo esplicito se non ritrova `<name>` in `bot.xml`, invece di adattarsi a tentoni
- Il nome base dell'agent non è standardizzato — varia per progetto e cliente
- I publisher prefix delle solution sono già configurati negli environment degli utenti
- Il tool è usato da utenti con diversi livelli di esperienza tecnica — l'UX deve essere autoesplicativa
- La description dell'agent (`botcomponent` tipo 15 — Custom GPT) non viene toccata: nel package il suo `<name>` porta il nome base dell'agent, e modificarlo non è necessario per il display name
- I package esportati contengono l'intera definizione dell'agent (topic, istruzioni, icona): sono dati potenzialmente sensibili e restano sul dispositivo dell'utente, mai trasmessi a servizi esterni
