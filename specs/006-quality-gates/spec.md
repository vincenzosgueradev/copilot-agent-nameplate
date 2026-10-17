# Feature Specification: Cancelli di qualità — matrici di test, test della schermata, controllo per mutazione

**Feature Branch**: `006-quality-gates`

**Created**: 2026-10-18 *(specifica retroattiva: costruita il 2026-10-17/18)*

**Status**: Implemented — dev tooling, nessun cambiamento per l'utente finale · regola in **Constitution 1.3.0 — Testing Standard**

**Input**: Richiesta dell'utente (2026-10-17): *"evidentemente non stai scrivendo e testando bene: per ogni funzione devi creare un testset completo, n×m combinazioni, tutte le possibili opzioni e setting. Non voglio bug, voglio che venga tutto testato da te prima di fare danni."* E, sulla schermata: *"il motore sì, la schermata no"*.

**Riguarda**: tutte le altre funzioni ([001](../001-agent-rename-manager/spec.md)–[005](../005-flow-and-layout-refinements/spec.md)).

---

## Il problema

Fino a quel momento le verifiche erano a pezzi: uno smoke test su un export reale e prove caso per caso. Questo ha lasciato passare difetti che l'utente ha poi trovato a mano (nomi misti, valore di publish mostrato male, versione dell'artefatto diversa da quella di DEV). Una suite che passa non dimostra niente se non fallirebbe davanti a un difetto vero.

## User Scenarios & Testing *(mandatory)*

*(Qui "utente" è chi sviluppa il tool.)*

### User Story 1 — Matrici sul motore contro un oracolo indipendente (Priority: P1)

Il piano di patch, la pipeline di packaging, l'esito per agent, il formato e la verifica sono testati su **tutte le combinazioni** delle loro dimensioni, confrontando con un oracolo scritto dalla spec, senza codice condiviso con `src/`.

**Independent Test**: `npm test` esegue le matrici (tutte le coppie di valori + campioni con seme fisso, per 1–4 agent); `npm run test:full` aggiunge il prodotto cartesiano completo (oltre 746.000 piani per due agent).

**Acceptance Scenarios**:

1. **Given** nome di partenza × publish × suffisso × eccezione per agent × default × selezione, **When** si calcola il piano, **Then** coincide con l'oracolo.
2. **Given** la pipeline vera con Dataverse e l'export sostituiti, **When** si costruisce il package, **Then** ogni entry degli zip è quella prevista, il risultato riletto è coerente, e rilanciando sul risultato l'esito è idempotente.
3. **Given** uno spazio troppo grande per il prodotto completo, **Then** si coprono **tutte le coppie** di valori più campioni riproducibili.

---

### User Story 2 — I verificatori sono testati contro ciò che devono respingere (Priority: P1)

`verifyZip` e `versionProblem` sono provati con zip e valori **sbagliati**: archivio illeggibile, entry mancante o in più, nome o publish sbagliato, valori scambiati tra agent, versione diversa, byte in coda.

**Acceptance Scenarios**: ogni input sbagliato elencato produce un esito negativo; un compressore diverso (dimensione diversa) **non** è un errore.

---

### User Story 3 — La schermata è testata come la usa l'utente (Priority: P1)

La vera `index.html` e l'app vera girano in jsdom; sono sostituiti solo Dataverse (DEV finto con le sue versioni), il file system e le API PPTB. Percorsi casuali di azioni (suffisso, preset, spunte, publish per agent, "per tutti", versione) sono confrontati **a ogni passo** con un modello scritto dalla spec e poi portati fino al salvataggio, dove si leggono manifest, storico e zip.

**Acceptance Scenarios**:

1. **Given** un percorso casuale, **When** si esegue un'azione, **Then** righe, toggle, avvisi, campo versione e stato dei pulsanti coincidono col modello.
2. **Given** un percorso che arriva al salvataggio, **Then** manifest, storico e zip coincidono con l'oracolo e la scrittura in DEV precede l'export.
3. **Given** gli scenari (cambio di solution, managed, ricerca, annullare una conferma, copie extra, HTML nei nomi, scorrimento, fasi), **Then** ciascuno difende la sua regola.

---

### User Story 4 — Il controllo per mutazione (Priority: P1)

Un comando rompe il codice di proposito, un difetto alla volta, e verifica che la suite fallisca. Un difetto che sopravvive indica un test mancante.

**Independent Test**: `npm run test:mutation` (filtrabile per parola) stampa `ok` per ogni difetto scoperto e `KO` per ogni sopravvissuto; esce con errore se ce n'è uno.

**Acceptance Scenarios**:

1. **Given** un difetto realistico (confronto invertito, controllo saltato, chiave ignorata), **Then** la suite lo scopre.
2. **Given** un file toccato dallo script, **Then** viene ripristinato dal contenuto in memoria, anche con Ctrl+C, senza usare git.
3. **Given** un'ancora che non si trova più nel codice, **Then** lo script lo dice (non lo conta come scoperto).

---

### User Story 5 — Veloce di default, esaustivo prima del rilascio (Priority: P2)

`npm test` (≈40 s) per ogni modifica; `npm run test:full` (minuti) e `npm run test:mutation` prima di ogni rilascio. La skill `/custom-publish` li esegue e **si ferma** se uno fallisce o se una mutazione sopravvive.

---

### User Story 6 — Nessun dato del tenant nei test (Priority: P2)

I package di prova sono **generati** (con la stessa struttura di un export reale); gli export veri non sono nel repository.

---

### Edge Cases

- jsdom e `fflate`: il `Uint8Array` globale e quello di `TextEncoder` sono di realm diversi in jsdom, e `fflate` scambia i file per cartelle. Lo setup li allinea (non è un difetto dell'app: nel browser il mondo è uno).
- Vitest svuota i `.css` anche con `?raw`: i test sul CSS leggono il file dal disco.
- Con le fasi finte (timer simulati) il test controlla ciò che il codice fa, non la durata percepita.
- Durante `test:mutation` `tools/src` non va toccato.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(Constitution — Testing Standard 1)*: Ogni comportamento con più dimensioni di input DEVE avere una matrice: prodotto cartesiano fino a ~10⁶ casi, altrimenti tutte le coppie di valori + campioni con seme fisso; il prodotto esaustivo resta disponibile.
- **FR-002** *(TS 2)*: Ogni matrice DEVE usare un oracolo scritto dalla spec, senza codice condiviso con `src/`.
- **FR-003** *(TS 3)*: I test di pipeline e di schermata DEVONO eseguire il codice di produzione sostituendo solo Dataverse (compresi export e versione), il file system e le API PPTB.
- **FR-004** *(TS 4)*: Ogni verificatore DEVE avere test degli input che deve respingere.
- **FR-005** *(TS 5)*: Il comando di mutazione DEVE ripristinare i file in ogni caso, riportare ogni difetto come scoperto o sopravvissuto, ed uscire con errore se uno sopravvive. Ogni funzione con logica DEVE avere le sue mutazioni nell'elenco.
- **FR-006** *(TS 6)*: Un difetto trovato a mano DEVE essere riprodotto da un test che fallisce prima della correzione.
- **FR-007** *(TS 7)*: Le fixture DEVONO essere generate; nessun export del tenant nel repository.
- **FR-008** *(TS 8)*: `npm test` e `tsc` DEVONO passare prima di ogni commit di codice; `test:full` e `test:mutation` prima di ogni rilascio, eseguiti da `/custom-publish`; `/custom-ampush` esegue `npm test`.
- **FR-009** *(TS 9)*: Ciò che i test non coprono DEVE stare nel quickstart come controllo manuale.
- **FR-010**: Esistono tre modalità: `npm test` (veloce), `npm run test:full` (esaustiva), `npm run test:mutation`; `npm run test:watch` per lo sviluppo.
- **FR-011**: Le specifiche DEVONO avere una tabella di tracciabilità requisito → codice → test.

## Success Criteria *(mandatory)*

- **SC-001**: `npm test` esegue in meno di un minuto (oggi ≈40 s, 149 test).
- **SC-002**: Il controllo per mutazione scopre il **100%** dei difetti in elenco (oggi oltre 80).
- **SC-003**: Tra le correzioni dovute alla suite, **tutte** nascono da un caso che la suite ha scoperto: nome uguale tra agent, byte in coda, publish non rilette, elenco degli artefatti con la versione vecchia (research §2).
- **SC-004**: Una modifica al codice che rompe una regola testata fa cadere un test (provato con le mutazioni).

## Assumptions

- La suite non sostituisce la prova su un ambiente reale: pixel e comportamento di Dataverse restano controlli manuali (FR-009).
- Il tempo di `test:full` e di `test:mutation` (decine di minuti) è accettato perché non si esegue a ogni modifica.
