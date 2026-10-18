# Feature Specification: Icona dell'agent nelle liste

**Feature Branch**: `008-agent-icon-and-description`

**Created**: 2026-10-18

**Status**: **Implementata** (2026-10-18) · **solo l'icona**: la descrizione è stata tolta dal requisito su richiesta dell'utente (2026-10-18) · la lettura reale via Web API è provata su un DEV vero (2026-10-18, cinque agent, due architetture)

**Input**: Richiesta dell'utente (2026-10-18): *"fai nuova specifica: voglio icona agente e descrizione"*, con due screenshot: la vista della solution del tool (agent senza icona né descrizione) e la scheda *Details* di Copilot Studio (icona dell'agent, nome, descrizione "None provided").

**Estende**: [002](../002-solution-wide-rename/spec.md) (le liste di agent della solution) · **Costituzione**: Principio III (*Deep Over Broad*) e VII (*Enterprise UI*).

---

## Il problema

Gli agent nelle liste del tool sono identificati solo da un nome. Con 47 agent in un ambiente, e più agent con nomi simili in una solution (`agenteTool1 [DEV]`, `agenteTool2 [DEV]`…), il nome non basta a riconoscere l'agent giusto: Copilot Studio mostra **icona e descrizione** proprio per questo (*Details*). L'icona sta nella tabella `bot` ed è documentata; la descrizione **non** è una colonna di `bot`: sta nel **componente GPT** dell'agent (research §1–§2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Riconoscere un agent dall'icona (Priority: P1)

Nella vista della solution e nella tabella degli agent del passo del suffisso, **accanto al nome** compare l'icona dell'agent (quella impostata in Copilot Studio). Se l'agent non ha un'icona valida, compare quella generica del tool.

**Why this priority**: è la richiesta principale; è un riconoscimento immediato, a costo zero per chi legge.

**Independent Test**: una solution con tre agent, due con icona PNG valida e uno senza → due `<img>` con l'immagine giusta e una icona generica.

**Acceptance Scenarios**:

1. **Given** un agent con un'icona PNG valida, **When** si apre la solution, **Then** l'icona compare accanto al nome, in una dimensione fissa e senza deformarsi.
2. **Given** un agent senza icona, con una stringa vuota o non valida, **When** si apre la solution, **Then** compare l'icona generica e nessun errore.
3. **Given** un'icona più grande del limite documentato (136.533 caratteri base64), **When** si legge, **Then** si tratta come non valida.
4. **Given** il passo del suffisso, **When** si guarda la tabella degli agent, **Then** ogni riga ha la stessa icona della vista della solution.

---

### User Story 3 — Costo contenuto (Priority: P1)

Le immagini sono pesanti: si leggono **solo per gli agent della solution aperta**, mai per l'intero ambiente, e si tengono in memoria per la sessione finché l'agent non cambia. Un fallimento nel leggerle non impedisce di usare il tool.

**Acceptance Scenarios**:

1. **Given** un ambiente con 47 agent e una solution con 3, **When** si apre la solution, **Then** la lettura riguarda solo quei 3 agent.
2. **Given** un agent già letto e non modificato, **When** si riapre la solution, **Then** non si rilegge.
3. **Given** un agent modificato (data di modifica diversa), **When** si riapre, **Then** si rilegge.
4. **Given** la lettura che fallisce (permessi, rete), **Then** le liste funzionano con le icone generiche, e il log lo segnala come avviso.
5. **Given** la lista che appare, **Then** compare subito col nome e le icone si riempiono dopo, senza spostare le righe.

---

### User Story 4 — L'icona dove aiuta a decidere (Priority: P2)

Nella **revisione** (una riga per agent) l'icona piccola accanto al nome aiuta a riconoscere gli agent che si stanno per rinominare; nei **risultati di ricerca** l'icona precede il nome nel chip. Nell'anteprima e nel manifest **non** compaiono: non sono parte del package.

**Acceptance Scenarios**:

1. **Given** la revisione, **Then** ogni riga mostra l'icona piccola accanto al nome attuale.
2. **Given** il manifest e lo storico, **Then** non contengono immagini.

---

### Edge Cases

- L'icona è un PNG nel formato documentato; uno che non lo è (JPEG, SVG, testo) è non valido.
- Il valore base64 con spazi, a capo o prefisso `data:` si ripulisce prima di validarlo; con caratteri fuori dall'alfabeto base64 è non valido.
- Due agent con la stessa icona: ciascuno la mostra; nessuna deduplicazione necessaria.
- Un agent senza solution o in una solution managed: la lista non offre il rename (002) ma può mostrare l'icona se letta.
- L'icona **non** si scrive mai e **non** si tocca nel package (resta byte-identica, 001 FR-069).
- L'immagine non deve alterare l'ordine né l'altezza delle righe a lettura finita.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La vista della solution e la tabella degli agent del passo del suffisso DEVONO mostrare, accanto al nome di ogni agent, la sua icona; in assenza o se non valida, l'icona generica del tool.
- **FR-002**: Un'icona è **valida** solo se, ripulita, è una stringa base64 che inizia con la firma PNG (`iVBORw0KGgo`), usa solo caratteri base64 e non supera 136.533 caratteri (limite della colonna `iconbase64`). Una non valida NON DEVE mai essere inserita nel documento.
- **FR-003**: L'icona DEVE essere resa solo come `<img src="data:image/png;base64,…">` con l'attributo costruito dal tool: mai concatenando un valore non validato in HTML.
- **FR-004**: *(ritirato il 2026-10-18)* La descrizione dell'agent NON fa parte della funzione: l'utente ha deciso di toglierla dal requisito (non è importante, e gli agent GitHub Copilot harness non hanno il componente GPT che la contiene).
- **FR-005**: Le icone DEVONO essere lette **solo** per gli agent della solution aperta, dopo che la lista è apparsa, senza spostare le righe; la lista DEVE funzionare anche se la lettura fallisce (avviso nel log).
- **FR-006**: Il risultato DEVE essere tenuto in memoria per la sessione, per agent, e riletto solo se la data di modifica dell'agent cambia o l'utente aggiorna.
- **FR-007**: La revisione DEVE mostrare l'icona piccola accanto al nome; i risultati di ricerca l'icona nel chip.
- **FR-008**: L'icona NON DEVE comparire nel package, nel manifest, nello storico o nell'anteprima, e il tool NON DEVE scriverle su Dataverse.
- **FR-009**: La lettura DEVE usare `$select` esplicito delle sole colonne necessarie e solo per gli identificativi degli agent della solution.
- **FR-010**: *(ritirato)* La sorgente della descrizione resta documentata in research §2 per un eventuale futuro, ma il tool non la legge.

### Key Entities

- **AgentCard** — `{ iconDataUri | null }`, letta per agent; chiave di cache: `agentId + modifiedOn`.
- **Icona** — PNG base64 della colonna `bot.iconbase64`.

## Success Criteria *(mandatory)*

- **SC-001**: In ogni percorso testato, un'icona valida produce un `<img>` con esattamente quel dato e un'icona non valida non produce mai un `<img>` né HTML.
- **SC-002**: Nessun valore non valido (non PNG, con caratteri fuori alfabeto, troppo lungo, che prova a uscire dall'attributo) produce un elemento `<img>`.
- **SC-003**: Aprire una solution con N agent esegue **una** lettura per quegli N agent e nessuna per gli altri; riaprirla senza modifiche non rilegge.
- **SC-004**: Con la lettura fallita la schermata resta utilizzabile e il rename non cambia.
- **SC-005**: *Controllo manuale*: l'icona mostrata dal tool coincide con quella di Copilot Studio per almeno un agent con icona personalizzata.

## Assumptions

- `bot.iconbase64` è leggibile via Web API come stringa (Memo, fino a 136.533 caratteri); **non ancora provato** nel tool.
- Un'icona tipica pesa ~14 KB (19.436 caratteri base64 nell'agent di prova): per una solution di 3–20 agent il costo è trascurabile; per l'intero ambiente non lo sarebbe (FR-005).
- La lettura dell'icona via Web API è provata su un DEV vero (tasks T002). La descrizione è fuori ambito (non si legge).
