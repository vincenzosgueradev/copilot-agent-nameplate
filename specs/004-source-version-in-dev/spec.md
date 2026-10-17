# Feature Specification: La versione si alza in DEV, non nello zip

**Feature Branch**: `004-source-version-in-dev`

**Created**: 2026-10-18 *(specifica retroattiva: costruita il 2026-10-17/18)*

**Status**: Implemented — rilascio 1.1.0 · **Verificato su un DEV reale il 2026-10-18** (la scrittura di `solution.version` funziona)

**Input**: Errore reale in UAT (*"The import solution must have a higher version than the existing solution it is upgrading"*) e osservazione dell'utente: *"se su DEV 1.0.0.2 esporto facendo bump per andare in upgrade su UAT a 1.0.0.3, ma in DEV non alzo, poi ho problemi al prossimo reimport"*. Decisione: *"ad ogni export tu in automatico devi alzare la versione come fa il portale; deve essere allineata su DEV, nel Dataverse non devi fare solo il file; segui la linea Microsoft."*

**Estende**: [001](../001-agent-rename-manager/spec.md) FR-073 (bump di versione) — **lo sostituisce**. **Introduce** l'eccezione FR-067a alla regola "il tool non scrive su Dataverse".

---

## Il problema

La 001 incrementava `<Version>` **solo dentro l'artefatto**. DEV restava a `1.0.0.2` mentre UAT riceveva `1.0.0.3`:

1. All'export successivo il tool riparte da `1.0.0.2`, produce di nuovo `1.0.0.3` — la versione che UAT ha già — e l'Upgrade fallisce.
2. Se intanto in DEV la versione sale davvero a `1.0.0.3`, esistono **due contenuti diversi sotto lo stesso numero**: non si sa più quale sia in UAT.
3. Nulla lega la versione dell'artefatto a quella di DEV e del source control.

Una seconda conseguenza, che l'utente ha scoperto importando: senza una versione **più alta** l'import può essere solo un **Update**, che non rimuove mai componenti. Gli agent cancellati in DEV restavano in UAT (da 5 a 3 in DEV, ancora 5 in UAT).

Microsoft imposta la versione **nella solution sorgente**: il pannello di export la propone già incrementata, `pac solution online-version` e i Build Tools la scrivono nell'ambiente, ALM Accelerator preserva quella esportata (research §1).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Alzare la versione in DEV a ogni export, in automatico (Priority: P1)

Per ogni packaging il tool **propone** il numero successivo (`1.0.0.2` → `1.0.0.3`), con l'opzione **accesa per default**, lo scrive nella solution unmanaged di DEV **prima** dell'export, lo rilegge e poi esporta. Lo zip porta la versione di DEV.

**Why this priority**: è il difetto dell'utente, e l'unico modo di tenere DEV, artefatto e target allineati.

**Independent Test**: solution a `1.0.0.2`, opzioni di default → in DEV la versione diventa `1.0.0.3` **prima** della chiamata di export; lo zip managed e l'unmanaged hanno `<Version>1.0.0.3</Version>`; il manifest ha `versionChange {from: 1.0.0.2, to: 1.0.0.3, changed: true}`.

**Acceptance Scenarios**:

1. **Given** una solution a `1.0.0.2`, **When** si apre il passo del suffisso, **Then** l'opzione "Raise the version in DEV" è accesa e il campo propone `1.0.0.3`, modificabile.
2. **Given** una versione scelta a mano (`2.0.0.0`), **When** si costruisce il package, **Then** in DEV viene scritta esattamente quella e lo zip la porta.
3. **Given** l'opzione spenta, **When** si costruisce il package, **Then** non c'è nessuna scrittura e lo zip porta la versione che DEV ha già; il manifest ha `versionChange: null`.
4. **Given** il pacchetto costruito, **When** si apre la revisione, **Then** dice che la versione verrà **scritta in DEV prima dell'export**; il pulsante che avvia il packaging è la conferma.

---

### User Story 2 — Rifiutare una versione sbagliata (Priority: P1)

Una versione che non è formata da quattro numeri o non è **strettamente più alta** di quella di DEV blocca il pulsante e dice perché.

**Independent Test**: `''`, `abc`, `1.0`, `1.0.0.2` (uguale), `1.0.0.1` (più bassa) → Next spento, messaggio chiaro, nessun avanzamento; correggendo il valore si sblocca.

**Acceptance Scenarios**:

1. **Given** un campo vuoto, **Then** il messaggio è "Enter a version."
2. **Given** un valore non valido, **Then** il messaggio è "Use four numbers separated by dots, for example 1.0.0.3."
3. **Given** un valore non più alto di DEV, **Then** il messaggio è "It must be higher than the version in DEV (1.0.0.2)."
4. **Given** l'opzione spenta, **Then** un valore non valido nel campo non blocca; riaccendendola blocca di nuovo.
5. **Given** una versione non valida con l'opzione accesa, **Then** il testo sotto l'opzione invita a correggerla invece di affermare cose false.

---

### User Story 3 — Non esportare mai con la versione non scritta (Priority: P1)

Se la scrittura non va a buon fine, **non si esporta**: DEV intatto, errore chiaro, nessun artefatto dal significato ambiguo.

**Independent Test**: scrittura rifiutata (permessi), scrittura senza effetto, DEV già più alto, solution managed, versione non valida → in nessun caso parte l'export.

**Acceptance Scenarios**:

1. **Given** una scrittura rifiutata (`prvWriteSolution`), **Then** l'errore è mostrato nell'anteprima, DEV non cambia, l'export non parte.
2. **Given** una scrittura che non cambia nulla (la rilettura non coincide), **Then** errore "… The export was not started".
3. **Given** DEV già a una versione **più alta** di quella richiesta (qualcuno l'ha alzata nel frattempo), **Then** nessuna scrittura e nessun export, con un messaggio che dice di ricaricare.
4. **Given** una solution managed, **Then** non si scrive e non si esporta.
5. **Given** un export che NON porta la versione scritta, **Then** la verifica dello zip lo respinge: DEV e artefatto non possono risultare divergenti.

---

### User Story 4 — Non alzare due volte (Priority: P2)

Il numero proposto resta **fisso per tutta l'operazione**. Tornare indietro e ricostruire non rialza la versione; se DEV ha già quel numero il tool **non riscrive**. Dopo il salvataggio la prossima operazione riparte dal numero nuovo.

**Independent Test**: costruire, tornare indietro di due passi, cambiare una scelta, ricostruire → una sola scrittura in tutto, e la nota dice "DEV was already at 1.0.0.3: nothing was written".

**Acceptance Scenarios**:

1. **Given** DEV già a `1.0.0.3`, **When** si ricostruisce chiedendo `1.0.0.3`, **Then** `changed: false` e nessuna scrittura.
2. **Given** un'operazione salvata, **When** si riapre il rename della stessa solution, **Then** il campo propone `1.0.0.4` e la solution mostra `1.0.0.3`.
3. **Given** un'altra solution, **When** la si apre, **Then** la proposta si ricalcola dalla sua versione.
4. **Given** un utente che ha scritto una versione a mano, **When** torna indietro e avanti, **Then** la scelta si conserva.

---

### User Story 5 — Capire che cosa succede agli agent cancellati (Priority: P1)

Il testo sotto l'opzione e nella revisione dice la **conseguenza che sorprende**: senza alzare la versione il target può importare solo come *Update*, che non rimuove componenti, quindi gli agent cancellati nell'origine **restano** in UAT; alzandola si importa come *Upgrade* (l'azione predefinita) che li rimuove, mentre *Update* e *Stage for upgrade* li mantengono.

**Acceptance Scenarios**:

1. **Given** l'opzione accesa, **Then** il testo contiene `1.0.0.2 → 1.0.0.3`, "in DEV before the export", "Upgrade", "removed too", "Update and Stage for upgrade keep them".
2. **Given** l'opzione spenta, **Then** contiene "stays as it is in DEV and in the package", "Update", "never removes components", "deleted in the source", e non "Upgrade".
3. **Given** la revisione, **Then** ripete esattamente lo stesso testo.

---

### User Story 6 — Lo stesso package per un secondo ambiente (Priority: P3)

Per costruire la stessa versione per UAT e poi per PROD, la seconda volta si **spegne** l'opzione: DEV è già al numero giusto e lo zip lo porta. La schermata del risultato lo spiega; i due artefatti si distinguono per suffisso nel nome e per hash nel manifest.

**Independent Test**: prima operazione UAT (→ `1.0.0.3`), seconda PROD con l'opzione spenta → una sola scrittura in tutto, due zip `…_1_0_0_3_managed_UAT.zip` e `…_1_0_0_3_managed_PROD.zip`.

---

### Edge Cases

- `1.0.0.9` → `1.0.0.10` (il confronto è **numerico**, non di testo).
- Nome della solution con apice (`o'neil`): l'apice è raddoppiato nel filtro OData.
- La solution non esiste o ce n'è più di una con quel nome: errore.
- Spazi attorno alla versione: ignorati e tolti prima di scrivere.
- Elenco degli artefatti nel passo del suffisso: mostra il nome col numero che avrà il package.
- Le fasi dell'avanzamento hanno una prima fase "Raise the version in DEV" solo quando la versione si alza.
- Headless: `options.newVersion` (stringa o `null`); `bumpVersion` non esiste più.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(sostituisce 001 FR-073)*: La versione DEVE alzarsi **nella solution sorgente (DEV)**, non solo nello zip. A ogni packaging il tool DEVE proporre, con l'opzione accesa di default, l'incremento dell'ultimo segmento, modificabile come nel pannello di export. Se attiva, DEVE scrivere la versione sulla solution unmanaged di DEV **prima** di esportare, rileggerla, e solo dopo esportare. NON DEVE modificare `<Version>` dentro il package.
- **FR-002** *(001 FR-073b)*: La versione scelta DEVE essere `major.minor.build.revision` (quattro numeri) e **strettamente maggiore** di quella corrente; altrimenti la schermata non procede e spiega perché. Con l'opzione spenta nulla si controlla.
- **FR-003** *(001 FR-073b)*: Se DEV ha già la versione richiesta il tool NON DEVE riscrivere; se ha una versione **più alta** DEVE fermarsi prima di esportare. Il valore proposto resta fisso per tutta l'operazione.
- **FR-004** *(001 FR-067a)*: **Eccezione dichiarata** alla regola "nessuna scrittura": il tool PUÒ scrivere un solo campo, `version` della solution **unmanaged sorgente** in DEV. NON DEVE scrivere sulla versione di una solution managed né di un altro ambiente, e DEVE fermarsi con un messaggio chiaro se non ha il permesso.
- **FR-005**: Se la scrittura fallisce, non ha effetto alla rilettura, o la solution è managed, il tool NON DEVE avviare l'export.
- **FR-006** *(001 FR-073c)*: La verifica DEVE controllare che `solution.xml` porti la versione scelta in **entrambi** gli archivi. La revisione DEVE dire che la versione verrà scritta in DEV prima dell'export.
- **FR-007** *(001 FR-073a)*: Il testo sulla versione DEVE dire la conseguenza sui componenti cancellati nell'origine (Update vs Upgrade vs Stage for upgrade), sotto l'opzione e nella revisione, identico.
- **FR-008**: Manifest e storico DEVONO registrare `versionChange: { from, to, changed } | null` e `options.newVersion`.
- **FR-009**: La schermata del risultato DEVE spiegare che per costruire la stessa versione per un altro ambiente si spegne l'opzione; i nomi degli archivi (anche nell'elenco del passo del suffisso) DEVONO portare la versione che il package avrà.
- **FR-010**: Dopo il salvataggio la versione della solution mostrata DEVE essere quella nuova, e la prossima operazione DEVE ripartire da lì.
- **FR-011**: L'interfaccia headless DEVE accettare `options.newVersion` e applicare le stesse regole.

### Key Entities

- **VersionChange** — `{ from, to, changed }`: `changed: false` se DEV aveva già `to`.
- **Piano della versione** — `versionFrom` (fissa per l'operazione), `raiseVersion`, `versionInput`/`versionTouched`, `newVersion` (`null` se non si alza o non è valida).

## Success Criteria *(mandatory)*

- **SC-001**: In ogni caso con la versione da alzare, la scrittura in DEV **precede** l'export (ordine verificato sugli eventi), avviene **una sola volta** anche rilanciando, e lo zip managed e unmanaged portano la versione scritta.
- **SC-002**: In nessuno dei cinque casi d'errore (permessi, nessun effetto, DEV più alto, managed, versione non valida) parte l'export.
- **SC-003**: Tutte le combinazioni di versione corrente × candidata (valida/non valida, più alta/uguale/più bassa) producono l'esito dell'oracolo, con confronto numerico.
- **SC-004**: Il difetto d'origine non è più producibile: due export successivi non possono generare la stessa versione se non l'utente spegne l'opzione (e allora DEV ha già quel numero).
- **SC-005**: *Verificato a mano il 2026-10-18 su un DEV reale*: la scrittura di `solution.version` è accettata e il package esce con la versione nuova.

## Assumptions

- `solution.version` è scrivibile per una solution unmanaged tramite `dataverseAPI.update('solution', id, { version })`: lo fanno `pac solution online-version` e i Build Tools; **confermato su un DEV reale**.
- L'utente che esegue il tool ha il privilegio di modificare la solution (altrimenti l'errore lo dice).
- Il numero proposto (+1 all'ultimo segmento) è una proposta, non una politica: l'utente può scrivere qualunque versione valida e più alta.
