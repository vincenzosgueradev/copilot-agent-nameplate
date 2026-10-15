# Feature Specification: Agent Rename Manager

**Feature Branch**: `001-agent-rename-manager`

**Created**: 2026-10-14

**Status**: Draft

**Input**: Tool PPTB per rinominare agent Copilot Studio cross-environment tramite environment variable per solution

---

## Overview

Agent Rename Manager è un tool per Power Platform ToolBox (PPTB) che risolve il problema del naming degli agent Copilot Studio tra ambienti DEV, UAT e PROD.

Quando un agent viene deployato tramite Power Platform Pipelines da DEV a UAT o PROD, arriva nell'ambiente target con lo stesso nome dell'ambiente sorgente. Non esiste oggi nessuno strumento — né nell'Admin Center né nel marketplace PPTB — che permetta di rinominare gli agent in modo consistente, tracciato e sicuro su più ambienti.

Il tool usa una **environment variable per solution** (`{publisher_prefix}_AgentDisplaySuffix`) per guidare il rename: il valore della variabile viene concatenato al nome base dell'agent e applicato a tutti i campi rilevanti — nome Copilot Studio, manifest Teams, description — in modo idempotente e completamente trasparente.

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

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Setup solution e configurazione suffisso (Priority: P1)

Un maker o admin apre il tool dopo aver deployato una solution in UAT. Vuole configurare il suffisso ambiente per tutti gli agent della solution.

**Why this priority**: Senza env variable configurata il rename non è possibile. È il prerequisito di tutto il resto.

**Independent Test**: Aprendo il tool su un environment con una solution che non ha env variable, si riceve il warning e si riesce a creare la variabile guidati dal tool. Al termine la solution è "pronta" senza warning.

**Acceptance Scenarios**:

1. **Given** una solution senza `{prefix}_AgentDisplaySuffix`, **When** l'utente apre la solution nel tool, **Then** il tool mostra un warning visibile con spiegazione e pulsante per avviare la creazione guidata
2. **Given** il wizard di creazione env variable, **When** l'utente seleziona il publisher e conferma, **Then** il tool crea `{publisher_prefix}_AgentDisplaySuffix` (String) nella solution con valore iniziale vuoto
3. **Given** la env variable appena creata, **When** l'utente seleziona un valore dal selettore (es. `(UAT)`), **Then** il valore viene salvato nella env variable e la solution non mostra più warning
4. **Given** una solution con env variable già configurata, **When** l'utente apre la solution, **Then** nessun warning — mostra direttamente il valore attuale del suffisso

---

### User Story 2 — Rename preview e apply (Priority: P1)

Dopo aver selezionato un agent e configurato il suffisso, l'utente vuole vedere l'anteprima del rename e applicarlo.

**Why this priority**: È il cuore del tool — il valore principale per l'utente.

**Independent Test**: Dato un environment con solution configurata, l'utente seleziona un agent, vede la preview con nome attuale → nome finale, conferma, e il nome viene aggiornato in Copilot Studio UI immediatamente.

**Acceptance Scenarios**:

1. **Given** un agent selezionato con suffisso configurato, **When** l'utente accede alla sezione rename, **Then** vede: nome attuale | nome finale | campi che verranno modificati
2. **Given** la tabella di preview, **When** l'utente clicca "Applica", **Then** il tool mostra dialog di conferma con riepilogo operazioni prima di eseguire
3. **Given** conferma dell'utente, **When** il tool applica le modifiche, **Then** mostra per ogni agent in tempo reale: `bot.name` aggiornato ✅, `description` aggiornata ✅, env variable aggiornata ✅
4. **Given** agent con Teams configurato, **When** il rename è applicato, **Then** il tool mostra chiaramente che il manifest Teams richiede Publish separato per aggiornarsi nel canale
5. **Given** agent senza canali che richiedono Publish, **When** il rename è applicato, **Then** il tool indica che le modifiche sono già attive senza ulteriori azioni

---

### User Story 3 — Backup e gestione errori (Priority: P1)

Prima di ogni operazione il tool salva lo stato corrente. In caso di errore parziale l'utente sceglie se fare rollback o mantenere lo stato raggiunto.

**Why this priority**: Operazione su ambiente managed in produzione — la sicurezza è non negoziabile.

**Independent Test**: Simulando un errore al 3° agent su 5, l'utente vede chiaramente quali agent sono stati modificati e quali no, e può scegliere rollback completo o confermare lo stato parziale.

**Acceptance Scenarios**:

1. **Given** l'utente sta per applicare il rename, **When** conferma, **Then** il tool salva automaticamente un backup dello stato corrente (nome dell'agent e stato della variabile d'ambiente) prima di scrivere; se il backup non si salva, non scrive nulla (FR-054)
2. **Given** un errore durante l'operazione, **When** il tool non riesce a completare uno o più passi, **Then** mostra quali passi sono riusciti e quali no, e offre le opzioni "Roll back everything" o "Keep current state" (FR-056)
3. **Given** l'utente sceglie rollback, **When** conferma l'elenco delle azioni, **Then** nome dell'agent e variabile tornano allo stato del backup, anche se l'apply si era interrotto a metà (FR-057)
4. **Given** un apply riuscito, **When** l'utente cambia idea, **Then** può annullarlo subito dalla schermata di esito oppure più tardi da History, per 30 giorni (FR-059, FR-060)
5. **Given** un backup, **When** l'utente apre History, **Then** può consultarlo, esportarlo su file, ripristinarlo o eliminarlo (FR-059)

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

### User Story 5 — Publish post-rename (Priority: P2)

Dopo il rename, l'utente pubblica gli agent che hanno canali attivi che richiedono Publish.

**Why this priority**: Senza Publish il nome non si aggiorna su Teams/M365. Il tool deve guidare questo passaggio.

**Independent Test**: Dato un agent con canale Teams attivo appena rinominato, l'utente vede il banner "Publish required", clicca Publish, e vede lo stato del publish in tempo reale.

**Acceptance Scenarios**:

1. **Given** un agent rinominato con Teams configurato, **When** il rename è completato, **Then** il tool mostra banner `⚠️ Publish required — il nome in Teams non si aggiornerà finché non pubblichi`
2. **Given** il banner Publish, **When** l'utente clicca "Publish ora", **Then** il tool invoca PvaPublish e mostra lo stato in tempo reale (in corso → completato / fallito)
3. **Given** un agent rinominato senza canali Teams/M365, **When** il rename è completato, **Then** il tool mostra `✅ Nessun Publish necessario — modifiche già attive`
4. **Given** più agent che richiedono Publish, **When** l'utente usa "Pubblica tutti", **Then** il tool esegue il publish in sequenza con stato visibile per ciascuno

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

- Cosa succede se l'utente non ha permessi per creare env variable nella solution? → Messaggio errore specifico con indicazione del ruolo necessario
- Cosa succede se `{publisher_prefix}_AgentDisplaySuffix` esiste già con un valore diverso? → Il tool mostra il valore attuale e chiede conferma prima di sovrascrivere
- Come viene calcolato il "nome base" per l'idempotenza? → Il tool legge il valore corrente di `{prefix}_AgentDisplaySuffix`, lo cerca come suffisso nel `bot.name` attuale e lo rimuove per ottenere il nome base, poi appende il nuovo valore. Se l'env variable era vuota o il suffisso non è trovato nel nome, usa `bot.name` as-is come nome base.
- Cosa succede se l'utente cancella il valore della variabile d'ambiente ma l'agent ha ancora il suffisso nel nome (es. nome `Agent [DEVS]`, valore vuoto)? → Senza intervento il tool non riconosce `[DEVS]` come suffisso e ne accoderebbe un secondo (`Agent [DEVS] [DEV]`), violando l'idempotenza (FR-007). Lo step suffisso rileva lo scostamento e propone **Replace** o **Keep and save** (FR-052). L'override vale per l'agent selezionato, è condiviso con la Preview, e si azzera alla selezione di un altro agent e dopo un apply riuscito
- Cosa succede se alcuni agent nella solution hanno già il suffisso e altri no? → Il tool mostra nella preview lo stato di ciascun agent (già rinominato / da rinominare / rinominato con suffisso diverso) e applica comunque su tutti in modo idempotente — nessun warning bloccante, massima trasparenza nella preview.
- Cosa succede se il nome base + suffisso supera 30 caratteri (limite manifest Teams)? → Warning preventivo nella preview con conteggio caratteri
- Cosa succede se la solution è managed e il PATCH fallisce? → Quasi sempre perché il publisher ha disattivato la managed property "Can be customized" per l'agent (errore `0x8004f026`). Il tool lo rileva in anticipo (chip Locked, banner), e se si tenta comunque non cambia nulla: né il nome né la variabile (FR-063, FR-064). Non esiste una correzione lato downstream: la proprietà si cambia nell'environment sorgente e arriva con un aggiornamento della solution
- Cosa succede se ci sono 50+ agent e il Publish di uno fallisce? → Gli altri continuano, il fallito viene marcato con errore nel log
- Cosa succede se l'utente disconnette l'environment durante l'operazione? → L'operazione si interrompe, lo stato parziale viene mostrato con opzione rollback dal backup
- Cosa succede se `solutioncomponent` contiene voci orfane che puntano a bot cancellati? → La membership viene risolta con FetchXML `operator="in"` sugli id noti, che ignora in sicurezza gli id inesistenti invece di fallire con "Entity Does Not Exist"
- Cosa succede se un agent non appartiene a nessuna solution unmanaged? → Compare nella riga "Agents without a solution" e resta pienamente rinominabile (FR-029)
- Cosa succede se la risoluzione della solution fallisce del tutto? → Gli agent restano elencati con solution `null`; il log riporta `Solution resolved for N/M agent(s)` così l'anomalia è diagnosticabile invece di presentarsi come lista vuota senza errori
- Cosa succede se la ricerca non trova nulla? → Messaggio esplicito che cita il termine cercato, non una tabella vuota senza spiegazione

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il tool DEVE esporre una tabella delle solution dell'environment connesso con le colonne: Display name, Name (nome univoco), Agents (conteggio), Created, Version, Publisher — ordinata per numero di agent decrescente
- **FR-002**: Il tool DEVE caricare 50+ agent in modo progressivo senza bloccare l'interfaccia
- **FR-003**: Il tool DEVE rilevare automaticamente se una solution ha la env variable `{publisher_prefix}_AgentDisplaySuffix` e mostrare warning se assente
- **FR-004**: Il tool DEVE guidare la creazione della env variable con nome fisso `{publisher_prefix}_AgentDisplaySuffix` nel publisher della solution
- **FR-005**: Il tool DEVE offrire valori predefiniti selezionabili con un click (`DEV`, `TEST`, `UAT`, `STAGING`, `PREPROD`, `PROD`) più campo testo libero (max 20 caratteri). Il suffisso è sempre reso tra parentesi quadre dopo il nome base: `Nome agent [SUFFISSO]` *(le varianti con parentesi tonde previste in origine non sono implementate, vedi clarifications)*
- **FR-006**: Il tool DEVE mostrare una preview del rename per l'agent selezionato con: nome attuale | nome base calcolato | nome finale | stato attuale (già rinominato con suffisso / da rinominare / rinominato con suffisso diverso)
- **FR-007**: Il tool DEVE applicare il rename in modo idempotente: prima legge il valore attuale di `{prefix}_AgentDisplaySuffix`, lo usa come pattern per rimuovere il suffisso eventualmente già presente in `bot.name`, poi appende il nuovo valore — questo garantisce che rieseguire l'operazione non produca nomi duplicati come "AgentName (UAT) (UAT)"
- **FR-008**: Il tool DEVE modificare per l'agent selezionato: `bot.name`, `description`, `applicationmanifestinformation` (manifest Teams se presente), env variable
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
- **FR-025**: Il tool NON DEVE filtrare `solutioncomponent` per `componenttype` allo scopo di trovare i bot — l'enum documentato non espone un valore per Bot (`380` è Environment Variable Definition). La membership DEVE essere risolta filtrando per `objectid` sugli id dei bot già noti, oppure leggendo la colonna documentata `bot.solutionid`
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

### Key Entities

- **Agent** (`bot`): nome, description, applicationmanifestinformation, canali attivi, stato pubblicazione, schemaname (immutabile), `solutionid` (solution di appartenenza, colonna documentata). È la **fonte autoritativa** per la lista degli agent dell'environment
- **Solution**: nome univoco, display name, publisher prefix e nome publisher, versione, data creazione, `ismanaged`, `isvisible`, conteggio agent, env variable suffisso
- **Environment Variable** (`{prefix}_AgentDisplaySuffix`): valore suffisso per l'ambiente, String, parte della solution
- **Backup**: snapshot pre-operazione di ciò che l'apply sovrascrive — oggi nome agent e stato della variabile d'ambiente (esistenza di definizione e valore, valore precedente, id dei record creati); description e manifest si aggiungeranno quando il tool inizierà a scriverli. Ha uno stato: `pending` (interrotto), `applied`, `partial`, `failed`, `rolled-back`
- **Log Entry**: timestamp, utente, environment, solution, agent, campo, valore prima, valore dopo, esito

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utente completa il rename di tutti gli agent di una solution (incluso setup env variable) in meno di 5 minuti, indipendentemente dal numero di agent
- **SC-002**: Il rename è idempotente — rieseguire l'operazione sullo stesso environment produce lo stesso risultato senza errori
- **SC-003**: In caso di errore parziale, l'utente riesce a tornare allo stato precedente tramite rollback in meno di 2 minuti
- **SC-004**: Il tool elimina il 100% degli errori di naming post-deploy dovuti a operazioni manuali su Copilot Studio
- **SC-005**: Un utente che non conosce la differenza tra `bot.name` e manifest Teams capisce cosa viene modificato e perché dopo aver usato il tool una sola volta
- **SC-006**: Ogni operazione è tracciata nel log — zero operazioni non registrate
- **SC-007**: Il tool funziona su solution managed in UAT e PROD **per gli agent che il publisher ha lasciato personalizzabili**. Per gli altri lo rileva prima di tentare, non cambia nulla e dice all'utente cosa chiedere al publisher *(versione originale: "senza intervento manuale sul layer unmanaged" — ipotesi smentita dal test in UAT, vedi research §3)*

---

## Assumptions

- Gli utenti usano Power Platform Pipelines per il deploy DEV→UAT→PROD
- Le solution in UAT e PROD sono managed
- Il tool opera su singolo tenant — nessuna gestione cross-tenant
- Il numero di environment per progetto è variabile (minimo 3-4) — il tool non assume struttura fissa DEV/UAT/PROD
- La soluzione Microsoft "Channel display name suffix" non è disponibile nei tenant reali (ancora in preview, ottobre 2026)
- Il nome base dell'agent non è standardizzato — varia per progetto e cliente
- I publisher prefix delle solution sono già configurati negli environment degli utenti
- Il tool è usato da utenti con diversi livelli di esperienza tecnica — l'UX deve essere autoesplicativa
- La description dell'agent (`botcomponent` tipo 15 — Custom GPT) è opzionalmente aggiornabile per ambiente con la stessa logica del nome
- Log e backup contengono dati potenzialmente sensibili (nomi agent, manifest Teams, configurazioni) — restano locali al dispositivo dell'utente, mai trasmessi esternamente
