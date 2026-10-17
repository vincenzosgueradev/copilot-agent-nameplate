# Feature Specification: Perfezionamenti di flusso e layout

**Feature Branch**: `005-flow-and-layout-refinements`

**Created**: 2026-10-18 *(specifica retroattiva: costruita il 2026-10-17 su segnalazioni dell'utente, schermata per schermata)*

**Status**: Implemented — rilascio 1.1.0

**Input**: Una serie di segnalazioni visive dell'utente durante le prove, ciascuna con uno screenshot: tabella e toggle "appiccicati a sinistra", "funzioni globali sotto e non sopra", "revisione a due colonne a metà schermata", "le fasi scattano insieme", "What gets changed più organizzato per agent", "la schermata non riparte dall'alto", "un nome va a capo", "testi che non sfruttano la larghezza".

**Estende**: [001](../001-agent-rename-manager/spec.md) FR-044 e la Constitution VII (*Enterprise UI & Navigation*). **Riguarda** le spec [002](../002-solution-wide-rename/spec.md) e [003](../003-per-agent-publish-on-import/spec.md).

---

## Perché una specifica a parte

Sono requisiti **di presentazione**, non di dominio: non cambiano ciò che il package contiene, cambiano quanto l'utente capisce di ciò che sta per fare. Mettere per iscritto *"uno sotto l'altro, a tutta larghezza"* serve a due cose: un'interfaccia coerente (la constitution lo chiede) e test che impediscano di tornare indietro per distrazione.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Le tabelle usano tutta la larghezza (Priority: P1)

La tabella degli agent divide la larghezza tra le colonne (checkbox stretta, Agent e Nome risultante ~30% ciascuno, il resto al toggle) e il toggle del publish riempie la propria colonna con tre pulsanti uguali, nelle righe e nella riga "per tutti". Il piede della tabella è una **riga della stessa tabella**.

**Why this priority**: lo screenshot mostrava le colonne ammucchiate a sinistra e un vuoto a destra, con le azioni globali nell'intestazione.

**Independent Test**: la tabella ha layout fisso e quattro colonne definite; il toggle ha `display:flex; width:100%` e i pulsanti `flex:1`; il piede è in `<tfoot>`, non in `<thead>`.

**Acceptance Scenarios**:

1. **Given** il passo del suffisso, **When** si guarda la tabella, **Then** le colonne non sono raggruppate a sinistra.
2. **Given** le azioni globali, **When** si cercano, **Then** stanno nell'ultima riga della tabella, incolonnate sotto i toggle di riga, mai nell'intestazione.
3. **Given** un nome lungo, **When** il nome risultante supera lo spazio, **Then** non va a capo: si restringe la colonna dell'agent.

---

### User Story 2 — Revisione e anteprima uno sotto l'altro (Priority: P1)

I pannelli *Rename* e *Options* della revisione stanno **uno sotto l'altro, a tutta larghezza**, come negli altri passi; nessuna griglia a due colonne a metà schermata, nessuna colonna tagliata.

**Independent Test**: nella revisione non esiste `.two-col`; ci sono due pannelli figli di `.stack`.

---

### User Story 3 — "What gets changed" per agent (Priority: P1)

L'anteprima raggruppa le modifiche **per agent**: un blocco per agent toccato (titolo = nome finale, schema, numero di cambi) con righe *Name* e, se cambia, *Publish on import*, ciascuna con il percorso del file sotto; gli agent esclusi sono nominati sotto, senza blocco. La versione **non** è un blocco: è una nota ("Version raised in DEV…").

**Acceptance Scenarios**:

1. **Given** tre agent di cui uno escluso, **Then** ci sono due blocchi in ordine di nome finale e la riga "Left as they are: …".
2. **Given** la versione alzata, **Then** una nota dice `da → a`; **Given** la versione non toccata, **Then** nessuna nota.
3. **Given** il blocco di un agent, **Then** il percorso esatto del file toccato resta sotto ogni riga (001 FR-075).

---

### User Story 4 — Le fasi si vedono passare (Priority: P2)

Lettura dei package e patch sono istantanei e "scattavano insieme". Ogni fase resta visibile **700 ms** nella sola interfaccia; lo stato "completed" resta **1,8 s** prima dell'anteprima. Senza ascoltatore (test, headless) non c'è nessuna attesa.

**Independent Test**: osservando la fase in corso ogni 100 ms, "Read the packages" e "Patch and verify" compaiono in ordine a ≥600 ms l'una dall'altra.

---

### User Story 5 — Ogni schermata parte dall'alto (Priority: P1)

Cambiare schermata (avanti, indietro, breadcrumb) riporta in cima ogni contenitore che scorre: ogni step, la tabella dell'elenco e la tabella interna alla solution. Un ridisegno **sul posto** (digitare il suffisso, cliccare un toggle) **non** perde la posizione.

**Acceptance Scenarios**:

1. **Given** una schermata scorsa in fondo, **When** si passa alla successiva o si torna indietro, **Then** parte dall'alto.
2. **Given** l'utente a metà pagina, **When** digita nel campo del suffisso o clicca un toggle, **Then** la pagina non si muove.

---

### User Story 6 — Il testo usa la larghezza e il piede ha margini (Priority: P3)

Le descrizioni degli artefatti non hanno una larghezza massima; il piede del pannello della solution ha gli stessi margini laterali dell'intestazione e una linea di separazione.

---

### Edge Cases

- jsdom non fa layout: i test verificano **struttura e regole**, non i pixel; l'aspetto reale resta una verifica a vista.
- I nomi con HTML restano testo in tutte queste schermate (002 FR-011).
- Con un solo agent la tabella e il toggle "per tutti" si comportano allo stesso modo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(Constitution VII)*: Le tabelle con azioni per riga DEVONO usare layout fisso e dividersi la larghezza; il toggle del publish DEVE riempire la propria colonna con pulsanti di uguale larghezza.
- **FR-002**: Le azioni che valgono per tutte le righe DEVONO stare nell'ultima riga della stessa tabella (`<tfoot>`), nella colonna che governano, non nell'intestazione.
- **FR-003**: Il nome risultante di un agent NON DEVE andare a capo; se manca spazio si restringe la colonna dell'agent.
- **FR-004**: I pannelli della revisione DEVONO stare uno sotto l'altro, a tutta larghezza.
- **FR-005** *(001 FR-075)*: "What gets changed" DEVE essere raggruppato per agent, ordinato per nome finale, con il percorso del file sotto ogni riga; gli esclusi sono nominati a parte; la versione è una nota, non un blocco.
- **FR-006** *(001 FR-075a)*: Ogni fase del packaging DEVE restare visibile 700 ms nella sola interfaccia; "completed" resta 1,8 s.
- **FR-007** *(001 FR-044)*: Ogni cambio di schermata DEVE riportare in cima tutti i contenitori che scorrono; i ridisegni sul posto NON DEVONO perdere la posizione.
- **FR-008**: Le descrizioni degli artefatti DEVONO usare l'intera riga.
- **FR-009**: Il piede di un pannello DEVE avere gli stessi margini laterali dell'intestazione.
- **FR-010**: Ogni valore mostrato DEVE comparire una sola volta nella stessa schermata (nessuna ripetizione dello stesso dato).

## Success Criteria *(mandatory)*

- **SC-001**: Le regole strutturali di FR-001…FR-005 e FR-008 sono verificate da test e da mutazioni che le rompono (tutte scoperte).
- **SC-002**: Ogni cambio di schermata dell'intero flusso, avanti e indietro, riparte da 0 in uno scenario con tutti i contenitori scorsi in fondo; i ridisegni sul posto conservano la posizione.
- **SC-003**: Le fasi "Read the packages" e "Patch and verify" sono osservabili a ≥600 ms l'una dall'altra.
- **SC-004**: L'utente conferma a vista, schermata per schermata, che il layout è quello richiesto *(controllo manuale: i test non misurano i pixel)*.

## Assumptions

- Le dimensioni reali dipendono dalla finestra di PPTB; le quote delle colonne (30%/30%/resto) sono un punto di partenza modificabile.
- Il contenitore che scorre è lo stesso per tutti gli step (`.step-panel`), più la tabella dell'elenco e quella della solution.
