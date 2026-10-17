# Feature Specification: Publish on import per agent

**Feature Branch**: `003-per-agent-publish-on-import`

**Created**: 2026-10-18 *(specifica retroattiva: costruita il 2026-10-17)*

**Status**: Implemented — rilascio 1.1.0

**Input**: Richiesta dell'utente (2026-10-17): *"essendo multi agente devi poter settare ogni agente con setting indipendenti, almeno per il publish; … voglio il toggle più immediato, e il toggle di sotto che senso ha?"*

**Estende**: [001](../001-agent-rename-manager/spec.md) FR-090 (publish on import a tre stati) · **Dipende da**: [002](../002-solution-wide-rename/spec.md).

---

## Il problema

`publishOnImport` (in `bots/<schema>/configuration.json`) decide se l'agent **si ripubblica da solo all'import**, e quindi se il nome nuovo arriva davvero su Teams e M365 Copilot (research 001 §11–§12). La 001 offriva **un solo interruttore per l'intera solution**. Con più agent non basta: dipende dalla storia di ciascuno — uno già pubblicato (`true`), uno appena creato che non ha mai avuto canali (chiave assente), uno che deve restare com'è.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Scegliere il publish di ogni agent (Priority: P1)

Accanto a ogni agent compare un toggle a tre stati, sempre visibile: *Leave as is* · *Force yes* · *Force no*. Il valore di partenza è *Leave as is*.

**Why this priority**: è il requisito esplicito dell'utente.

**Independent Test**: due agent, uno `Force yes` e uno `Force no` → nello zip `agent1.publishOnImport = true`, `agent2 = false`, e nessun'altra chiave dei due `configuration.json` cambia.

**Acceptance Scenarios**:

1. **Given** un agent con `publishOnImport` assente, **When** si sceglie *Force yes*, **Then** la chiave viene aggiunta con `true`.
2. **Given** un agent che ha già `true`, **When** si sceglie *Force yes*, **Then** il file non viene riscritto (nessun cambio).
3. **Given** *Leave as is*, **When** si costruisce il package, **Then** il `configuration.json` di quell'agent resta byte-identico.
4. **Given** un agent escluso dal rename (spec 002), **When** si costruisce il package, **Then** non riceve nessuna modifica, nemmeno a `publishOnImport`.

---

### User Story 2 — Impostare lo stesso valore per tutti con un gesto (Priority: P2)

L'**ultima riga della stessa tabella**, incolonnata sotto i toggle di riga, applica lo stesso valore a tutti gli agent spuntati. Quel toggle si **accende** quando tutti gli agent spuntati hanno lo stesso valore e resta spento quando sono misti o nessuno è spuntato.

**Why this priority**: con venti agent il gesto singolo evita venti clic; ma deve dire la verità sullo stato.

**Independent Test**: "per tutti" su *Force yes* → tutte le righe accese su *Force yes* e il toggle "per tutti" acceso; cambiando una riga il toggle "per tutti" si spegne; riportandola uguale si riaccende.

**Acceptance Scenarios**:

1. **Given** tutte le righe su *Leave as is*, **When** si apre la schermata, **Then** il toggle "per tutti" è acceso su *Leave as is*.
2. **Given** un agent escluso con un valore diverso, **When** si guardano gli agent spuntati, **Then** l'escluso non spegne il toggle.
3. **Given** "per tutti" applicato mentre un agent è escluso, **When** lo si riattiva, **Then** ritrova il valore che aveva prima.
4. **Given** nessun agent spuntato, **Then** il toggle "per tutti" non è acceso.

---

### User Story 3 — Vedere il valore che il package avrà (Priority: P2)

L'anteprima mostra, per ogni agent, **solo il valore finale** del publish (e i suoi canali); il valore di partenza sta già nella tabella dei cambi. La revisione ha una colonna col valore effettivo di ogni agent.

**Independent Test**: *Force yes* su un agent con chiave assente → l'anteprima mostra `yes`, non `not specified → yes`.

**Acceptance Scenarios**:

1. **Given** *Leave as is* su un agent con chiave assente, **When** si guarda l'anteprima, **Then** mostra `not specified`.
2. **Given** agent che non pubblicheranno all'import, **When** si guarda l'anteprima, **Then** l'avviso su Teams e M365 li nomina.

---

### User Story 4 — Il valore scritto viene riverificato (Priority: P2)

Dopo aver costruito lo zip, la verifica **rilegge** il `publishOnImport` di ogni agent e lo confronta con quello scelto. Prima verificava solo i nomi: un valore finito nel posto sbagliato sarebbe passato.

**Acceptance Scenarios**:

1. **Given** uno zip con `publishOnImport` diverso da quello previsto per quell'agent, **When** si verifica, **Then** la verifica fallisce.
2. **Given** due valori scambiati tra due agent, **When** si verifica, **Then** la verifica fallisce.
3. **Given** una chiave mancante dove doveva esserci, o un `configuration.json` illeggibile, **Then** la verifica fallisce.

---

### Edge Cases

- Chiave assente = "non specificato": il comportamento di default all'import **non è documentato da Microsoft** (28 agent su 40 nel tenant di riferimento non la hanno); il tool non promette un esito.
- Un agent mai collegato a un canale non ha `channels`: con `publishOnImport = true` il nome non ha comunque dove arrivare (si vede nel pannello: `Channels: none`).
- I record storici precedenti non hanno `publishByAgent`: restano leggibili.
- L'API headless accetta `publishByAgent` per `schemaName`.
- Esiste ancora un valore di partenza nel modello (`publishOnImport`) per gli agent senza scelta esplicita; la schermata non lo espone più come interruttore separato.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(001 FR-090a)*: Ogni agent incluso DEVE avere un proprio toggle a tre stati (*lascia com'è*, *forza true*, *forza false*), sempre visibile accanto al nome, senza menu a tendina. Non c'è un interruttore generale separato.
- **FR-002**: L'ultima riga della **stessa tabella**, nella stessa colonna dei toggle di riga e con gli stessi tre pulsanti, DEVE applicare un valore a tutti gli agent spuntati. Il suo stato attivo è il valore **comune** degli agent spuntati; nessuno se sono misti o non ce n'è nessuno spuntato.
- **FR-003**: Un agent con *lascia com'è* NON DEVE avere il suo `configuration.json` modificato; un agent escluso NON DEVE ricevere alcuna modifica. Una scelta uguale al valore già presente NON DEVE produrre un cambio.
- **FR-004**: Il piano DEVE contenere una riga `publishOnImport` solo quando il valore effettivo è `force-*` **e** diverso da quello presente. Il file è riserializzato; nessun'altra chiave cambia.
- **FR-005** *(001 FR-075)*: La revisione DEVE mostrare il valore effettivo di ogni agent; l'anteprima solo il valore **dopo la patch**, con i canali, e un avviso che nomina gli agent che non pubblicheranno all'import.
- **FR-006** *(001 FR-077)*: La verifica DEVE rileggere il `publishOnImport` di ogni agent patchato e fallire se non coincide con quello previsto per **quell'agent**.
- **FR-007**: Le scelte DEVONO essere registrate nelle opzioni del manifest e dello storico (`publishByAgent`, per `schemaName`); le scelte esplicite di un agent escluso si conservano finché la solution resta aperta.
- **FR-008**: L'interfaccia headless DEVE accettare `options.publishByAgent` e `options.publishOnImport` (valore per gli agent senza scelta).
- **FR-009**: Il toggle DEVE usare la stessa grammatica visiva degli altri toggle dell'interfaccia (valore attivo evidenziato) e riempire la propria colonna (spec 005).

### Key Entities

- **PublishMode** — `'keep' | 'force-true' | 'force-false'`.
- **publishByAgent** — mappa `schemaName → PublishMode`; un agent assente segue `publishOnImport`.

## Success Criteria *(mandatory)*

- **SC-001**: Per ogni combinazione di valore di partenza (assente / true / false), scelta (3 stati o nessuna), valore di default e selezione, il `configuration.json` di ogni agent nello zip ha il valore previsto dall'oracolo e nessun'altra chiave cambia.
- **SC-002**: La verifica respinge ogni zip in cui il valore di un agent non coincide con quello scelto (valore diverso, scambiato, assente, illeggibile).
- **SC-003**: Lo stato acceso del toggle "per tutti" coincide col modello in ogni passo di percorsi casuali della schermata.

## Assumptions

- `publishOnImport` è un campo reale del `BotConfiguration` ma **non documentato** da Microsoft (research 001 §12).
- L'effetto reale all'import di un valore assente o forzato non è verificabile senza un import in UAT: il test importante resta importare un package con valori diversi e controllare come si pubblicano gli agent.
