# Feature Specification: Rename a livello di solution (più agent, un solo suffisso)

**Feature Branch**: `002-solution-wide-rename`

**Created**: 2026-10-18 *(specifica retroattiva: la funzione è stata costruita il 2026-10-17)*

**Status**: Implemented — rilascio 1.1.0

**Input**: Segnalazione dell'utente (2026-10-17): *"se nella solution hai 1 agente, agente1 [DEV], e sale in UAT rinominato agente1 [UAT], se poi crei un altro agente nella stessa solution, agente1 [DEV] e agente2 [DEV], dal menu puoi selezionarne solo 1: selezioni agente2 → agente2 [UAT], ma agente1 [DEV] resta [DEV] in UAT."*

**Estende**: [001-agent-rename-manager](../001-agent-rename-manager/spec.md). Sostituisce FR-023 (scope "singolo agent") e completa FR-076.

---

## Il problema

La 001 dichiarava lo scope del rename **il singolo agent selezionato** (FR-023). Ma il package prodotto è la **solution intera** (research 001 §12): selezionando un solo agent di una solution con due, l'artefatto usciva con **nomi misti nello stesso ambiente** — `agente2 [UAT]` accanto a `agente1 [DEV]` — senza nessun avviso. Il difetto era silenzioso: il tool dichiarava il lavoro riuscito.

Il suffisso è una proprietà dell'**ambiente di destinazione**, non del singolo agent. La documentazione Microsoft sul *Channel display name suffix* lo tratta allo stesso modo: una variabile d'ambiente per ambiente, valida per tutti gli agent che la usano ([Add a display name suffix](https://learn.microsoft.com/microsoft-copilot-studio/publication-agent-display-name-suffix)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Rinominare tutti gli agent di una solution con un suffisso (Priority: P1)

L'utente apre una solution, inserisce il suffisso (`UAT`) una volta, e **ogni agent** della solution riceve lo stesso suffisso nel package.

**Why this priority**: è il difetto da cui nasce la funzione; senza, il tool produce package incoerenti.

**Independent Test**: solution con due agent `agente1 [DEV]` e `agente2 [DEV]`, suffisso `UAT` → il package contiene `agente1 [UAT]` e `agente2 [UAT]`.

**Acceptance Scenarios**:

1. **Given** una solution con N agent, **When** l'utente apre il passo del suffisso, **Then** vede tutti gli N agent, tutti spuntati, ciascuno col nome che avrà.
2. **Given** il suffisso digitato (anche con spazi attorno o con caratteri `&`, `<`), **When** l'utente prosegue, **Then** ogni agent selezionato riceve ` [SUFFISSO]` dopo il nome base e un suffisso già presente viene sostituito, mai accodato.
3. **Given** un suffisso vuoto, **When** l'utente prosegue, **Then** viene tolto il suffisso finale esistente (un gruppo `[X]` per esecuzione) e la schermata lo dice.
4. **Given** un nome con un suffisso più lungo di 20 caratteri, **When** si calcola il nome, **Then** quel testo NON è considerato un suffisso e resta parte del nome.

---

### User Story 2 — Escludere esplicitamente un agent (Priority: P1)

L'utente può togliere la spunta a uno o più agent: restano **byte-identici** nel package, e il manifest lo dichiara.

**Why this priority**: a volte un agent non deve cambiare (non è destinato all'ambiente). L'esclusione deve essere una scelta dichiarata, non un effetto collaterale.

**Independent Test**: due agent, uno escluso → il package ha il nome nuovo solo per l'altro; il file dell'escluso non cambia di un byte; il manifest lo elenca con `excluded: true`.

**Acceptance Scenarios**:

1. **Given** un agent senza spunta, **When** si costruisce il package, **Then** nessun file di quell'agent è riscritto e il suo nome nel package è quello originale.
2. **Given** nessun agent spuntato, **When** l'utente tenta di proseguire, **Then** il pulsante resta spento e la schermata dice "Select at least one agent".
3. **Given** un agent escluso e poi riattivato, **When** si riapre la riga, **Then** ritrova le scelte che aveva (es. publish, spec 003).
4. **Given** un nuovo agent creato in DEV nella stessa solution, **When** si riapre il rename, **Then** è già spuntato (il default è "tutti"), così non resta indietro.

---

### User Story 3 — Rete di sicurezza: nomi misti e falsi allarmi (Priority: P1)

Se dopo il rename gli agent della solution avrebbero **suffissi diversi** (ad esempio uno escluso rimasto `[DEV]`), il tool avvisa nella revisione e **chiede una conferma esplicita** al salvataggio, registrata nel manifest. Al contrario, i casi legittimi **non** devono produrre falsi allarmi.

**Why this priority**: la rete di sicurezza è ciò che avrebbe intercettato il difetto originale; ma un avviso che scatta a vuoto viene ignorato, quindi i falsi allarmi sono un difetto a pieno titolo.

**Independent Test**: un agent escluso con `[DEV]` accanto a un agent `[UAT]` → conferma richiesta; due agent con lo stesso nome, un agent creato con il suffisso già nel nome, un agent mai collegato a un canale → **nessun** avviso.

**Acceptance Scenarios**:

1. **Given** suffissi finali diversi tra gli agent della solution (esclusi compresi), **When** l'utente salva, **Then** compare la conferma "The agents would have different suffixes"; se annulla non si scrive nulla e si resta sulla verifica.
2. **Given** due agent con lo **stesso display name**, **When** si legge il package, **Then** il nome dell'uno nel `bot.xml` dell'altro NON è segnalato come posto sconosciuto.
3. **Given** un agent creato in Copilot Studio già come `Nome [DEV]`, il cui componente GPT porta il nome **intero**, **When** si legge il package, **Then** quel componente è un posto noto (non toccato) e la schermata dei controlli dice che resta col suffisso vecchio.
4. **Given** un agent mai collegato a Teams/M365 (nel `configuration.json` mancano `channels` e `isLightweightBot`), **When** si calcola l'impronta del formato, **Then** non c'è nessuno scostamento: le chiavi si uniscono tra **tutti** gli agent e quelle due sono opzionali.
5. **Given** un nome in un posto davvero sconosciuto (un topic, una descrizione, un valore JSON), **When** si legge il package, **Then** viene ancora segnalato: la rete di sicurezza non si è indebolita.

---

### User Story 4 — Revisione e anteprima per agent (Priority: P2)

La revisione mostra una riga per agent; l'anteprima raggruppa le modifiche **per agent** (un blocco per agent toccato) e nomina a parte gli esclusi. Il dettaglio grafico è nella spec 005.

**Independent Test**: due agent, uno escluso → revisione con una riga, anteprima con un blocco e la riga "Left as they are: …".

**Acceptance Scenarios**:

1. **Given** agent selezionati, **When** si apre la revisione, **Then** ogni riga mostra nome attuale + schema, nome risultante, lunghezza su 30.
2. **Given** un nome risultante oltre 30 caratteri, **When** si mostra, **Then** è un avviso non bloccante (limite del manifest Teams).
3. **Given** nessun nome che cambia, **When** si apre la revisione, **Then** dice "No name changes" e il package si produce comunque.

---

### User Story 5 — Trovare un agent e arrivare alla sua solution (Priority: P3)

Cercando per nome un agent e cliccando il risultato si apre **la sua solution**, con quell'agent evidenziato. Non esiste più un flusso "per il solo agent".

**Acceptance Scenarios**:

1. **Given** un risultato di ricerca, **When** l'utente lo clicca, **Then** si apre la vista della solution con la riga evidenziata.
2. **Given** una solution managed o un agent senza solution, **When** si apre, **Then** il pulsante di rename non compare e la schermata spiega perché.
3. **Given** un'altra solution aperta, **When** si cambia solution, **Then** suffisso, esclusioni, scelte per agent e versione ripartono da zero; **tornando alla stessa solution** si conserva tutto.

---

### User Story 6 — Inventario e verifica con più agent (Priority: P2)

L'inventario del package considera i componenti di **tutti** gli agent come "dell'agent": la conferma "il package contiene più dell'agent" compare solo per componenti che agent non sono (cloud flow, tabelle…). Manifest e storico elencano **ogni** agent con `before`, `after` e `excluded`.

**Acceptance Scenarios**:

1. **Given** una solution con tre agent e nessun altro componente, **When** si apre l'inventario, **Then** non c'è nessuna conferma "oltre all'agent".
2. **Given** il manifest di un'operazione con un agent escluso, **When** lo si legge, **Then** l'agent escluso compare con `before == after` e `excluded: true`.

---

### Edge Cases

- **Idempotenza con suffisso vuoto**: `alpha [DEV] [X]` → `alpha [DEV]` → `alpha`: ogni esecuzione toglie *un* gruppo. Con suffisso non vuoto il risultato è un punto fisso. Non è un difetto: nel nome risultante `[DEV]` è davvero un suffisso (research §6).
- Nomi con `& < >` e perfino HTML nel nome: restano testo in ogni schermata e sono sfuggiti nell'XML.
- Un agent il cui nome non cambia: selezionato ma `no-change`, non risulta escluso.
- Agent senza solution o solution di sistema: non si offre il rename.
- Più agent con lo stesso nome nella stessa solution (Copilot Studio lo consente): nessun falso allarme.
- L'ordine di presentazione è per nome; quello del manifest e dello storico è per `schemaname` (ordine del package).

## Requirements *(mandatory)*

### Functional Requirements

*(La colonna "Origine" dice da quale requisito della 001 nasce o che cosa sostituisce.)*

- **FR-001** *(sostituisce 001 FR-023)*: Lo scope di un'operazione di rename DEVE essere la **solution** e quindi **tutti gli agent che contiene**. Il suffisso è **uno solo**, proprietà dell'ambiente di destinazione. Il flusso è: elenco → solution → suffisso → revisione → anteprima → verifica → salvataggio.
- **FR-002** *(001 FR-076)*: Ogni agent ha una spunta, **attiva di default**; gli esclusi restano byte-identici nel package. Almeno un agent deve restare spuntato per proseguire.
- **FR-003** *(001 FR-023a)*: Dopo il rename, se i suffissi finali degli agent della solution — esclusi compresi — differiscono, la revisione DEVE avvisare e il salvataggio DEVE richiedere una conferma esplicita, registrata nel manifest. Annullare non scrive nulla.
- **FR-004** *(001 FR-071)*: Il nome finale è `nome base letto dal package + " [" + suffisso ripulito + "]"`; un suffisso esistente (` [X]`, X di 1–20 caratteri, in coda) è sostituito; un suffisso vuoto toglie un gruppo finale; ciò che supera 20 caratteri non è un suffisso.
- **FR-005** *(001 FR-096, FR-096a)*: Il nome di un altro agent nel suo `bot.xml` e il nome del componente GPT (nome base o nome intero) sono posti noti; le chiavi di `configuration.json` si leggono da **tutti** gli agent e si uniscono; `channels` e `isLightweightBot` sono opzionali. Un display name in qualunque altro posto resta segnalato come sconosciuto.
- **FR-006** *(001 FR-091)*: L'inventario DEVE considerare i componenti di tutti gli agent come "dell'agent".
- **FR-007** *(001 FR-075)*: La revisione ha una riga per agent selezionato; gli esclusi sono nominati a parte. Il nome risultante oltre 30 caratteri è un avviso non bloccante.
- **FR-008** *(001 FR-023b)*: Aprire un agent dai risultati di ricerca DEVE aprire la **sua solution** evidenziandolo. Le solution managed e gli agent senza solution non offrono il rename e la schermata ne dice il motivo.
- **FR-009** *(001 FR-044)*: Cambiando solution lo stato dell'operazione (suffisso, esclusioni, scelte per agent, versione) riparte da zero; tornando alla stessa solution si conserva.
- **FR-010** *(001 FR-086)*: Manifest e storico DEVONO elencare **ogni** agent del package con `schemaName`, `before`, `after`, `excluded`. I record storici precedenti, senza `excluded`, restano leggibili.
- **FR-011**: Ogni nome mostrato dalla schermata DEVE restare testo (nessun HTML eseguibile), e nell'XML scritto DEVE essere sfuggito.

### Key Entities

- **AgentOutcome** — esito per agent: `schemaName`, `before`, `after`, `excluded`.
- **Selezione** — l'insieme degli agent esclusi; il default è "nessuno escluso".
- **Suffissi dopo il rename** — l'insieme dei suffissi finali che gli agent avrebbero; più di uno = nomi misti.

## Success Criteria *(mandatory)*

- **SC-001**: Per ogni combinazione di 1–4 agent, nome di partenza, suffisso, selezione e opzioni, **ogni agent selezionato** esce col nome previsto dall'oracolo e ogni escluso resta byte-identico (verificato su oltre 746.000 piani per due agent, più tutte le coppie di valori per 3 e 4).
- **SC-002**: Nessun package con suffissi misti può essere salvato senza una conferma esplicita registrata (percorsi casuali della schermata, 5 dimensioni di solution).
- **SC-003**: Nessun falso allarme sui tre casi legittimi (stesso nome, GPT col nome intero, agent mai collegato) e nessuna perdita di segnalazione sui posti sconosciuti.
- **SC-004**: Il difetto originale — `agente2 [UAT]` accanto a `agente1 [DEV]` — non è più producibile senza passare dalla conferma di FR-003.

## Assumptions

- Il package contiene l'intera solution (research 001 §12): non esiste un deploy parziale.
- Copilot Studio consente più agent con lo stesso nome in una solution ([Q&A Microsoft](https://learn.microsoft.com/answers/a/12290882)).
- Il limite di 20 caratteri per il suffisso riconosciuto è quello del formato che il tool stesso scrive (` [X]`).
